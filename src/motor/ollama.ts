/**
 * Cliente minimo de la API REST de Ollama (http://localhost:11434).
 *
 * Sin SDK, sin dependencias: fetch nativo de Node 18+. Todo el trafico es a loopback.
 */
import { KEEP_ALIVE, OPCIONES_OLLAMA, TIMEOUT_OLLAMA_MS } from '../config.js';
import { existeBinario, instruccionesInstalacion } from '../utilidades/proceso.js';

export interface EstadoOllama {
  disponible: boolean;
  modelos: string[];
  version: string | null;
  error?: string;
}

/** Comprueba que el demonio este corriendo y lista los modelos ya descargados. */
export async function estadoOllama(url: string): Promise<EstadoOllama> {
  try {
    const [tags, ver] = await Promise.all([
      fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${url}/api/version`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);
    if (!tags.ok) {
      return { disponible: false, modelos: [], version: null, error: `HTTP ${tags.status}` };
    }
    const datos = (await tags.json()) as { models?: { name?: string }[] };
    const modelos = (datos.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    let version: string | null = null;
    if (ver && ver.ok) version = ((await ver.json()) as { version?: string }).version ?? null;
    return { disponible: true, modelos, version };
  } catch (e) {
    return { disponible: false, modelos: [], version: null, error: (e as Error).message };
  }
}

/** true si el modelo (con o sin tag ":latest") ya esta descargado. */
export function tieneModelo(modelos: string[], buscado: string): boolean {
  const norm = (s: string) => (s.includes(':') ? s : `${s}:latest`);
  return modelos.some((m) => norm(m) === norm(buscado));
}

export interface RespuestaGeneracion {
  texto: string;
  ms: number;
  tokensSalida: number;
  /** Milisegundos que tardo en cargar el modelo en memoria (0 si ya estaba caliente). */
  msCarga: number;
  /** Milisegundos de generacion pura, sin carga ni prompt. */
  msGeneracion: number;
  tokensPrompt: number;
  /** Tokens por segundo de generacion. Es LA metrica que dice si estas en GPU o en CPU. */
  tokensPorSegundo: number;
}

/** Un modelo actualmente cargado en memoria, segun /api/ps. */
export interface ModeloCargado {
  nombre: string;
  /** Bytes totales del modelo en memoria. */
  bytes: number;
  /** Bytes de esos que estan en VRAM. Si es 0, esta corriendo en CPU. */
  bytesVram: number;
  /** Porcentaje del modelo que esta en la GPU. */
  porcentajeGPU: number;
}

/** Que hay cargado ahora mismo y donde. Responde "por que va lento". */
export async function procesosCargados(url: string): Promise<ModeloCargado[]> {
  try {
    const res = await fetch(`${url}/api/ps`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const datos = (await res.json()) as {
      models?: { name?: string; size?: number; size_vram?: number }[];
    };
    return (datos.models ?? []).map((m) => {
      const bytes = m.size ?? 0;
      const bytesVram = m.size_vram ?? 0;
      return {
        nombre: m.name ?? '?',
        bytes,
        bytesVram,
        porcentajeGPU: bytes > 0 ? Math.round((bytesVram / bytes) * 100) : 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Una generacion no-streaming.
 *
 * Las opciones son las del brief y no se negocian: format json + temperature 0 +
 * num_ctx 2048 + num_predict 250. Es lo que mantiene la huella de VRAM baja y
 * la latencia en el orden de cientos de milisegundos en una GPU de consumo.
 */
export async function generar(
  url: string,
  modelo: string,
  sistema: string,
  prompt: string,
): Promise<RespuestaGeneracion> {
  const t0 = Date.now();
  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_OLLAMA_MS),
    body: JSON.stringify({
      model: modelo,
      system: sistema,
      prompt,
      stream: false,
      format: 'json',
      // Mantiene el modelo en memoria entre afirmaciones Y entre corridas. Sin esto,
      // cada ejecucion vuelve a pagar la carga del modelo (~40 s en disco lento).
      keep_alive: KEEP_ALIVE,
      options: { ...OPCIONES_OLLAMA },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`Ollama respondio HTTP ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const datos = (await res.json()) as {
    response?: string;
    error?: string;
    eval_count?: number;
    eval_duration?: number;
    prompt_eval_count?: number;
    load_duration?: number;
  };
  if (datos.error) throw new Error(`Ollama: ${datos.error}`);

  // Ollama informa las duraciones en nanosegundos.
  const nsAMs = (ns: number | undefined) => Math.round((ns ?? 0) / 1e6);
  const tokensSalida = datos.eval_count ?? 0;
  const msGeneracion = nsAMs(datos.eval_duration);

  return {
    texto: datos.response ?? '',
    ms: Date.now() - t0,
    tokensSalida,
    msCarga: nsAMs(datos.load_duration),
    msGeneracion,
    tokensPrompt: datos.prompt_eval_count ?? 0,
    tokensPorSegundo: msGeneracion > 0 ? Number(((tokensSalida / msGeneracion) * 1000).toFixed(1)) : 0,
  };
}

/**
 * Mensaje de ayuda cuando falta el demonio o el modelo.
 *
 * Distingue tres situaciones distintas, porque la solucion de cada una es otra:
 * Ollama no instalado, instalado pero sin responder, y respondiendo sin el modelo.
 */
export async function mensajeAyudaOllama(
  url: string,
  modelo: string,
  estado: EstadoOllama,
): Promise<string> {
  if (!estado.disponible) {
    const instalado = await existeBinario('ollama');
    if (!instalado) {
      return (
        `No encuentro Ollama en esta maquina y nada responde en ${url}.\n` +
        `  1. Instalalo:  ${instruccionesInstalacion('ollama')}\n` +
        `  2. Cerra y volve a abrir la terminal.\n` +
        `  3. Descarga el modelo:  ollama pull ${modelo}`
      );
    }
    return (
      `Ollama esta instalado pero no responde en ${url} (${estado.error ?? 'sin respuesta'}).\n` +
      `  1. Arrancalo:  ollama serve\n` +
      `     (en Windows suele arrancar solo; busca el icono en la bandeja del sistema)\n` +
      `  2. Descarga el modelo:  ollama pull ${modelo}`
    );
  }
  return (
    `Ollama responde en ${url} pero no tiene el modelo "${modelo}".\n` +
    `  Descargalo con:  ollama pull ${modelo}\n` +
    `  Modelos disponibles ahora: ${estado.modelos.length > 0 ? estado.modelos.join(', ') : '(ninguno)'}`
  );
}
