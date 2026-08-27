/**
 * Bucle de evaluacion.
 *
 * Este modulo ya no sabe QUE se audita ni CON QUE se infiere. Recibe un criterio
 * (que aporta prompt, esquema y validacion) y un motor de inferencia (que convierte
 * prompt en texto). Lo que si sabe es lo que de verdad le corresponde: reintentos,
 * cache, concurrencia y contabilidad de rendimiento.
 *
 * Secuencial por defecto. Con poca VRAM, varias generaciones en paralelo obligan a
 * Ollama a swapear KV-cache. En CPU el efecto es peor todavia: cada slot paralelo
 * mantiene su propio cache de prefijo, asi que cada uno vuelve a pagar la evaluacion
 * del prompt de sistema entero.
 */
import type { Afirmacion, OpcionesCorrida, ResultadoAfirmacion } from '../tipos.js';
import { empaquetar, type Criterio } from '../criterios/tipos.js';
import type { CacheEvaluaciones } from './cache.js';
import type { MotorInferencia } from './inferencia.js';

export interface ProgresoEvaluacion {
  hechas: number;
  total: number;
  ultimoMs: number;
  tokensPorSegundo: number;
  desdeCache: number;
}

/** Metricas agregadas de la corrida, para saber si el cuello de botella es GPU, CPU o disco. */
export interface MetricasLLM {
  msCargaModelo: number;
  tokensGenerados: number;
  msGeneracion: number;
  tokensPorSegundo: number;
  desdeCache: number;
  llamadas: number;
}

export interface ContextoEvaluacion {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  criterio: Criterio<any>;
  motor: MotorInferencia;
  cache: CacheEvaluaciones | null;
  reintentos: number;
}

export async function evaluarAfirmacion(
  afirmacion: Afirmacion,
  ctx: ContextoEvaluacion,
  metricas: MetricasLLM,
): Promise<ResultadoAfirmacion> {
  const enCache = ctx.cache?.obtener(afirmacion.texto) ?? null;
  if (enCache) {
    return { ...afirmacion, evaluacion: enCache, evaluada: true, desdeCache: true, intentos: 0, msLLM: 0 };
  }

  let intentos = 0;
  let msTotal = 0;
  let ultimoProblema = '';

  while (intentos <= ctx.reintentos) {
    intentos++;
    const prompt =
      intentos === 1
        ? ctx.criterio.construirPrompt(afirmacion.texto, afirmacion.idiomaNombre)
        : ctx.criterio.construirPromptCorreccion(afirmacion.texto, afirmacion.idiomaNombre, ultimoProblema);

    try {
      const r = await ctx.motor.generar(ctx.criterio.promptSistema, prompt);
      msTotal += r.ms;
      metricas.llamadas++;
      metricas.msCargaModelo += r.msCarga;
      metricas.tokensGenerados += r.tokensSalida;
      metricas.msGeneracion += r.msGeneracion;

      const validado = ctx.criterio.validar(r.texto);
      if (validado.ok) {
        const evaluacion = empaquetar(ctx.criterio, validado.evaluacion);
        ctx.cache?.guardar(afirmacion.texto, evaluacion);
        return {
          ...afirmacion,
          evaluacion,
          evaluada: true,
          desdeCache: false,
          intentos,
          msLLM: msTotal,
          tokensPorSegundo: r.tokensPorSegundo,
          ...(validado.ajustes.length > 0 ? { ajustes: validado.ajustes } : {}),
        };
      }
      ultimoProblema = validado.problema;
    } catch (e) {
      ultimoProblema = (e as Error).message;
      // Un fallo de red o un timeout no se arregla repitiendo el prompt de inmediato.
      if (intentos <= ctx.reintentos) await new Promise((r) => setTimeout(r, 400));
    }
  }

  return {
    ...afirmacion,
    evaluacion: null,
    evaluada: false,
    desdeCache: false,
    error: ultimoProblema || 'el modelo no devolvio un JSON valido',
    intentos,
    msLLM: msTotal,
  };
}

/**
 * Pool de trabajadores sobre las afirmaciones preseleccionadas.
 * El orden de salida es el original, sin importar en que orden terminen.
 */
export async function evaluarAfirmaciones(
  afirmaciones: Afirmacion[],
  opciones: Pick<OpcionesCorrida, 'concurrencia' | 'reintentos'>,
  ctx: Omit<ContextoEvaluacion, 'reintentos'>,
  onProgreso?: (p: ProgresoEvaluacion) => void,
): Promise<{ resultados: ResultadoAfirmacion[]; metricas: MetricasLLM }> {
  const contexto: ContextoEvaluacion = { ...ctx, reintentos: opciones.reintentos };
  const metricas: MetricasLLM = {
    msCargaModelo: 0,
    tokensGenerados: 0,
    msGeneracion: 0,
    tokensPorSegundo: 0,
    desdeCache: 0,
    llamadas: 0,
  };

  const salida: (ResultadoAfirmacion | undefined)[] = new Array(afirmaciones.length);
  const pendientes: number[] = [];

  afirmaciones.forEach((a, i) => {
    if (a.preseleccionada) {
      pendientes.push(i);
    } else {
      salida[i] = {
        ...a,
        evaluacion: null,
        evaluada: false,
        desdeCache: false,
        motivoOmision: 'no contiene ningun marcador lexico del criterio (prefiltro)',
        intentos: 0,
        msLLM: 0,
      };
    }
  });

  const total = pendientes.length;
  let siguiente = 0;
  let hechas = 0;

  const trabajador = async (): Promise<void> => {
    for (;;) {
      const posicion = siguiente++;
      if (posicion >= pendientes.length) return;
      const indice = pendientes[posicion]!;
      const r = await evaluarAfirmacion(afirmaciones[indice]!, contexto, metricas);
      salida[indice] = r;
      hechas++;
      if (r.desdeCache) metricas.desdeCache++;
      onProgreso?.({
        hechas,
        total,
        ultimoMs: r.msLLM,
        tokensPorSegundo: r.tokensPorSegundo ?? 0,
        desdeCache: metricas.desdeCache,
      });
    }
  };

  const trabajadores = Math.max(1, Math.min(opciones.concurrencia, Math.max(1, total)));
  await Promise.all(Array.from({ length: trabajadores }, () => trabajador()));

  metricas.tokensPorSegundo =
    metricas.msGeneracion > 0
      ? Number(((metricas.tokensGenerados / metricas.msGeneracion) * 1000).toFixed(1))
      : 0;

  ctx.cache?.persistir();

  const resultados = salida.map(
    (r, i) => r ?? { ...afirmaciones[i]!, evaluacion: null, evaluada: false, desdeCache: false, intentos: 0, msLLM: 0 },
  );
  return { resultados, metricas };
}
