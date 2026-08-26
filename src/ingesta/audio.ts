/**
 * Decodificacion de audio a PCM mono 16 kHz, que es lo unico que Whisper acepta.
 *
 * Se usa ffmpeg (subproceso local) para normalizar cualquier contenedor -> WAV,
 * y wavefile (JS puro) para leer las muestras sin dependencias nativas.
 */
import fs from 'node:fs';
import path from 'node:path';
// wavefile es CommonJS: en ESM hay que importarlo por defecto y desestructurar.
import wavefile from 'wavefile';
const { WaveFile } = wavefile;
import { ejecutar, errorBinarioFaltante, existeBinario } from '../utilidades/proceso.js';
import { log } from '../utilidades/log.js';

export const TASA_MUESTREO = 16000;

/** Convierte cualquier audio/video a WAV mono 16 kHz dentro del directorio de trabajo. */
export async function normalizarAWav(rutaEntrada: string, dirTrabajo: string): Promise<string> {
  const salida = path.join(dirTrabajo, 'audio-16k.wav');
  if (fs.existsSync(salida) && fs.statSync(salida).size > 1024) {
    log.detalle(`WAV normalizado ya existe: ${salida}`);
    return salida;
  }
  if (!(await existeBinario('ffmpeg'))) throw errorBinarioFaltante('ffmpeg');

  const r = await ejecutar('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', rutaEntrada,
    '-vn',
    '-ac', '1',
    '-ar', String(TASA_MUESTREO),
    '-f', 'wav',
    salida,
  ]);

  if (r.codigo !== 0 || !fs.existsSync(salida)) {
    throw new Error(`ffmpeg no pudo decodificar "${path.basename(rutaEntrada)}":\n${r.stderr.slice(0, 600)}`);
  }
  return salida;
}

/** Coleccion de muestras tal como la devuelve wavefile (tipada de forma laxa). */
type Muestras = ArrayLike<number>;

/** Lee un WAV mono 16 kHz y devuelve las muestras como Float32Array en [-1, 1]. */
export function leerWavComoFloat32(rutaWav: string): Float32Array {
  const wav = new WaveFile(fs.readFileSync(rutaWav));
  // toBitDepth('32f') deja las muestras ya normalizadas al rango [-1, 1] que espera Whisper.
  wav.toBitDepth('32f');
  const crudo = wav.getSamples() as unknown as Muestras | Muestras[];

  if (Array.isArray(crudo)) {
    // Multicanal pese a ffmpeg: mezclamos a mono.
    const canales = crudo as Muestras[];
    const primero = canales[0];
    if (!primero) throw new Error(`El WAV "${path.basename(rutaWav)}" no tiene muestras.`);
    const mono = new Float32Array(primero.length);
    for (let i = 0; i < mono.length; i++) {
      let suma = 0;
      for (const canal of canales) suma += canal[i] ?? 0;
      mono[i] = suma / canales.length;
    }
    return mono;
  }

  return Float32Array.from(crudo as Muestras);
}

/** Ruta de medio -> muestras listas para Whisper. */
export async function cargarAudio(rutaEntrada: string, dirTrabajo: string): Promise<Float32Array> {
  const wav = await normalizarAWav(rutaEntrada, dirTrabajo);
  return leerWavComoFloat32(wav);
}

/** Duracion en segundos de un buffer de muestras a 16 kHz. */
export function duracionDe(muestras: Float32Array): number {
  return muestras.length / TASA_MUESTREO;
}
