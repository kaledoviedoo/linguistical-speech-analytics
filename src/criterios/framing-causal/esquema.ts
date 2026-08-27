/**
 * Esquema y validacion del criterio de framing causal.
 *
 * La reparacion generica de salidas de un modelo chico —desenvolver el JSON de entre
 * prosa, aceptar "si" como booleano, reescalar un score en 0-100— vive en
 * `criterios/validacion.ts` y la comparten todos los criterios. Aca queda solo lo que
 * es propio de esta pregunta: las cinco claves, el enum de la ventana temporal y la
 * coherencia interna que ningun otro criterio tendria.
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

/**
 * Ventana temporal declarada por el hablante. Es un campo PROPIO de este criterio:
 * vive aca y no en los tipos globales, porque otro criterio no tiene por que tenerlo.
 */
export type VentanaTemporal = 'ninguna' | 'corta' | 'razonable';

/** Esquema estricto que este criterio le exige al modelo. */
export interface EvaluacionFramingCausal {
  tiene_lenguaje_causal_fuerte: boolean;
  tiene_contrafactual_o_comparacion: boolean;
  ventana_temporal_mencionada: VentanaTemporal;
  score_framing_causal: number;
  justificacion: string;
}

const CLAVES = [
  'tiene_lenguaje_causal_fuerte',
  'tiene_contrafactual_o_comparacion',
  'ventana_temporal_mencionada',
  'score_framing_causal',
  'justificacion',
] as const;

function aVentana(v: unknown): VentanaTemporal | null {
  const s = normalizarEnum(v);
  if (s === null) return null;
  if (!s || s.includes('ningun') || s === 'none' || s === 'n/a' || s.includes('no menciona')) return 'ninguna';
  if (s.includes('cort') || s.includes('short') || s.includes('dia') || s.includes('semana')) return 'corta';
  if (s.includes('razon') || s.includes('reasonable') || s.includes('mes') || s.includes('ano') || s.includes('year')) {
    return 'razonable';
  }
  return null;
}

/**
 * Valida y normaliza. Devuelve tambien la lista de ajustes aplicados,
 * para que el reporte pueda mostrar cuando el modelo se salio del esquema.
 */
export function validarEvaluacion(bruto: unknown): ResultadoValidacion<EvaluacionFramingCausal> {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, problema: 'la respuesta no es un objeto JSON' };
  }
  const obj = bruto as Record<string, unknown>;
  const ajustes: string[] = [];

  const faltantes = clavesFaltantes(obj, CLAVES);
  if (faltantes.length >= 3) {
    return { ok: false, problema: `faltan las claves: ${faltantes.join(', ')}` };
  }

  const causal = aBooleano(obj['tiene_lenguaje_causal_fuerte']);
  if (causal === null) return { ok: false, problema: 'tiene_lenguaje_causal_fuerte no es booleano' };

  const contraste = aBooleano(obj['tiene_contrafactual_o_comparacion']);
  if (contraste === null) return { ok: false, problema: 'tiene_contrafactual_o_comparacion no es booleano' };

  const ventana = aVentana(obj['ventana_temporal_mencionada']);
  if (ventana === null) {
    return { ok: false, problema: 'ventana_temporal_mencionada fuera del enum permitido' };
  }
  if (typeof obj['ventana_temporal_mencionada'] === 'string' && obj['ventana_temporal_mencionada'] !== ventana) {
    ajustes.push(`ventana normalizada a "${ventana}"`);
  }

  const score = aScore(obj['score_framing_causal']);
  if (score === null) return { ok: false, problema: 'score_framing_causal no es numerico' };
  ajustes.push(...score.ajustes);
  let valor = score.valor;

  const justificacion = exigirJustificacion(obj['justificacion']);
  if (justificacion === null) {
    return { ok: false, problema: 'justificacion ausente o demasiado corta (es obligatoria)' };
  }

  // Coherencia interna: sin lenguaje causal fuerte el score no puede ser alto.
  if (!causal && valor >= 0.3) {
    valor = 0.2;
    ajustes.push('score bajado a 0.20 por incoherencia: sin lenguaje causal fuerte');
  }

  return {
    ok: true,
    ajustes,
    evaluacion: {
      tiene_lenguaje_causal_fuerte: causal,
      tiene_contrafactual_o_comparacion: contraste,
      ventana_temporal_mencionada: ventana,
      score_framing_causal: Number(valor.toFixed(2)),
      justificacion,
    },
  };
}

/** Atajo: texto crudo del modelo -> evaluacion validada. */
export function parsearRespuesta(textoCrudo: string): ResultadoValidacion<EvaluacionFramingCausal> {
  const json = extraerJSON(textoCrudo);
  if (!json) return { ok: false, problema: 'no se encontro ningun objeto JSON en la respuesta' };
  try {
    return validarEvaluacion(JSON.parse(json));
  } catch (e) {
    return { ok: false, problema: `JSON malformado: ${(e as Error).message}` };
  }
}
