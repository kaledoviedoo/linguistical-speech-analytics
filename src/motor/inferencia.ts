/**
 * El motor de inferencia como PUERTO, no como implementacion.
 *
 * Antes, `analizar.ts` importaba el cliente de Ollama directamente. Eso tenia dos
 * costos concretos:
 *
 *  - Para testear el motor de evaluacion habia que levantar un servidor HTTP falso
 *    en el puerto 11434. Un test de logica no deberia necesitar un socket.
 *  - Cambiar de backend (llama.cpp, LM Studio, un Ollama remoto en la LAN) obligaba
 *    a tocar el bucle de evaluacion, que no tiene nada que ver con el transporte.
 *
 * Con esta interfaz, el bucle de evaluacion solo sabe "algo que convierte un prompt
 * en texto". Ollama es UNA implementacion; `motorDeGuion` es otra, para tests.
 */
import { generar as generarOllama } from './ollama.js';

export interface RespuestaInferencia {
  texto: string;
  /** Milisegundos de reloj, incluida la red. */
  ms: number;
  tokensSalida: number;
  /** Milisegundos de carga del modelo en memoria (0 si ya estaba caliente). */
  msCarga: number;
  /** Milisegundos de generacion pura. */
  msGeneracion: number;
  tokensPrompt: number;
  tokensPorSegundo: number;
}

export interface MotorInferencia {
  /** Para el log y el reporte: "ollama:qwen2.5:3b". */
  readonly descripcion: string;
  generar(sistema: string, prompt: string): Promise<RespuestaInferencia>;
}

/** Implementacion real: Ollama por su API REST local. */
export function motorOllama(url: string, modelo: string): MotorInferencia {
  return {
    descripcion: `ollama:${modelo}`,
    generar: (sistema, prompt) => generarOllama(url, modelo, sistema, prompt),
  };
}

/**
 * Motor de mentira para tests: devuelve respuestas de un guion, en orden.
 * Cuando se acaban, repite la ultima. Permite probar reintentos, JSON invalido
 * y el manejo de errores sin ningun proceso externo.
 */
export function motorDeGuion(
  guion: (string | Error)[],
  opciones: { msPorLlamada?: number } = {},
): MotorInferencia & { llamadas: { sistema: string; prompt: string }[] } {
  const llamadas: { sistema: string; prompt: string }[] = [];
  let i = 0;

  return {
    descripcion: 'guion:test',
    llamadas,
    async generar(sistema, prompt) {
      llamadas.push({ sistema, prompt });
      const paso = guion[Math.min(i, guion.length - 1)];
      i++;
      if (paso instanceof Error) throw paso;
      const texto = paso ?? '{}';
      const ms = opciones.msPorLlamada ?? 1;
      return {
        texto,
        ms,
        tokensSalida: 60,
        msCarga: 0,
        msGeneracion: ms,
        tokensPrompt: 100,
        tokensPorSegundo: 60,
      };
    },
  };
}
