/**
 * Criterio de auditoria: FRAMING CAUSAL.
 *
 * Detecta afirmaciones que usan lenguaje causal fuerte sin los marcadores que hacen
 * defendible una afirmacion causal: comparacion, contrafactual o ventana temporal
 * razonable.
 *
 * Este archivo es el unico lugar donde conviven las cinco piezas especificas de esta
 * pregunta: el prompt, el esquema, la validacion, el gate lexico y como se muestra.
 * Un segundo criterio se agrega escribiendo un archivo como este, sin tocar el
 * pipeline, ni la cache, ni el reporte.
 */
import type { Criterio, MarcadorMostrable, ResultadoValidacion } from '../tipos.js';
import { marcadoresCausales } from '../../procesamiento/prefiltro.js';
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
export { parsearRespuesta, validarEvaluacion, extraerJSON } from './esquema.js';
export type { EvaluacionFramingCausal, VentanaTemporal } from './esquema.js';
