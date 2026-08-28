/**
 * Mide cuanto se pierde el prefiltro heuristico.
 *
 * La idea es mas simple de lo que parece y no necesita dos corridas: si se evalua el
 * discurso ENTERO con el LLM (--sin-prefiltro), cada afirmacion sigue trayendo sus
 * `marcadoresHeuristicos`. Entonces basta mirar las afirmaciones que superaron el
 * umbral y preguntar cuales de ellas NO tenian ningun conector: esas son exactamente
 * las que el prefiltro habria descartado en silencio.
 *
 * Falso negativo del prefiltro = score alto + cero conectores.
 */
import type { Resultados } from '../tipos.js';

export interface AfirmacionPerdida {
  id: string;
  inicio: number;
  texto: string;
  score: number;
  justificacion: string;
}

export interface InformeRecall {
  umbral: number;
  totalAfirmaciones: number;
  evaluadas: number;
  conConector: number;
  sinConector: number;
  /** Afirmaciones que superan el umbral, evaluadas sin prefiltro. */
  altasTotal: number;
  /** De esas, las que el prefiltro SI habria mandado al modelo. */
  altasCapturadas: number;
  /** De esas, las que el prefiltro habria descartado. */
  altasPerdidas: number;
  /** altasCapturadas / altasTotal. null si no hubo ninguna afirmacion alta. */
  recall: number | null;
  /** Fraccion de oraciones que el prefiltro evita mandar al modelo. */
  ahorroComputo: number;
  perdidas: AfirmacionPerdida[];
}

/**
 * `resultados` tiene que venir de una corrida con --sin-prefiltro: si no, las
 * afirmaciones sin conector nunca se evaluaron y el recall daria 100% por construccion.
 */
export function medirRecall(resultados: Resultados, umbral: number): InformeRecall {
  const todas = resultados.resultados;
  const evaluadas = todas.filter((r) => r.evaluada && r.evaluacion);

  const conConector = todas.filter((r) => r.marcadoresHeuristicos.length > 0).length;
  const sinConector = todas.length - conConector;

  const altas = evaluadas.filter((r) => (r.evaluacion?.score ?? 0) >= umbral);
  const perdidasCrudas = altas.filter((r) => r.marcadoresHeuristicos.length === 0);

  return {
    umbral,
    totalAfirmaciones: todas.length,
    evaluadas: evaluadas.length,
    conConector,
    sinConector,
    altasTotal: altas.length,
    altasCapturadas: altas.length - perdidasCrudas.length,
    altasPerdidas: perdidasCrudas.length,
    recall: altas.length === 0 ? null : (altas.length - perdidasCrudas.length) / altas.length,
    ahorroComputo: todas.length === 0 ? 0 : sinConector / todas.length,
    perdidas: perdidasCrudas
      .sort((a, b) => (b.evaluacion?.score ?? 0) - (a.evaluacion?.score ?? 0))
      .map((r) => ({
        id: r.id,
        inicio: r.inicio,
        texto: r.texto,
        score: r.evaluacion?.score ?? 0,
        justificacion: r.evaluacion?.justificacion ?? '',
      })),
  };
}

/**
 * Veredicto accionable. El umbral de 0.95 no es arbitrario: por debajo de eso, en un
 * discurso de 100 afirmaciones filtradas se estaria perdiendo mas de una afirmacion
 * de score alto, que es justo lo que la herramienta existe para encontrar.
 */
export function veredicto(informe: InformeRecall): { ok: boolean; texto: string } {
  if (informe.recall === null) {
    return {
      ok: false,
      texto:
        'Ninguna afirmacion supero el umbral, asi que no hay recall que medir. ' +
        'Proba con material mas argumentativo o baja el umbral.',
    };
  }
  if (informe.recall >= 0.95) {
    return {
      ok: true,
      texto:
        `El prefiltro captura el ${(informe.recall * 100).toFixed(0)}% de las afirmaciones de score alto ` +
        `y evita mandar al modelo el ${(informe.ahorroComputo * 100).toFixed(0)}% del texto. ` +
        'La relacion es buena: dejalo como esta.',
    };
  }
  return {
    ok: false,
    texto:
      `El prefiltro pierde el ${((1 - informe.recall) * 100).toFixed(0)}% de las afirmaciones de score alto. ` +
      'La lista de abajo hay que ADJUDICARLA a mano, una por una. Sin prefiltro el modelo ve ' +
      'texto sin ningun conector causal y a veces marca causalidad donde no hay ninguna: esas ' +
      'no son perdidas, son falsos positivos que el prefiltro justamente evita. Las que si ' +
      'tengan lenguaje causal son conectores que le faltan al gate del criterio.',
  };
}
