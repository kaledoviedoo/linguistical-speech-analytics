/**
 * Esquema y validacion del criterio de apelacion a autoridad.
 *
 * Repara lo mismo que el causal —JSON envuelto en prosa, booleanos escritos como
 * palabras, scores en 0-100— porque eso lo aporta `criterios/validacion.ts`. Lo que
 * es propio de aca son las claves, el enum de tres valores y la coherencia interna.
 */
import type { ResultadoValidacion } from '../tipos.js';
import {
  aBooleano,
  aScore,
  clavesFaltantes,
  exigirJustificacion,
  extraerJSON,
  normalizarEnum,
} from '../validacion.js';

/** Cuanto dice la afirmacion sobre la evidencia en la que se apoya. */
export type AlcanceEvidencia = 'ninguno' | 'vago' | 'especifico';

export interface EvaluacionApelacionAutoridad {
  invoca_autoridad: boolean;
  fuente_identificable: boolean;
  alcance_de_la_evidencia: AlcanceEvidencia;
  score_autoridad_vaga: number;
  justificacion: string;
}

const CLAVES = [
  'invoca_autoridad',
  'fuente_identificable',
  'alcance_de_la_evidencia',
  'score_autoridad_vaga',
  'justificacion',
] as const;

function aAlcance(v: unknown): AlcanceEvidencia | null {
  const s = normalizarEnum(v);
  if (s === null) return null;
  if (!s || s.includes('ningun') || s === 'none' || s === 'n/a') return 'ninguno';
  if (s.includes('vago') || s.includes('vague') || s.includes('generic') || s.includes('impreci')) return 'vago';
  if (s.includes('especif') || s.includes('specific') || s.includes('concret') || s.includes('detall')) {
    return 'especifico';
  }
  return null;
}

export function validarEvaluacion(bruto: unknown): ResultadoValidacion<EvaluacionApelacionAutoridad> {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, problema: 'la respuesta no es un objeto JSON' };
  }
  const obj = bruto as Record<string, unknown>;
  const ajustes: string[] = [];

  const faltantes = clavesFaltantes(obj, CLAVES);
  if (faltantes.length >= 3) {
    return { ok: false, problema: `faltan las claves: ${faltantes.join(', ')}` };
  }

  const invoca = aBooleano(obj['invoca_autoridad']);
  if (invoca === null) return { ok: false, problema: 'invoca_autoridad no es booleano' };

  const fuente = aBooleano(obj['fuente_identificable']);
  if (fuente === null) return { ok: false, problema: 'fuente_identificable no es booleano' };

  const alcance = aAlcance(obj['alcance_de_la_evidencia']);
  if (alcance === null) return { ok: false, problema: 'alcance_de_la_evidencia fuera del enum permitido' };
  if (typeof obj['alcance_de_la_evidencia'] === 'string' && obj['alcance_de_la_evidencia'] !== alcance) {
    ajustes.push(`alcance normalizado a "${alcance}"`);
  }

  const score = aScore(obj['score_autoridad_vaga']);
  if (score === null) return { ok: false, problema: 'score_autoridad_vaga no es numerico' };
  ajustes.push(...score.ajustes);
  let valor = score.valor;

  const justificacion = exigirJustificacion(obj['justificacion']);
  if (justificacion === null) {
    return { ok: false, problema: 'justificacion ausente o demasiado corta (es obligatoria)' };
  }

  // Coherencia 1: sin apelacion a autoridad no puede haber score alto.
  if (!invoca && valor >= 0.3) {
    valor = 0.2;
    ajustes.push('score bajado a 0.20 por incoherencia: no invoca autoridad');
  }
  // Coherencia 2: fuente identificable Y evidencia especifica es el caso defendible.
  if (invoca && fuente && alcance === 'especifico' && valor >= 0.3) {
    valor = 0.2;
    ajustes.push('score bajado a 0.20 por incoherencia: fuente identificable con evidencia especifica');
  }

  return {
    ok: true,
    ajustes,
    evaluacion: {
      invoca_autoridad: invoca,
      fuente_identificable: fuente,
      alcance_de_la_evidencia: alcance,
      score_autoridad_vaga: Number(valor.toFixed(2)),
      justificacion,
    },
  };
}

export function parsearRespuesta(textoCrudo: string): ResultadoValidacion<EvaluacionApelacionAutoridad> {
  const json = extraerJSON(textoCrudo);
  if (!json) return { ok: false, problema: 'no se encontro ningun objeto JSON en la respuesta' };
  try {
    return validarEvaluacion(JSON.parse(json));
  } catch (e) {
    return { ok: false, problema: `JSON malformado: ${(e as Error).message}` };
  }
}
