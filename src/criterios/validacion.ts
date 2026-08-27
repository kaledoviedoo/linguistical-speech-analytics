/**
 * Maquinaria de validacion compartida por todos los criterios.
 *
 * Construir el segundo criterio dejo a la vista que la mitad del validador causal no
 * tenia nada de causal: extraer un JSON de entre prosa, aceptar "si"/"true"/1 como
 * booleano, reescalar un score que vino en 0-100. Eso es reparacion de salidas de un
 * modelo chico, y le pasa a cualquier criterio.
 *
 * Lo que SI es propio de cada criterio —que claves espera, que enums acepta, que
 * coherencias exige— se queda en su carpeta.
 */

/**
 * Extrae el primer objeto JSON balanceado del texto.
 * Necesario porque un modelo de 3B a veces envuelve la respuesta en prosa o en un
 * bloque markdown pese a que se le pidio JSON puro.
 */
export function extraerJSON(texto: string): string | null {
  const limpio = texto.replace(/```json/gi, '').replace(/```/g, '');
  const inicio = limpio.indexOf('{');
  if (inicio === -1) return null;

  let profundidad = 0;
  let enCadena = false;
  let escapado = false;

  for (let i = inicio; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (enCadena) {
      if (escapado) escapado = false;
      else if (ch === '\\') escapado = true;
      else if (ch === '"') enCadena = false;
      continue;
    }
    if (ch === '"') enCadena = true;
    else if (ch === '{') profundidad++;
    else if (ch === '}') {
      profundidad--;
      if (profundidad === 0) return limpio.slice(inicio, i + 1);
    }
  }
  return null;
}

/** Acepta booleanos de verdad, 0/1, y las palabras que los modelos usan en su lugar. */
export function aBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'si', 'sí', 'yes', '1', 'verdadero'].includes(s)) return true;
    if (['false', 'no', '0', 'falso'].includes(s)) return false;
  }
  return null;
}

export interface ScoreNormalizado {
  valor: number;
  ajustes: string[];
}

/** Normaliza un score al rango 0-1, reescalando si vino en 0-100 y recortando si se fue. */
export function aScore(v: unknown): ScoreNormalizado | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;

  const ajustes: string[] = [];
  let valor = n;
  if (valor > 1 && valor <= 100) {
    valor = valor / 100;
    ajustes.push('score venia en escala 0-100, reescalado a 0-1');
  }
  if (valor < 0 || valor > 1) {
    valor = Math.min(1, Math.max(0, valor));
    ajustes.push('score recortado al rango 0-1');
  }
  return { valor, ajustes };
}

/** Quita tildes y espacios para comparar un enum sin depender de como lo escribio el modelo. */
export function normalizarEnum(v: unknown): string | null {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return null;
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * La justificacion es obligatoria en TODO criterio: un score sin explicacion no sirve
 * para revisar nada, que es justamente para lo que existe la herramienta.
 */
export function exigirJustificacion(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 10 ? t : null;
}

/** Cuenta cuantas de las claves esperadas faltan; sirve para fallar temprano y claro. */
export function clavesFaltantes(obj: Record<string, unknown>, claves: readonly string[]): string[] {
  return claves.filter((k) => !(k in obj));
}
