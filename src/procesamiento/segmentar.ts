/**
 * Convierte la transcripcion (cues o chunks de Whisper) en AFIRMACIONES individuales
 * preservando el timestamp de cada una.
 *
 * Los cues de subtitulo cortan a mitad de frase, asi que primero se reconstruye el texto
 * continuo con un mapa caracter -> tiempo, se parte en oraciones, y luego cada oracion
 * recupera su inicio/fin interpolando sobre ese mapa.
 */
import type { Afirmacion, SegmentoTranscripcion } from '../tipos.js';
import { crearDetector, nombreIdioma } from './idioma.js';


/** Abreviaturas tras las que un punto NO cierra oracion. */
const ABREVIATURAS = new Set([
  'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'prof', 'gral', 'av', 'aprox', 'etc',
  'ee', 'uu', 'ee.uu', 'pag', 'num', 'art', 'cap', 'fig', 'vs', 'mr', 'mrs', 'ms', 'st',
  'jr', 'inc', 'ltd', 'co', 'ca', 'aka', 'no', 'ph', 'dept', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'ene', 'abr', 'ago', 'dic',
]);

const LARGO_MAXIMO = 420;
const LARGO_MINIMO = 15;

interface Anclaje {
  desde: number; // offset de caracter inclusive
  hasta: number; // offset exclusivo
  inicio: number; // segundos
  fin: number;
}

function construirMapa(segmentos: SegmentoTranscripcion[]): { texto: string; anclajes: Anclaje[] } {
  let texto = '';
  const anclajes: Anclaje[] = [];
  for (const s of segmentos) {
    const limpio = s.texto.replace(/\s+/g, ' ').trim();
    if (!limpio) continue;
    if (texto.length > 0) texto += ' ';
    const desde = texto.length;
    texto += limpio;
    anclajes.push({ desde, hasta: texto.length, inicio: s.inicio, fin: Math.max(s.fin, s.inicio) });
  }
  return { texto, anclajes };
}

function tiempoEn(offset: number, anclajes: Anclaje[]): number {
  if (anclajes.length === 0) return 0;
  const primero = anclajes[0]!;
  const ultimo = anclajes[anclajes.length - 1]!;
  if (offset <= primero.desde) return primero.inicio;
  if (offset >= ultimo.hasta) return ultimo.fin;

  for (const a of anclajes) {
    if (offset >= a.desde && offset < a.hasta) {
      const largo = Math.max(1, a.hasta - a.desde);
      const frac = (offset - a.desde) / largo;
      return a.inicio + frac * (a.fin - a.inicio);
    }
    if (offset < a.desde) return a.inicio; // cayo en el espacio entre dos cues
  }
  return ultimo.fin;
}

/** Corta en oraciones respetando signos de apertura del espanol y abreviaturas. */
function partirEnOraciones(texto: string): { desde: number; hasta: number }[] {
  const cortes: { desde: number; hasta: number }[] = [];
  let inicio = 0;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;

    // Consumir signos de cierre consecutivos y comillas.
    let j = i;
    while (j + 1 < texto.length && '.!?…"”»)'.includes(texto[j + 1]!)) j++;

    const siguiente = texto[j + 1];
    if (siguiente !== undefined && !/\s/.test(siguiente)) continue;

    if (ch === '.') {
      const previo = texto.slice(Math.max(0, i - 12), i).match(/([\p{L}.]+)$/u)?.[1] ?? '';
      const palabra = previo.toLowerCase().replace(/\.$/, '');
      if (ABREVIATURAS.has(palabra)) continue;
      if (previo.length === 1 && /\p{Lu}/u.test(previo)) continue; // inicial de nombre
      if (/\d$/.test(previo) && /^\s*\d/.test(texto.slice(j + 1, j + 4))) continue; // 1.500
    }

    cortes.push({ desde: inicio, hasta: j + 1 });
    inicio = j + 1;
    while (inicio < texto.length && /\s/.test(texto[inicio]!)) inicio++;
    i = inicio - 1;
  }

  if (inicio < texto.length) cortes.push({ desde: inicio, hasta: texto.length });
  return cortes;
}

/** Parte una oracion desmesurada en trozos por comas/puntos y coma, sin perder el mapeo. */
function subdividirLargas(
  rangos: { desde: number; hasta: number }[],
  texto: string,
): { desde: number; hasta: number }[] {
  const salida: { desde: number; hasta: number }[] = [];
  for (const r of rangos) {
    if (r.hasta - r.desde <= LARGO_MAXIMO) {
      salida.push(r);
      continue;
    }
    let cursor = r.desde;
    while (r.hasta - cursor > LARGO_MAXIMO) {
      const ventana = texto.slice(cursor, cursor + LARGO_MAXIMO);
      const idx = Math.max(ventana.lastIndexOf('; '), ventana.lastIndexOf(', '));
      const corte = idx > LARGO_MAXIMO * 0.4 ? cursor + idx + 1 : cursor + LARGO_MAXIMO;
      salida.push({ desde: cursor, hasta: corte });
      cursor = corte;
      while (cursor < r.hasta && /\s/.test(texto[cursor]!)) cursor++;
    }
    if (cursor < r.hasta) salida.push({ desde: cursor, hasta: r.hasta });
  }
  return salida;
}

/**
 * Gate lexico: dado el texto de una oracion, devuelve los marcadores que la hacen
 * candidata. Lo aporta el criterio activo; la segmentacion no sabe que busca.
 */
export type GateLexico = (texto: string) => string[];

export function segmentarEnAfirmaciones(
  segmentos: SegmentoTranscripcion[],
  idiomaDocumento: string,
  idiomaForzado: string | null = null,
  gateLexico: GateLexico = () => [],
): Afirmacion[] {
  const { texto, anclajes } = construirMapa(segmentos);
  if (!texto) return [];

  // El detector se construye sobre el texto completo: asi sabe que idiomas son
  // plausibles en este documento y no deja que una frase corta se vaya de rango.
  // Solo --idioma lo fuerza; `idiomaDocumento` es informativo y el detector lo recalcula.
  void idiomaDocumento;
  const detector = crearDetector(texto, idiomaForzado);

  const rangos = subdividirLargas(partirEnOraciones(texto), texto);
  const afirmaciones: Afirmacion[] = [];

  for (const r of rangos) {
    const bruto = texto.slice(r.desde, r.hasta).trim();
    if (bruto.length < LARGO_MINIMO) continue;
    if (!/\p{L}/u.test(bruto)) continue;

    const idioma = detector.detectar(bruto);
    const marcadores = gateLexico(bruto);
    const indice = afirmaciones.length;

    afirmaciones.push({
      id: `a${String(indice).padStart(4, '0')}`,
      indice,
      inicio: Number(tiempoEn(r.desde, anclajes).toFixed(2)),
      fin: Number(tiempoEn(Math.max(r.desde, r.hasta - 1), anclajes).toFixed(2)),
      texto: bruto,
      idioma,
      idiomaNombre: nombreIdioma(idioma),
      marcadoresHeuristicos: marcadores,
      preseleccionada: marcadores.length > 0,
    });
  }

  return afirmaciones;
}
