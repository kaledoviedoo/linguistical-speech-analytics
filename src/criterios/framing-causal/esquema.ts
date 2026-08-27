/**
 * Validacion estricta del JSON que devuelve el LLM local.
 *
 * Un modelo de 3B con format:"json" acierta el esquema casi siempre, pero "casi"
 * no alcanza para un pipeline sin supervision: aca se extrae, se valida, se normaliza
 * y se registra cada correccion aplicada. Si algo no se puede reparar, se pide reintento.
 */
import type { ResultadoValidacion } from '../tipos.js';

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

/** Extrae el primer objeto JSON balanceado del texto (por si el modelo agrega prosa o ```json). */
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

function aBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'si', 'sí', 'yes', '1', 'verdadero'].includes(s)) return true;
    if (['false', 'no', '0', 'falso'].includes(s)) return false;
  }
  return null;
}

function aVentana(v: unknown): VentanaTemporal | null {
  if (typeof v !== 'string') {
    if (v === null || v === undefined) return 'ninguna';
    return null;
  }
  const s = v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s || s.includes('ningun') || s === 'none' || s === 'n/a' || s.includes('no menciona')) return 'ninguna';
  if (s.includes('cort') || s.includes('short') || s.includes('dia') || s.includes('semana')) return 'corta';
  if (s.includes('razon') || s.includes('reasonable') || s.includes('mes') || s.includes('ano') || s.includes('year'))
    return 'razonable';
  return null;
}

function aScore(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
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

  const faltantes = CLAVES.filter((k) => !(k in obj));
  if (faltantes.length > 0 && faltantes.length >= 3) {
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

  let score = aScore(obj['score_framing_causal']);
  if (score === null) return { ok: false, problema: 'score_framing_causal no es numerico' };
  if (score > 1 && score <= 100) {
    score = score / 100;
    ajustes.push('score venia en escala 0-100, reescalado a 0-1');
  }
  if (score < 0 || score > 1) {
    score = Math.min(1, Math.max(0, score));
    ajustes.push('score recortado al rango 0-1');
  }

  const justificacionBruta = obj['justificacion'];
  if (typeof justificacionBruta !== 'string' || justificacionBruta.trim().length < 10) {
    return { ok: false, problema: 'justificacion ausente o demasiado corta (es obligatoria)' };
  }

  // Coherencia interna: sin lenguaje causal fuerte el score no puede ser alto.
  if (!causal && score >= 0.3) {
    score = 0.2;
    ajustes.push('score bajado a 0.20 por incoherencia: sin lenguaje causal fuerte');
  }

  return {
    ok: true,
    ajustes,
    evaluacion: {
      tiene_lenguaje_causal_fuerte: causal,
      tiene_contrafactual_o_comparacion: contraste,
      ventana_temporal_mencionada: ventana,
      score_framing_causal: Number(score.toFixed(2)),
      justificacion: justificacionBruta.trim(),
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
