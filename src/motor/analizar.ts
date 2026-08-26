/**
 * Motor de deteccion: recorre las afirmaciones preseleccionadas y consulta al LLM local.
 *
 * Secuencial por defecto. Con 8 GB de VRAM (o menos) lanzar varias generaciones en
 * paralelo obliga a Ollama a swapear KV-cache y la latencia se dispara. Pero cuando
 * Ollama corre en CPU, o cuando sobra VRAM, subir --concurrencia a 2-4 multiplica el
 * rendimiento: por eso es configurable en vez de estar clavado.
 *
 * Antes de llamar al modelo se consulta la cache: una afirmacion ya evaluada con el
 * mismo modelo y el mismo prompt no se vuelve a pagar.
 */
import type { Afirmacion, OpcionesCorrida, ResultadoAfirmacion } from '../tipos.js';
import type { CacheEvaluaciones } from './cache.js';
import { parsearRespuesta } from './esquema.js';
import { generar } from './ollama.js';
import { construirPromptCorreccion, construirPromptUsuario, PROMPT_SISTEMA } from './prompt.js';

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

export async function evaluarAfirmacion(
  afirmacion: Afirmacion,
  opciones: OpcionesCorrida,
  cache: CacheEvaluaciones | null,
  metricas: MetricasLLM,
): Promise<ResultadoAfirmacion> {
  const enCache = cache?.obtener(afirmacion.texto) ?? null;
  if (enCache) {
    return {
      ...afirmacion,
      evaluacion: enCache,
      evaluada: true,
      desdeCache: true,
      intentos: 0,
      msLLM: 0,
    };
  }

  let intentos = 0;
  let msTotal = 0;
  let ultimoProblema = '';

  while (intentos <= opciones.reintentos) {
    intentos++;
    const prompt =
      intentos === 1
        ? construirPromptUsuario(afirmacion.texto, afirmacion.idiomaNombre)
        : construirPromptCorreccion(afirmacion.texto, afirmacion.idiomaNombre, ultimoProblema);

    try {
      const r = await generar(opciones.urlOllama, opciones.modelo, PROMPT_SISTEMA, prompt);
      msTotal += r.ms;
      metricas.llamadas++;
      metricas.msCargaModelo += r.msCarga;
      metricas.tokensGenerados += r.tokensSalida;
      metricas.msGeneracion += r.msGeneracion;

      const validado = parsearRespuesta(r.texto);
      if (validado.ok) {
        cache?.guardar(afirmacion.texto, validado.evaluacion);
        return {
          ...afirmacion,
          evaluacion: validado.evaluacion,
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
      // Un fallo de red/timeout no se arregla repitiendo el mismo prompt de inmediato.
      if (intentos <= opciones.reintentos) await new Promise((r) => setTimeout(r, 400));
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
 * El orden de salida es siempre el original, sin importar en que orden terminen.
 */
export async function evaluarAfirmaciones(
  afirmaciones: Afirmacion[],
  opciones: OpcionesCorrida,
  cache: CacheEvaluaciones | null,
  onProgreso?: (p: ProgresoEvaluacion) => void,
): Promise<{ resultados: ResultadoAfirmacion[]; metricas: MetricasLLM }> {
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
        motivoOmision: 'no contiene ningun conector causal (prefiltro heuristico)',
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
      const r = await evaluarAfirmacion(afirmaciones[indice]!, opciones, cache, metricas);
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

  cache?.persistir();
  return { resultados: salida.map((r, i) => r ?? { ...afirmaciones[i]!, evaluacion: null, evaluada: false, desdeCache: false, intentos: 0, msLLM: 0 }), metricas };
}
