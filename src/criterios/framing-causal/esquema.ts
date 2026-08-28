/**
 * Esquema y validacion del criterio de framing causal.
 *
 * La reparacion generica de salidas de un modelo chico —desenvolver el JSON de entre
 * prosa, aceptar "si" como booleano— vive en `criterios/validacion.ts` y la comparten
 * todos los criterios. Aca queda solo lo propio de esta pregunta.
 *
 * QUE PIDE EL MODELO Y QUE CALCULAMOS NOSOTROS
 *
 * El modelo devuelve tres claves cortas: `causal`, `contraste`, `ventana`. El score y la
 * justificacion NO se le piden: se derivan de esos tres campos (ver `derivarScore` y
 * `componerJustificacion`). El tipo de dominio conserva las cinco claves largas de
 * siempre, asi que `resultados.json`, el reporte y los casos de control no cambian:
 * lo unico que se encogio es lo que viaja por el cable.
 */
import type { ResultadoValidacion } from '../tipos.js';
import { aBooleano, extraerJSON, normalizarEnum } from '../validacion.js';

/**
 * Ventana temporal declarada por el hablante. Es un campo PROPIO de este criterio:
 * vive aca y no en los tipos globales, porque otro criterio no tiene por que tenerlo.
 */
export type VentanaTemporal = 'ninguna' | 'corta' | 'razonable';

/** Esquema estricto del criterio. Las dos ultimas claves las completamos nosotros. */
export interface EvaluacionFramingCausal {
  tiene_lenguaje_causal_fuerte: boolean;
  tiene_contrafactual_o_comparacion: boolean;
  ventana_temporal_mencionada: VentanaTemporal;
  score_framing_causal: number;
  justificacion: string;
}

/** Lo que se le pide al modelo, y el nombre largo con el que se guarda. */
const CLAVES = {
  causal: 'tiene_lenguaje_causal_fuerte',
  contraste: 'tiene_contrafactual_o_comparacion',
  ventana: 'ventana_temporal_mencionada',
} as const;

/** Lee una clave aceptando el nombre corto (lo que pide el prompt) o el largo. */
function leer(obj: Record<string, unknown>, corta: keyof typeof CLAVES): unknown {
  return obj[corta] ?? obj[CLAVES[corta]];
}

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
 * El score sale de los tres campos, no del modelo.
 *
 * Motivo medido: en 22 afirmaciones reales el modelo contesto 0.85 trece veces y uso
 * solo 5 valores distintos en total. Con un score casi constante, el umbral del reporte
 * y su deslizador no pueden discriminar nada. Derivarlo sube el acierto de 68% a 82%
 * sobre el conjunto de control, y encima lo hace reproducible.
 *
 * La escala es la del prompt original, ahora aplicada de forma deterministica:
 * lo mas fragil es afirmar causa sin ningun contraste y ademas con un plazo corto.
 */
export function derivarScore(
  causal: boolean,
  contraste: boolean,
  ventana: VentanaTemporal,
): number {
  if (!causal) return 0.15;
  if (contraste) return ventana === 'razonable' ? 0.25 : 0.45;
  if (ventana === 'razonable') return 0.6;
  if (ventana === 'corta') return 0.9;
  return 0.75;
}

/**
 * La justificacion tambien sale de los campos.
 *
 * El modelo ya escribia una plantilla: "Atribucion causal sin comparacion ni plazo."
 * aparecio literal cuatro veces en 22 casos. Componerla nosotros da lo mismo, cuesta
 * cero tokens, y elimina la posibilidad de que contradiga a los campos que la acompanan.
 */
export function componerJustificacion(
  causal: boolean,
  contraste: boolean,
  ventana: VentanaTemporal,
): string {
  const plazo: Record<VentanaTemporal, string> = {
    ninguna: 'sin plazo declarado',
    corta: 'con un plazo de dias o semanas',
    razonable: 'con un plazo de meses o anos',
  };
  return [
    causal ? 'Lenguaje causal fuerte' : 'Sin lenguaje causal fuerte',
    contraste ? 'con comparacion o contrafactual' : 'sin comparacion ni contrafactual',
    plazo[ventana],
  ].join(', ') + '.';
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

  const causal = aBooleano(leer(obj, 'causal'));
  if (causal === null) return { ok: false, problema: 'causal no es booleano' };

  const contraste = aBooleano(leer(obj, 'contraste'));
  if (contraste === null) return { ok: false, problema: 'contraste no es booleano' };

  const crudoVentana = leer(obj, 'ventana');
  const ventana = aVentana(crudoVentana);
  if (ventana === null) return { ok: false, problema: 'ventana fuera del enum permitido' };
  if (typeof crudoVentana === 'string' && crudoVentana !== ventana) {
    ajustes.push(`ventana normalizada a "${ventana}"`);
  }

  return {
    ok: true,
    ajustes,
    evaluacion: {
      tiene_lenguaje_causal_fuerte: causal,
      tiene_contrafactual_o_comparacion: contraste,
      ventana_temporal_mencionada: ventana,
      score_framing_causal: derivarScore(causal, contraste, ventana),
      justificacion: componerJustificacion(causal, contraste, ventana),
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
