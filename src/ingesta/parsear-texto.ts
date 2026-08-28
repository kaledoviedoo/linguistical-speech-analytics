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
 * SUBTITULOS "ROLLING" DE YOUTUBE (encontrado midiendo, costo 40 minutos de CPU)
 *
 * La transcripcion automatica de YouTube no entrega cues independientes: entrega la
 * pantalla completa en cada cue, arrastrando las lineas anteriores.
 *
 *   cue 1: "On day one, we fired Joe Biden's rogue"
 *   cue 2: "On day one, we fired Joe Biden's rogue SEC Chair Gary"
 *   cue 3: "we fired Joe Biden's rogue SEC Chair Gary Gensler."
 *
 * Concatenados sin mas, cada frase aparece dos o tres veces. El mismo discurso dio 916
 * cues por subtitulos publicados y 2339 por ASR, y 1386 afirmaciones contra 376. El
 * modelo evaluo el texto triplicado durante 40 minutos.
 *
 * La deduplicacion que ya habia solo cubria cues IDENTICOS consecutivos. Aca el solape
 * es parcial, asi que hay que recortar de cada cue el prefijo que repite el final del
 * anterior, comparando palabra por palabra sin puntuacion ni mayusculas.
 */
function normalizarPalabra(p: string): string {
  // Tambien se cae el apostrofo: la ASR escribe "Bidens" donde el subtitulo publicado
  // pone "Biden's", y sin esto el solape entre ambos no se detecta.
  return p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Minimo de palabras para considerar que hay solape y no una coincidencia casual. */
const SOLAPE_MINIMO = 2;

/** Cuantas palabras del final de `anterior` repite el principio de `actual`. */
export function largoDelSolape(anterior: string, actual: string): number {
  const a = anterior.split(/\s+/).filter(Boolean).map(normalizarPalabra);
  const b = actual.split(/\s+/).filter(Boolean).map(normalizarPalabra);
  const max = Math.min(a.length, b.length);
  for (let n = max; n >= SOLAPE_MINIMO; n--) {
    let igual = true;
    for (let i = 0; i < n; i++) {
      if (a[a.length - n + i] !== b[i]) {
        igual = false;
        break;
      }
    }
    if (igual) return n;
  }
  return 0;
}

/**
 * True si el archivo esta hecho de cues que se solapan entre si. Se decide una vez sobre
 * el archivo entero y no cue por cue: un subtitulo publicado puede tener un solape
 * suelto por una repeticion real del orador, pero no en un tercio de los pares.
 */
export function pareceRolling(segmentos: SegmentoTranscripcion[]): boolean {
  let pares = 0;
  let conSolape = 0;
  for (let i = 1; i < segmentos.length; i++) {
    const a = segmentos[i - 1]!.texto;
    const b = segmentos[i]!.texto;
    if (a.split(/\s+/).length < 4 || b.split(/\s+/).length < 4) continue;
    pares++;
    if (largoDelSolape(a, b) > 0) conSolape++;
  }
  return pares >= 4 && conSolape / pares > 0.3;
}

/**
 * Recorta de cada cue el prefijo que ya se emitio.
 *
 * La comparacion NO se hace contra el cue anterior sino contra la COLA del texto ya
 * emitido: la ventana de YouTube arrastra varias lineas, asi que el cue 3 repite algo
 * que venia del cue 1 y que del cue 2 ya se recorto. Comparando solo con el vecino
 * inmediato, la mitad del solape sobrevive.
 */
const MAX_COLA = 60;

export function desolapar(segmentos: SegmentoTranscripcion[]): SegmentoTranscripcion[] {
  const salida: SegmentoTranscripcion[] = [];
  let cola: string[] = [];

  for (const s of segmentos) {
    const n = cola.length > 0 ? largoDelSolape(cola.join(' '), s.texto) : 0;
    const resto = s.texto.split(/\s+/).filter(Boolean).slice(n).join(' ').trim();
    if (!resto) {
      // El cue no aportaba nada nuevo: solo corre el final del anterior.
      const previo = salida[salida.length - 1];
      if (previo) previo.fin = Math.max(previo.fin, s.fin);
      continue;
    }
    salida.push({ ...s, texto: resto });
    cola = cola.concat(resto.split(/\s+/)).slice(-MAX_COLA);
  }
  return salida;
}

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

  return pareceRolling(segmentos) ? desolapar(segmentos) : segmentos;
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
