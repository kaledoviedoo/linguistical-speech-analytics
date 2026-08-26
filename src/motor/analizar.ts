/**
 * Motor de deteccion: recorre las afirmaciones preseleccionadas y consulta al LLM local.
 *
 * Secuencial a proposito. Con 8 GB de VRAM (o menos) lanzar varias generaciones en
 * paralelo obliga a Ollama a swapear KV-cache y la latencia se dispara; una detras de
 * otra con num_ctx=2048 se mantiene en el orden de decimas de segundo por afirmacion.
 */
import type { Afirmacion, OpcionesCorrida, ResultadoAfirmacion } from '../tipos.js';
import { parsearRespuesta } from './esquema.js';
import { generar } from './ollama.js';
import { construirPromptCorreccion, construirPromptUsuario, PROMPT_SISTEMA } from './prompt.js';

export interface ProgresoEvaluacion {
  hechas: number;
  total: number;
  ultimoMs: number;
}

export async function evaluarAfirmacion(
  afirmacion: Afirmacion,
  opciones: OpcionesCorrida,
): Promise<ResultadoAfirmacion> {
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
      const validado = parsearRespuesta(r.texto);
      if (validado.ok) {
        return {
          ...afirmacion,
          evaluacion: validado.evaluacion,
          evaluada: true,
          intentos,
          msLLM: msTotal,
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
    error: ultimoProblema || 'el modelo no devolvio un JSON valido',
    intentos,
    msLLM: msTotal,
  };
}

export async function evaluarAfirmaciones(
  afirmaciones: Afirmacion[],
  opciones: OpcionesCorrida,
  onProgreso?: (p: ProgresoEvaluacion) => void,
): Promise<ResultadoAfirmacion[]> {
  const salida: ResultadoAfirmacion[] = [];
  const aEvaluar = afirmaciones.filter((a) => a.preseleccionada);
  let hechas = 0;

  for (const a of afirmaciones) {
    if (!a.preseleccionada) {
      salida.push({
        ...a,
        evaluacion: null,
        evaluada: false,
        motivoOmision: 'no contiene ningun conector causal (prefiltro heuristico)',
        intentos: 0,
        msLLM: 0,
      });
      continue;
    }
    const r = await evaluarAfirmacion(a, opciones);
    salida.push(r);
    hechas++;
    onProgreso?.({ hechas, total: aEvaluar.length, ultimoMs: r.msLLM });
  }

  return salida;
}
