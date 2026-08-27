/**
 * Criterio de auditoria: APELACION A AUTORIDAD NO VERIFICABLE.
 *
 * Detecta afirmaciones que se apoyan en una autoridad —expertos, estudios, la ciencia,
 * el saber comun— sin dar lo que haria falta para ir a comprobarlas: quien lo dice, y
 * de que evidencia se habla.
 *
 * Igual que el criterio causal, NO verifica el hecho. La diferencia es de que trata la
 * pregunta: alli era si el argumento admite ser contrastado; aca es si la fuente admite
 * ser rastreada. Las dos son propiedades del texto, no del mundo.
 */
import type { Criterio, MarcadorMostrable, ResultadoValidacion } from '../tipos.js';
import { GATE_AUTORIDAD, marcadoresDeAutoridad } from './marcadores.js';
import { parsearRespuesta, type EvaluacionApelacionAutoridad } from './esquema.js';
import {
  construirPromptCorreccion,
  construirPromptUsuario,
  HASH_PROMPT,
  PROMPT_SISTEMA,
} from './prompt.js';

export const criterioApelacionAutoridad: Criterio<EvaluacionApelacionAutoridad> = {
  id: 'apelacion-autoridad',
  nombre: 'Apelacion a autoridad',
  descripcion:
    'Afirmaciones apoyadas en expertos, estudios o el saber comun sin fuente identificable ni evidencia concreta.',
  alcance:
    'Evalua si la fuente se puede rastrear, no si la autoridad citada tiene razon.',

  promptSistema: PROMPT_SISTEMA,
  hashPrompt: HASH_PROMPT,
  totalMarcadoresLexicos: GATE_AUTORIDAD.total,

  construirPrompt: (texto, idioma) => construirPromptUsuario(texto, idioma),
  construirPromptCorreccion: (texto, idioma, problema) =>
    construirPromptCorreccion(texto, idioma, problema),

  validar(textoCrudo: string): ResultadoValidacion<EvaluacionApelacionAutoridad> {
    return parsearRespuesta(textoCrudo);
  },

  score: (e) => e.score_autoridad_vaga,
  justificacion: (e) => e.justificacion,

  marcadoresLexicos: (texto) => marcadoresDeAutoridad(texto),

  /** El tono dice si el rasgo SUMA o RESTA verificabilidad, no si es bueno moralmente. */
  marcadoresMostrables(e): MarcadorMostrable[] {
    return [
      {
        etiqueta: e.invoca_autoridad ? 'invoca autoridad' : 'sin apelacion a autoridad',
        tono: e.invoca_autoridad ? 'malo' : 'bueno',
      },
      {
        etiqueta: e.fuente_identificable ? 'fuente identificable' : 'fuente sin identificar',
        tono: e.fuente_identificable ? 'bueno' : 'malo',
      },
      {
        etiqueta: `evidencia: ${e.alcance_de_la_evidencia}`,
        tono: e.alcance_de_la_evidencia === 'especifico' ? 'bueno' : 'malo',
      },
    ];
  },
};

export { PROMPT_SISTEMA, HASH_PROMPT } from './prompt.js';
export { parsearRespuesta, validarEvaluacion } from './esquema.js';
export type { EvaluacionApelacionAutoridad, AlcanceEvidencia } from './esquema.js';
