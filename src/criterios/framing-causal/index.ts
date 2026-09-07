/**
 * Criterio de auditoria: FRAMING CAUSAL.
 *
 * Detecta afirmaciones con lenguaje causal fuerte que no traen los marcadores que las
 * harian defendibles: comparacion, contrafactual o ventana temporal razonable.
 *
 * Reune las cinco piezas del criterio (prompt, esquema, validacion, gate lexico y
 * presentacion). Agregar otro criterio es escribir un archivo como este.
 */
import type { Criterio, MarcadorMostrable, ResultadoValidacion } from '../tipos.js';
import { GATE_CAUSAL, marcadoresCausales } from './conectores.js';
import { parsearRespuesta, type EvaluacionFramingCausal } from './esquema.js';
import {
  construirPromptCorreccion,
  construirPromptUsuario,
  HASH_PROMPT,
  PROMPT_SISTEMA,
} from './prompt.js';

export const criterioFramingCausal: Criterio<EvaluacionFramingCausal> = {
  id: 'framing-causal',
  nombre: 'Framing causal',
  descripcion:
    'Afirmaciones con lenguaje causal fuerte sin comparacion, contrafactual ni ventana temporal razonable.',
  alcance:
    'Evalua la estructura del argumento, no verifica la veracidad del hecho.',

  promptSistema: PROMPT_SISTEMA,
  hashPrompt: HASH_PROMPT,
  totalMarcadoresLexicos: GATE_CAUSAL.total,

  construirPrompt: (texto, idioma) => construirPromptUsuario(texto, idioma),
  construirPromptCorreccion: (texto, idioma, problema) =>
    construirPromptCorreccion(texto, idioma, problema),

  /** Extrae el JSON de entre prosa o markdown, normaliza el enum y repara incoherencias. */
  validar(textoCrudo: string): ResultadoValidacion<EvaluacionFramingCausal> {
    return parsearRespuesta(textoCrudo);
  },

  score: (e) => e.score_framing_causal,
  justificacion: (e) => e.justificacion,

  marcadoresLexicos: (texto) => marcadoresCausales(texto),

  /**
   * El tono dice si el marcador SUMA o RESTA defensa a la afirmacion, no si es
   * "bueno" moralmente. Tener lenguaje causal fuerte resta; tener comparacion suma.
   */
  marcadoresMostrables(e): MarcadorMostrable[] {
    return [
      {
        etiqueta: e.tiene_lenguaje_causal_fuerte ? 'causal fuerte' : 'sin causal fuerte',
        tono: e.tiene_lenguaje_causal_fuerte ? 'malo' : 'bueno',
      },
      {
        etiqueta: e.tiene_contrafactual_o_comparacion ? 'con contraste' : 'sin contraste',
        tono: e.tiene_contrafactual_o_comparacion ? 'bueno' : 'malo',
      },
      {
        etiqueta: `ventana: ${e.ventana_temporal_mencionada}`,
        tono:
          e.ventana_temporal_mencionada === 'razonable'
            ? 'bueno'
            : e.ventana_temporal_mencionada === 'corta'
              ? 'malo'
              : 'neutro',
      },
    ];
  },
};

export { PROMPT_SISTEMA, HASH_PROMPT, construirPromptUsuario, construirPromptCorreccion } from './prompt.js';
export { parsearRespuesta, validarEvaluacion } from './esquema.js';
export { marcadoresCausales } from './conectores.js';
export type { EvaluacionFramingCausal, VentanaTemporal } from './esquema.js';
