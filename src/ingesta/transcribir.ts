/**
 * Transcripcion local con Whisper cuantizado en ONNX, ejecutado DENTRO de Node
 * via Transformers.js. No hay servicio de ASR, ni API, ni upload: el audio nunca
 * sale de la maquina.
 *
 * Nota sobre la primera corrida: Transformers.js descarga el modelo ONNX desde
 * HuggingFace una unica vez y lo cachea en .models/. A partir de ahi todo funciona
 * sin red. Con AFC_SOLO_LOCAL=1 se prohibe cualquier descarga (util para auditar).
 */
import fs from 'node:fs';
import { DIR_MODELOS } from '../config.js';
import type { SegmentoTranscripcion } from '../tipos.js';
import { log, progreso } from '../utilidades/log.js';
import { formatearTiempo } from '../utilidades/rutas.js';
import { cargarAudio, duracionDe, TASA_MUESTREO } from './audio.js';

interface ChunkWhisper {
  timestamp: [number, number | null];
  text: string;
}

/** Cargado una sola vez por proceso: instanciar el pipeline es lo caro. */
let transcriptorCacheado: { modelo: string; fn: unknown } | null = null;

async function obtenerTranscriptor(modelo: string): Promise<any> {
  if (transcriptorCacheado && transcriptorCacheado.modelo === modelo) return transcriptorCacheado.fn;

  const { pipeline, env } = await import('@xenova/transformers');
  fs.mkdirSync(DIR_MODELOS, { recursive: true });
  env.cacheDir = DIR_MODELOS;
  env.allowLocalModels = true;
  if (process.env.AFC_SOLO_LOCAL === '1') env.allowRemoteModels = false;

  log.detalle(`Cargando Whisper "${modelo}" (cuantizado, ONNX) desde ${DIR_MODELOS}`);
  const fn = await pipeline('automatic-speech-recognition', modelo, { quantized: true });
  transcriptorCacheado = { modelo, fn };
  return fn;
}

export interface ResultadoTranscripcion {
  segmentos: SegmentoTranscripcion[];
  duracionSegundos: number;
  motor: string;
}

export async function transcribirMedio(
  rutaMedio: string,
  dirTrabajo: string,
  modeloWhisper: string,
  idiomaForzado: string | null,
): Promise<ResultadoTranscripcion> {
  const muestras = await cargarAudio(rutaMedio, dirTrabajo);
  const duracion = duracionDe(muestras);
  log.detalle(`Audio: ${muestras.length} muestras @ ${TASA_MUESTREO} Hz (${duracion.toFixed(1)} s)`);

  // Aviso honesto antes de empezar: en CPU, Whisper tarda del orden de la propia
  // duracion del audio. Es mejor saberlo antes que mirar una barra 40 minutos.
  log.info(
    `      Audio de ${formatearTiempo(duracion)}. En CPU la transcripcion suele tardar ` +
      `entre la mitad y el doble de eso.`,
  );
  if (duracion > 900) {
    log.aviso('Para material largo de YouTube, --preferir-subtitulos evita este paso por completo.');
  }

  const transcriptor = await obtenerTranscriptor(modeloWhisper);

  // chunk_length_s/stride_length_s son los valores recomendados para Whisper:
  // ventanas de 30 s con solape de 5 s, que es como se entrenaron los timestamps.
  const opciones: Record<string, unknown> = {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    task: 'transcribe',
  };
  if (idiomaForzado) opciones['language'] = idiomaForzado;

  // Progreso real, no inventado: Whisper procesa el audio en ventanas de 30 s que
  // avanzan 20 s cada una (30 menos el solape de 5 s por lado). Con la duracion del
  // audio se sabe cuantas ventanas hay, y chunk_callback avisa cuando cae cada una.
  const PASO_S = 30 - 5 * 2;
  const ventanasTotales = Math.max(1, Math.ceil(duracion / PASO_S));
  const t0 = Date.now();
  let ventanasHechas = 0;

  const etiqueta = (): string => {
    const transcurrido = (Date.now() - t0) / 1000;
    if (ventanasHechas === 0) return `${formatearTiempo(transcurrido)} transcurrido`;
    const restantes = Math.max(0, ventanasTotales - ventanasHechas);
    const eta = (transcurrido / ventanasHechas) * restantes;
    return `${formatearTiempo(transcurrido)} transcurrido, faltan ~${formatearTiempo(eta)}`;
  };

  opciones['chunk_callback'] = () => {
    ventanasHechas = Math.min(ventanasTotales, ventanasHechas + 1);
    progreso(ventanasHechas, ventanasTotales, etiqueta());
  };

  // Late de fondo: en audios largos pueden pasar decenas de segundos entre ventanas,
  // y una barra congelada parece un cuelgue.
  const latido = setInterval(() => progreso(ventanasHechas, ventanasTotales, etiqueta()), 2000);
  if (typeof latido.unref === 'function') latido.unref();

  let salida: { text?: string; chunks?: ChunkWhisper[] };
  try {
    salida = (await transcriptor(muestras, opciones)) as { text?: string; chunks?: ChunkWhisper[] };
  } finally {
    clearInterval(latido);
  }
  progreso(ventanasTotales, ventanasTotales, etiqueta());

  const chunks = salida.chunks ?? [];
  const segmentos: SegmentoTranscripcion[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const texto = (c.text ?? '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const inicio = Number(c.timestamp?.[0] ?? 0);
    const finCrudo = c.timestamp?.[1];
    const fin =
      finCrudo === null || finCrudo === undefined
        ? Number(chunks[i + 1]?.timestamp?.[0] ?? Math.min(duracion, inicio + 5))
        : Number(finCrudo);
    segmentos.push({ inicio, fin: Math.max(fin, inicio), texto });
  }

  if (segmentos.length === 0) {
    const completo = (salida.text ?? '').trim();
    if (!completo) throw new Error('Whisper no produjo texto. Revisa que el archivo tenga audio audible.');
    log.aviso('Whisper no devolvio timestamps por chunk; se usa un unico segmento.');
    segmentos.push({ inicio: 0, fin: duracion, texto: completo });
  }

  return { segmentos, duracionSegundos: duracion, motor: `whisper:${modeloWhisper}` };
}
