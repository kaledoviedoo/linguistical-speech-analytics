/**
 * Parseo directo de transcripciones ya existentes: .srt, .vtt y texto plano.
 * Si el archivo trae timestamps, se salta por completo el paso de transcripcion.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SegmentoTranscripcion } from '../tipos.js';

/** "00:01:02,340" o "00:01:02.340" o "01:02.340" -> segundos. */
function aSegundos(marca: string): number {
  const partes = marca.trim().replace(',', '.').split(':').map((p) => Number(p));
  if (partes.some((n) => Number.isNaN(n))) return 0;
  let s = 0;
  for (const p of partes) s = s * 60 + (p ?? 0);
  return s;
}

/** Quita etiquetas de estilo de WebVTT/SRT y entidades HTML basicas. */
function limpiarLinea(linea: string): string {
  return linea
    .replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, '')
    .replace(/<\/?[cvbi][^>]*>/gi, '')
    .replace(/<[^>]{1,40}>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\{\\an?\d\}/g, '')
    .trim();
}

const RE_TIEMPOS = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

/**
 * Parsea SRT y VTT con el mismo lector de bloques: ambos son
 * "cabecera opcional + linea de tiempos + lineas de texto + linea en blanco".
 */
export function parsearSubtitulos(contenido: string): SegmentoTranscripcion[] {
  const texto = contenido.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const bloques = texto.split(/\n{2,}/);
  const segmentos: SegmentoTranscripcion[] = [];

  for (const bloque of bloques) {
    const lineas = bloque.split('\n').map((l) => l.trimEnd());
    const idxTiempos = lineas.findIndex((l) => RE_TIEMPOS.test(l));
    if (idxTiempos === -1) continue;

    const lineaTiempos = lineas[idxTiempos] ?? '';
    const m = lineaTiempos.match(RE_TIEMPOS);
    if (!m) continue;
    const [crudoInicio, crudoFin] = m[0].split('-->');
    const inicio = aSegundos(crudoInicio ?? '0');
    const fin = aSegundos((crudoFin ?? '0').replace(/\s+.*$/, ''));

    const cuerpo = lineas
      .slice(idxTiempos + 1)
      .map(limpiarLinea)
      .filter((l) => l.length > 0);
    if (cuerpo.length === 0) continue;

    // Los subtitulos automaticos de YouTube repiten la ultima linea del cue anterior.
    const unicas: string[] = [];
    for (const l of cuerpo) if (unicas[unicas.length - 1] !== l) unicas.push(l);

    const textoCue = unicas.join(' ').replace(/\s+/g, ' ').trim();
    if (!textoCue) continue;

    const anterior = segmentos[segmentos.length - 1];
    if (anterior && anterior.texto === textoCue) {
      // Cue de "karaoke" repetido: solo extendemos el final.
      anterior.fin = Math.max(anterior.fin, fin);
      continue;
    }
    segmentos.push({ inicio, fin: Math.max(fin, inicio), texto: textoCue });
  }

  return segmentos;
}

/**
 * Texto plano sin timestamps. Se estiman tiempos con una tasa de habla tipica
 * (150 palabras/min) SOLO para poder ordenar y navegar el reporte.
 * La transcripcion se marca con timestampsReales:false y el reporte lo advierte.
 */
export function parsearTextoPlano(contenido: string): SegmentoTranscripcion[] {
  const PALABRAS_POR_SEGUNDO = 2.5;
  const parrafos = contenido
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const fuente = parrafos.length > 0 ? parrafos : [contenido.replace(/\s+/g, ' ').trim()];
  const segmentos: SegmentoTranscripcion[] = [];
  let reloj = 0;

  for (const p of fuente) {
    if (!p) continue;
    const palabras = p.split(/\s+/).length;
    const dur = Math.max(1, palabras / PALABRAS_POR_SEGUNDO);
    segmentos.push({ inicio: reloj, fin: reloj + dur, texto: p });
    reloj += dur;
  }
  return segmentos;
}

export interface ResultadoParseo {
  segmentos: SegmentoTranscripcion[];
  motor: string;
  timestampsReales: boolean;
}

export function parsearArchivoTexto(ruta: string): ResultadoParseo {
  const ext = path.extname(ruta).toLowerCase();
  const contenido = fs.readFileSync(ruta, 'utf8');

  if (ext === '.srt' || ext === '.vtt') {
    const segmentos = parsearSubtitulos(contenido);
    if (segmentos.length === 0) {
      throw new Error(
        `El archivo "${path.basename(ruta)}" parece un subtitulo pero no encontre ningun bloque con timestamps validos.`,
      );
    }
    return { segmentos, motor: ext.slice(1), timestampsReales: true };
  }

  // .txt / .md: puede traer timestamps embebidos tipo "[00:01:23] texto".
  const conMarcas = parsearTextoConMarcasEnLinea(contenido);
  if (conMarcas.length > 0) {
    return { segmentos: conMarcas, motor: 'texto-con-marcas', timestampsReales: true };
  }
  const segmentos = parsearTextoPlano(contenido);
  if (segmentos.length === 0) throw new Error(`El archivo "${path.basename(ruta)}" esta vacio.`);
  return { segmentos, motor: 'texto', timestampsReales: false };
}

/** Formato frecuente en transcripciones manuales: "[00:01:23] Lo que dijo" o "00:01:23 - Lo que dijo". */
export function parsearTextoConMarcasEnLinea(contenido: string): SegmentoTranscripcion[] {
  const RE = /^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)[\])]?\s*[-–:]?\s*(.+)$/;
  const lineas = contenido.replace(/\r\n/g, '\n').split('\n');
  const crudos: { inicio: number; texto: string }[] = [];

  for (const linea of lineas) {
    const m = linea.match(RE);
    if (!m) continue;
    const texto = limpiarLinea(m[2] ?? '');
    if (!texto) continue;
    crudos.push({ inicio: aSegundos(m[1] ?? '0'), texto });
  }

  // Exigimos al menos 3 marcas para no confundir un texto con horas sueltas.
  if (crudos.length < 3) return [];

  return crudos.map((c, i) => ({
    inicio: c.inicio,
    fin: crudos[i + 1]?.inicio ?? c.inicio + Math.max(1, c.texto.split(/\s+/).length / 2.5),
    texto: c.texto,
  }));
}
