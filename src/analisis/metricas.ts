/**
 * Metricas de evaluacion. Funciones puras, sin dependencias y testeables offline.
 *
 * Por que existe este archivo: hasta ahora el test del prompt decia "coincide 7 de 10",
 * y ese numero agregado esconde lo unico que importa saber. Un modelo puede acertar el
 * score y equivocarse sistematicamente en si hay comparacion — y ese error es peor,
 * porque la comparacion es la mitad de la tesis del proyecto.
 *
 * Aca se mide campo por campo.
 */

/** Conteos de una clasificacion binaria, tomando `true` como la clase positiva. */
export interface ConteoBinario {
  /** Verdaderos positivos: esperado true, obtenido true. */
  vp: number;
  /** Verdaderos negativos: esperado false, obtenido false. */
  vn: number;
  /** Falsos positivos: esperado false, obtenido true. */
  fp: number;
  /** Falsos negativos: esperado true, obtenido false. */
  fn: number;
}

export function conteoVacio(): ConteoBinario {
  return { vp: 0, vn: 0, fp: 0, fn: 0 };
}

export function acumular(c: ConteoBinario, esperado: boolean, obtenido: boolean): ConteoBinario {
  if (esperado && obtenido) c.vp++;
  else if (!esperado && !obtenido) c.vn++;
  else if (!esperado && obtenido) c.fp++;
  else c.fn++;
  return c;
}

export function total(c: ConteoBinario): number {
  return c.vp + c.vn + c.fp + c.fn;
}

/** Aciertos sobre el total. Devuelve null si no hay casos. */
export function exactitud(c: ConteoBinario): number | null {
  const n = total(c);
  return n === 0 ? null : (c.vp + c.vn) / n;
}

/**
 * De lo que el modelo marco como positivo, cuanto era realmente positivo.
 * null cuando el modelo nunca dijo que si: no hay nada sobre lo que opinar.
 */
export function precision(c: ConteoBinario): number | null {
  const d = c.vp + c.fp;
  return d === 0 ? null : c.vp / d;
}

/**
 * De todos los positivos reales, cuantos encontro el modelo.
 * null cuando no habia positivos en el conjunto de control.
 */
export function sensibilidad(c: ConteoBinario): number | null {
  const d = c.vp + c.fn;
  return d === 0 ? null : c.vp / d;
}

export function f1(c: ConteoBinario): number | null {
  const p = precision(c);
  const r = sensibilidad(c);
  if (p === null || r === null || p + r === 0) return null;
  return (2 * p * r) / (p + r);
}

/** Matriz de confusion para un campo con mas de dos valores (la ventana temporal). */
export interface MatrizConfusion {
  /** matriz[esperado][obtenido] = cantidad. */
  matriz: Record<string, Record<string, number>>;
  etiquetas: string[];
  aciertos: number;
  total: number;
}

export function matrizVacia(etiquetas: string[]): MatrizConfusion {
  const matriz: Record<string, Record<string, number>> = {};
  for (const e of etiquetas) {
    matriz[e] = {};
    for (const o of etiquetas) matriz[e]![o] = 0;
  }
  return { matriz, etiquetas: [...etiquetas], aciertos: 0, total: 0 };
}

export function acumularMatriz(m: MatrizConfusion, esperado: string, obtenido: string): MatrizConfusion {
  const fila = m.matriz[esperado];
  if (!fila || !(obtenido in fila)) return m; // etiqueta desconocida: no se cuenta
  fila[obtenido]!++;
  m.total++;
  if (esperado === obtenido) m.aciertos++;
  return m;
}

export function exactitudMatriz(m: MatrizConfusion): number | null {
  return m.total === 0 ? null : m.aciertos / m.total;
}

/** Metricas de un valor continuo evaluado contra un rango aceptable. */
export interface MetricasScore {
  /** Proporcion de casos cuyo score cayo dentro del rango esperado. */
  dentroDelRango: number | null;
  /** Error absoluto medio contra el punto medio del rango esperado. */
  errorMedio: number | null;
  casos: number;
}

export function metricasScore(pares: { obtenido: number; rango: [number, number] }[]): MetricasScore {
  if (pares.length === 0) return { dentroDelRango: null, errorMedio: null, casos: 0 };
  let dentro = 0;
  let suma = 0;
  for (const p of pares) {
    const [min, max] = p.rango;
    if (p.obtenido >= min && p.obtenido <= max) dentro++;
    suma += Math.abs(p.obtenido - (min + max) / 2);
  }
  return {
    dentroDelRango: dentro / pares.length,
    errorMedio: suma / pares.length,
    casos: pares.length,
  };
}

/** "0.83" o "n/d" — para no repetir el mismo formateo en cada reporte. */
export function pct(v: number | null): string {
  return v === null ? ' n/d' : `${(v * 100).toFixed(0).padStart(3)}%`;
}
