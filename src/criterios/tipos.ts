/**
 * Que es un CRITERIO DE AUDITORIA.
 *
 * El proyecto se llama "auditor de estructura argumental", pero hasta ahora solo
 * sabia auditar UNA estructura: el framing causal. Los cinco campos de ese analisis
 * estaban escritos a mano en seis modulos distintos — tipos, validador, prompt,
 * pipeline, reporte y el medidor de recall. Agregar una segunda pregunta (apelacion
 * a autoridad, generalizacion desde una anecdota, falso dilema) significaba tocar
 * los seis y arriesgarse a romper el que ya funciona.
 *
 * Un criterio junta en un solo lugar todo lo que es especifico de UNA pregunta:
 * el prompt, el esquema de salida, como se valida, como se puntua, que conectores
 * lexicos lo delatan, y como se muestra. El resto del sistema —ingesta, segmentacion,
 * cache, concurrencia, reporte— no sabe nada del contenido.
 *
 * El contrato universal, lo unico que el pipeline necesita de cualquier criterio:
 * un SCORE entre 0 y 1, una JUSTIFICACION obligatoria, y unos MARCADORES para mostrar.
 */

/** Como se pinta un marcador en el reporte, sin que el reporte sepa que significa. */
export type Tono = 'bueno' | 'malo' | 'neutro';

export interface MarcadorMostrable {
  etiqueta: string;
  tono: Tono;
}

/** Resultado de validar la respuesta cruda del modelo contra el esquema del criterio. */
export type ResultadoValidacion<T> =
  | { ok: true; evaluacion: T; ajustes: string[] }
  | { ok: false; problema: string };

/**
 * Un criterio de auditoria. `T` es la forma de los campos propios del criterio,
 * opaca para todo el resto del sistema.
 */
export interface Criterio<T extends object = Record<string, unknown>> {
  /** Identificador estable; entra en la clave de cache y en resultados.json. */
  id: string;
  nombre: string;
  /** Una frase: que audita este criterio. Va en la cabecera del reporte. */
  descripcion: string;
  /** El limite explicito de lo que este criterio NO afirma. Va visible en el reporte. */
  alcance: string;

  /** Prompt de sistema y su huella, para invalidar la cache cuando cambia. */
  promptSistema: string;
  hashPrompt: string;

  construirPrompt(texto: string, idioma: string): string;
  construirPromptCorreccion(texto: string, idioma: string, problema: string): string;

  /**
   * Valida y normaliza la respuesta CRUDA del modelo (texto, no objeto): un modelo
   * chico a veces envuelve el JSON en prosa o en un bloque markdown, y desenvolverlo
   * es parte del contrato del criterio, no del motor.
   */
  validar(textoCrudo: string): ResultadoValidacion<T>;

  /** El numero con el que el pipeline filtra, ordena y resume. Siempre 0..1. */
  score(evaluacion: T): number;
  /** Texto obligatorio que explica el veredicto en terminos de estructura. */
  justificacion(evaluacion: T): string;

  /**
   * Gate lexico barato. Si devuelve vacio, la oracion NO se manda al modelo.
   * Cada criterio tiene su propio rastro lexico: el causal deja "provoco",
   * uno de apelacion a autoridad dejaria "segun los expertos".
   */
  marcadoresLexicos(texto: string): string[];

  /** Como se muestran en el reporte los campos propios del criterio. */
  marcadoresMostrables(evaluacion: T): MarcadorMostrable[];
}

/**
 * Lo que se guarda por afirmacion. Deliberadamente auto-descriptivo: `campos` conserva
 * la respuesta del modelo tal cual, asi resultados.json sigue siendo auditable aunque
 * el reporte solo lea score, justificacion y marcadores.
 */
export interface EvaluacionAfirmacion {
  /** id del criterio que produjo esto. */
  criterio: string;
  score: number;
  justificacion: string;
  marcadores: MarcadorMostrable[];
  /** Campos propios del criterio, sin interpretar. */
  campos: Record<string, unknown>;
}

/** Empaqueta la salida de un criterio en la forma que persiste y consume el reporte. */
export function empaquetar<T extends object>(criterio: Criterio<T>, evaluacion: T): EvaluacionAfirmacion {
  return {
    criterio: criterio.id,
    score: criterio.score(evaluacion),
    justificacion: criterio.justificacion(evaluacion),
    marcadores: criterio.marcadoresMostrables(evaluacion),
    campos: { ...evaluacion } as Record<string, unknown>,
  };
}
