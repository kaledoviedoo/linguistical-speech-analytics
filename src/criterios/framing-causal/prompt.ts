/**
 * Prompt del criterio de framing causal.
 *
 * Le pide al modelo tres preguntas cerradas sobre UNA afirmacion (si usa lenguaje
 * causal fuerte, si contrasta con algo, y que plazo declara) y nada mas. El score y
 * la justificacion no se le piden: se derivan de esos tres campos en `esquema.ts`.
 *
 * Esta en espanol pero evalua afirmaciones en cualquier idioma: qwen2.5 es multilingue
 * y la tarea es estructural, no semantica.
 *
 * El porque de este recorte (con las mediciones) esta en ARQUITECTURA.md.
 */
import { createHash } from 'node:crypto';

export const PROMPT_SISTEMA = `Eres un auditor de ESTRUCTURA ARGUMENTAL. Analizas UNA afirmacion y devuelves SOLO un objeto JSON.

REGLA DE ALCANCE (la mas importante): NO evalues si el hecho es verdadero o falso. No sabes si ocurrio. Solo evalues COMO esta construido el argumento.

Respondes tres preguntas cerradas, nada mas.

1. "causal": el hablante afirma que A produjo B de forma directa y sin reservas ("causo", "provoco", "genero", "por culpa de", "caused", "led to", "because of").
   Es false si hay hedging real ("puede haber contribuido", "es uno de varios factores", "coincidio con", "se correlaciona").
   Cuanto mas contundente y sin condiciones suena la frase, mas true; el matiz explicito la vuelve false.

2. "contraste": el hablante contrasta con algo. Es true si menciona (a) que habria pasado sin A, (b) otro pais, region, sector o gobierno de referencia, (c) el periodo anterior o la tendencia previa, (d) que descarta otras causas, (e) datos de un grupo de control.

3. "ventana": cuanto tiempo pasa entre A y B, segun lo dice el hablante.
   "ninguna"   = no menciona plazo.
   "corta"     = dias o semanas.
   "razonable" = meses, anos, o un rango de fechas explicito.

SALIDA
Devuelve UNICAMENTE este JSON, sin texto antes ni despues, sin markdown, sin explicaciones:
{"causal": <true|false>, "contraste": <true|false>, "ventana": "<ninguna|corta|razonable>"}

EJEMPLOS
"La inflacion se disparo por culpa de las politicas del gobierno anterior."
{"causal": true, "contraste": false, "ventana": "ninguna"}

"Since the tax cut in 2019, employment rose 4% here, compared with 1% in neighbouring states over the same three years."
{"causal": false, "contraste": true, "ventana": "razonable"}

"El desempleo bajo dos semanas despues de que firmamos el decreto."
{"causal": true, "contraste": false, "ventana": "corta"}`;

/**
 * Huella del prompt del sistema. Sirve para invalidar la cache de evaluaciones
 * automaticamente en cuanto se toca una sola palabra del prompt.
 */
export const HASH_PROMPT = createHash('sha1').update(PROMPT_SISTEMA).digest('hex').slice(0, 8);

/** Mensaje de usuario: la afirmacion cruda, con su idioma como pista. */
export function construirPromptUsuario(afirmacion: string, idioma: string): string {
  return `Idioma detectado: ${idioma}\nAfirmacion: "${afirmacion.replace(/"/g, "'")}"\n\nJSON:`;
}

/** Reintento: se le recuerda el formato exacto tras una respuesta invalida. */
export function construirPromptCorreccion(afirmacion: string, idioma: string, problema: string): string {
  return (
    `${construirPromptUsuario(afirmacion, idioma)}\n\n` +
    `Tu respuesta anterior fue invalida (${problema}). ` +
    `Devuelve solo el objeto JSON con las 3 claves exactas (causal, contraste, ventana) y nada mas.`
  );
}
