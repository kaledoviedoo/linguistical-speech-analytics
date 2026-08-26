/**
 * Deteccion automatica de idioma, 100% offline (franc: modelos de trigramas embebidos).
 *
 * franc es fiable con texto largo y ruidoso con frases sueltas: una oracion de 60
 * caracteres en espanol puede salir "gallego", "portugues" o algo mucho mas exotico.
 * Por eso la deteccion es en dos niveles:
 *
 *  1. Sobre el documento completo se calcula el idioma dominante Y una lista corta
 *     de candidatos plausibles (los idiomas que franc considera parecidos a ESTE texto).
 *  2. Un segmento solo puede cambiar de idioma si es lo bastante largo (>= 140 chars)
 *     y si el idioma detectado esta entre esos candidatos. Cualquier otra cosa hereda
 *     el idioma del documento.
 *
 * Resultado: un discurso bilingue si se etiqueta bien por tramos, pero una frase
 * corta en espanol ya no aparece marcada como un idioma que no viene al caso.
 */
import { franc, francAll } from 'franc';

/** ISO 639-3 -> ISO 639-1 para los idiomas mas frecuentes en discurso politico. */
const A_639_1: Record<string, string> = {
  spa: 'es', eng: 'en', por: 'pt', fra: 'fr', deu: 'de', ita: 'it', cat: 'ca', glg: 'gl',
  eus: 'eu', nld: 'nl', rus: 'ru', ukr: 'uk', pol: 'pl', ron: 'ro', ell: 'el', tur: 'tr',
  arb: 'ar', ara: 'ar', heb: 'he', pes: 'fa', fas: 'fa', hin: 'hi', ben: 'bn', urd: 'ur',
  ind: 'id', zsm: 'ms', jpn: 'ja', kor: 'ko', cmn: 'zh', vie: 'vi', tha: 'th', swe: 'sv',
  nob: 'no', nno: 'no', dan: 'da', fin: 'fi', ces: 'cs', slk: 'sk', hun: 'hu', bul: 'bg',
  hrv: 'hr', srp: 'sr', lit: 'lt', lav: 'lv', est: 'et', kat: 'ka', hye: 'hy', afr: 'af',
  swh: 'sw', tgl: 'tl',
};

const NOMBRES: Record<string, string> = {
  es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán', it: 'Italiano',
  ca: 'Catalán', gl: 'Gallego', eu: 'Euskera', nl: 'Neerlandés', ru: 'Ruso', uk: 'Ucraniano',
  pl: 'Polaco', ro: 'Rumano', el: 'Griego', tr: 'Turco', ar: 'Árabe', he: 'Hebreo',
  fa: 'Persa', hi: 'Hindi', bn: 'Bengalí', ur: 'Urdu', id: 'Indonesio', ms: 'Malayo',
  ja: 'Japonés', ko: 'Coreano', zh: 'Chino', vi: 'Vietnamita', th: 'Tailandés',
  sv: 'Sueco', no: 'Noruego', da: 'Danés', fi: 'Finlandés', cs: 'Checo', sk: 'Eslovaco',
  hu: 'Húngaro', bg: 'Búlgaro', hr: 'Croata', sr: 'Serbio', lt: 'Lituano', lv: 'Letón',
  et: 'Estonio', ka: 'Georgiano', hy: 'Armenio', af: 'Afrikáans', sw: 'Suajili', tl: 'Tagalo',
  und: 'Indeterminado',
};

/** Longitud minima para permitir que un segmento contradiga al documento. */
const MINIMO_PARA_CAMBIAR = 140;

export function nombreIdioma(codigo: string): string {
  return NOMBRES[codigo] ?? codigo.toUpperCase();
}

function normalizar(codigo639_3: string): string {
  if (codigo639_3 === 'und') return 'und';
  return A_639_1[codigo639_3] ?? codigo639_3;
}

/** Idioma dominante de un texto largo. Devuelve ISO 639-1 aproximado, o "und". */
export function detectarIdiomaDocumento(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length < 20) return 'und';
  return normalizar(franc(limpio, { minLength: 20 }));
}

/**
 * Idiomas que franc considera plausibles para ESTE documento (los 6 mejores).
 * Son los unicos a los que un segmento puede "escaparse" del idioma dominante.
 */
function candidatosDocumento(texto: string): Set<string> {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const set = new Set<string>();
  if (limpio.length < 20) return set;
  for (const [codigo] of francAll(limpio, { minLength: 20 }).slice(0, 6)) {
    set.add(normalizar(codigo));
  }
  return set;
}

export interface DetectorIdioma {
  /** Idioma dominante del documento (ISO 639-1 aproximado). */
  documento: string;
  /** Idioma de un segmento concreto. */
  detectar(texto: string): string;
}

/**
 * Crea un detector ligado a un documento. `idiomaForzado` (--idioma) tiene prioridad
 * absoluta: si el usuario dice que el discurso es en espanol, no se discute.
 */
export function crearDetector(textoCompleto: string, idiomaForzado: string | null = null): DetectorIdioma {
  if (idiomaForzado) {
    return { documento: idiomaForzado, detectar: () => idiomaForzado };
  }

  const documento = detectarIdiomaDocumento(textoCompleto);
  const candidatos = candidatosDocumento(textoCompleto);

  return {
    documento,
    detectar(texto: string): string {
      const limpio = texto.replace(/\s+/g, ' ').trim();
      if (limpio.length < MINIMO_PARA_CAMBIAR) return documento;

      const detectado = normalizar(franc(limpio, { minLength: 20 }));
      if (detectado === 'und') return documento;
      if (detectado === documento) return documento;
      // Solo se acepta el cambio si el idioma tambien aparece a nivel de documento.
      return candidatos.has(detectado) ? detectado : documento;
    },
  };
}
