/**
 * Que conjunto de control le corresponde a cada criterio.
 *
 * Mismo criterio que el registro de criterios: un objeto literal, no un cargador
 * dinamico. Si un criterio no tiene conjunto de control, el error lo dice en vez de
 * dejar que alguien crea que midio algo.
 */
import type { ConjuntoDeControl } from './casos-tipos.js';
import { CONJUNTO_FRAMING_CAUSAL } from './afirmaciones-sinteticas.js';
import { CONJUNTO_APELACION_AUTORIDAD } from './afirmaciones-autoridad.js';

const CONJUNTOS: Record<string, ConjuntoDeControl> = {
  [CONJUNTO_FRAMING_CAUSAL.criterio]: CONJUNTO_FRAMING_CAUSAL,
  [CONJUNTO_APELACION_AUTORIDAD.criterio]: CONJUNTO_APELACION_AUTORIDAD,
};

export function conjuntoDeControl(idCriterio: string): ConjuntoDeControl {
  const c = CONJUNTOS[idCriterio];
  if (!c) {
    throw new Error(
      `El criterio "${idCriterio}" no tiene conjunto de control.\n` +
        `  Con conjunto: ${Object.keys(CONJUNTOS).join(', ')}\n` +
        `  Sin uno, la corrida no mediria nada: agregalo en tests/casos-index.ts.`,
    );
  }
  return c;
}

export function conjuntosDisponibles(): ConjuntoDeControl[] {
  return Object.values(CONJUNTOS);
}
