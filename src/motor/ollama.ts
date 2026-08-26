/**
 * Cliente minimo de la API REST de Ollama (http://localhost:11434).
 *
 * Sin SDK, sin dependencias: fetch nativo de Node 18+. Todo el trafico es a loopback.
 */
import { OPCIONES_OLLAMA, TIMEOUT_OLLAMA_MS } from '../config.js';

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
      options: { ...OPCIONES_OLLAMA },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`Ollama respondio HTTP ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const datos = (await res.json()) as { response?: string; eval_count?: number; error?: string };
  if (datos.error) throw new Error(`Ollama: ${datos.error}`);

  return {
    texto: datos.response ?? '',
    ms: Date.now() - t0,
    tokensSalida: datos.eval_count ?? 0,
  };
}

/** Mensaje de ayuda cuando falta el demonio o el modelo. */
export function mensajeAyudaOllama(url: string, modelo: string, estado: EstadoOllama): string {
  if (!estado.disponible) {
    return (
      `No puedo hablar con Ollama en ${url} (${estado.error ?? 'sin respuesta'}).\n` +
      `  1. Instalalo desde https://ollama.com/download\n` +
      `  2. Dejalo corriendo:  ollama serve\n` +
      `  3. Descarga el modelo: ollama pull ${modelo}`
    );
  }
  return (
    `Ollama esta corriendo pero no tiene el modelo "${modelo}".\n` +
    `  Descargalo con:  ollama pull ${modelo}\n` +
    `  Modelos disponibles ahora: ${estado.modelos.length > 0 ? estado.modelos.join(', ') : '(ninguno)'}`
  );
}
