/**
 * Maquinaria del prefiltro lexico. Generica: no sabe que se busca.
 *
 * Compila la lista de patrones de un criterio a expresiones regulares una sola vez y las
 * aplica sobre texto normalizado (minusculas, sin tildes). Solo lo que trae rastro viaja
 * al modelo, que es lo que hace viable ejecutar esto en CPU.
 *
 * Cada criterio aporta su lista; este modulo aporta las piezas.
 */
export interface EntradaLexica {
  /** Patron ya normalizado (minusculas, sin tildes). Los espacios aceptan cualquier blanco. */
  patron: string;
  /** Forma legible que se muestra en el reporte. */
  etiqueta: string;
  idioma: string;
}

/** Minusculas + sin diacriticos, para que "provoco" y "provocó" coincidan igual. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/\s+/g, ' ');
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface GateLexicoCompilado {
  /** Etiquetas legibles de los patrones presentes en el texto, sin repetir. */
  detectar(texto: string): string[];
  /** Cuantos patrones tiene cargados, para el diagnostico del entorno. */
  readonly total: number;
  /** Cuantas etiquetas distintas representa. */
  readonly etiquetas: number;
}

/**
 * Compila una lista de patrones a expresiones regulares una sola vez.
 * El lookbehind/lookahead sobre \p{L} evita que "causa" dispare dentro de
 * "causalidad" o "causante".
 */
export function compilarGate(entradas: EntradaLexica[]): GateLexicoCompilado {
  const compilados = entradas.map((e) => ({
    etiqueta: e.etiqueta,
    re: new RegExp(`(?<!\\p{L})${escapar(e.patron).replace(/ /g, '\\s+')}(?!\\p{L})`, 'u'),
  }));
  const etiquetasUnicas = new Set(entradas.map((e) => e.etiqueta)).size;

  return {
    total: entradas.length,
    etiquetas: etiquetasUnicas,
    detectar(texto: string): string[] {
      const n = normalizar(texto);
      const encontrados: string[] = [];
      for (const c of compilados) {
        if (c.re.test(n) && !encontrados.includes(c.etiqueta)) encontrados.push(c.etiqueta);
      }
      return encontrados;
    },
  };
}

/**
 * Expande un verbo regular en -ar a las formas que de verdad aparecen en un discurso:
 * preterito, participios con genero y numero, gerundio y presente. Sin esto,
 * "fue provocada por la reforma" se escaparia del filtro.
 * Todas las formas comparten una unica etiqueta (el infinitivo) en el reporte.
 */
export function familiaAR(raiz: string, etiqueta: string): EntradaLexica[] {
  const sufijos = ['o', 'aron', 'ando', 'ada', 'ado', 'adas', 'ados', 'a', 'an', 'aba', 'aban'];
  return sufijos.map((sufijo) => ({ patron: raiz + sufijo, etiqueta, idioma: 'es' }));
}

/** Atajo para listas planas: [['patron', 'etiqueta'], ...] en un idioma. */
export function lista(idioma: string, pares: [string, string][]): EntradaLexica[] {
  return pares.map(([patron, etiqueta]) => ({ patron, etiqueta, idioma }));
}
