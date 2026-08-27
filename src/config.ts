/**
 * Configuracion central. Todo es local: no hay claves de API, ni endpoints remotos,
 * ni telemetria. Cada valor puede sobreescribirse por variable de entorno o por CLI.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Raiz del repositorio (un nivel arriba de src/). */
export const RAIZ = path.resolve(aqui, '..');

export const DIR_DATOS = process.env.AFC_DIR_DATOS
  ? path.resolve(process.env.AFC_DIR_DATOS)
  : path.join(RAIZ, 'data');

export const DIR_REPORTES = process.env.AFC_DIR_REPORTES
  ? path.resolve(process.env.AFC_DIR_REPORTES)
  : path.join(RAIZ, 'reportes');

/** Cache local de modelos ONNX de Transformers.js (no sale de la maquina). */
export const DIR_MODELOS = process.env.AFC_DIR_MODELOS
  ? path.resolve(process.env.AFC_DIR_MODELOS)
  : path.join(RAIZ, '.models');

/** API REST de Ollama corriendo en la maquina del usuario. */
// 127.0.0.1 y no localhost a proposito: Ollama escucha solo en IPv4 (su OLLAMA_HOST por
// defecto es 127.0.0.1:11434), mientras que en Windows "localhost" suele resolver primero a
// ::1. Con el servidor arriba la conexion falla igual, y el sintoma es un "fetch failed" seco.
export const URL_OLLAMA = process.env.AFC_OLLAMA_URL ?? 'http://127.0.0.1:11434';

/** Modelo LLM ultra-ligero por defecto (~2 GB en VRAM con cuantizacion Q4). */
export const MODELO_LLM = process.env.AFC_MODELO ?? 'qwen2.5:3b';

/** Whisper multilingue cuantizado en ONNX, ejecutado dentro de Node. */
export const MODELO_WHISPER = process.env.AFC_MODELO_WHISPER ?? 'Xenova/whisper-base';

/**
 * Opciones de inferencia NO NEGOCIABLES para convivir con Whisper en <= 8 GB de VRAM.
 * - temperature 0.0  -> salida determinista y reproducible.
 * - num_ctx 2048     -> huella de KV-cache minima.
 * - num_predict 250  -> la respuesta es un JSON corto; corta divagaciones.
 */
export const OPCIONES_OLLAMA = {
  temperature: 0.0,
  num_ctx: 2048,
  num_predict: 250,
} as const;

/**
 * Cuanto tiempo deja Ollama el modelo cargado en memoria tras la ultima peticion.
 * Cargar qwen2.5:3b desde disco cuesta decenas de segundos; con esto se paga una vez
 * y no en cada corrida del CLI.
 */
export const KEEP_ALIVE = process.env.AFC_KEEP_ALIVE ?? '15m';

/**
 * Peticiones simultaneas a Ollama.
 * 1 por defecto: con poca VRAM, varias generaciones a la vez obligan a swapear KV-cache.
 * Si Ollama corre en CPU o te sobra VRAM, subilo con --concurrencia 2..4.
 */
export const CONCURRENCIA_DEFECTO = Number(process.env.AFC_CONCURRENCIA ?? '1');

/** Umbral por defecto del filtro de score en el reporte. */
export const UMBRAL_DEFECTO = Number(process.env.AFC_UMBRAL ?? '0.7');

/** Reintentos ante un JSON invalido del LLM. */
export const REINTENTOS_LLM = Number(process.env.AFC_REINTENTOS ?? '2');

/** Timeout por llamada al LLM (ms). Generoso para la primera carga del modelo en VRAM. */
export const TIMEOUT_OLLAMA_MS = Number(process.env.AFC_TIMEOUT_MS ?? '120000');

/** Version del esquema de resultados.json, para invalidar caches viejas. */
export const VERSION_ESQUEMA = 1;

/** Extensiones tratadas como audio/video (requieren transcripcion). */
export const EXT_MEDIO = new Set(['.mp3', '.wav', '.m4a', '.mp4', '.webm', '.ogg', '.flac', '.mkv', '.mov', '.aac', '.opus']);

/** Extensiones tratadas como subtitulos con timestamps. */
export const EXT_SUBTITULOS = new Set(['.srt', '.vtt']);

/** Extensiones tratadas como texto plano. */
export const EXT_TEXTO = new Set(['.txt', '.md']);
