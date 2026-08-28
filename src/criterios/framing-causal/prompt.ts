/**
 * Prompt del motor de deteccion de framing causal.
 *
 * IMPORTANTE (alcance): el modelo NO debe opinar sobre si el hecho es cierto.
 * Solo audita la ESTRUCTURA del argumento: si hay lenguaje causal fuerte y si
 * viene acompanado de los marcadores que hacen defendible una afirmacion causal
 * (comparacion / contrafactual / ventana temporal razonable).
 *
 * POR QUE ESTE PROMPT PIDE TAN POCO (medido, no supuesto)
 *
 * `npm run latencia` sobre la maquina de referencia dio este reparto por llamada:
 *   generar la respuesta   8114 ms   89%   72 tokens a 8.9 tok/s
 *   procesar el prompt      943 ms   10%   1296 tokens
 *
 * O sea: el tiempo se va casi entero en lo que el modelo ESCRIBE, no en lo que lee.
 * De esos 72 tokens, mas de la mitad eran la justificacion en prosa y los nombres
 * largos de las claves. Y de las cinco claves que se pedian, dos eran redundantes:
 *
 * - `score_framing_causal`: en 22 afirmaciones reales el modelo devolvio 0.85 trece
 *   veces y solo 5 valores distintos. No usaba la escala. Derivarlo de los tres campos
 *   sube el acierto de 68% a 82% y cuesta cero tokens.
 * - `justificacion`: el modelo ya emitia una plantilla ("Atribucion causal sin
 *   comparacion ni plazo." aparecio literal cuatro veces). Componerla desde los campos
 *   da lo mismo, nunca se contradice con ellos, y cuesta cero tokens.
 *
 * Quedan tres preguntas cerradas y claves cortas. Tambien se fueron del prompt la
 * escala de score y los dos criterios de riesgo que solo alimentaban esa escala
 * (razonamiento motivado, asimetria culpa/merito): pedirle al modelo que pondere algo
 * que ya no devuelve es pagar tokens de lectura por nada.
 *
 * El prompt esta escrito en espanol pero evalua afirmaciones en cualquier idioma:
 * qwen2.5 es multilingue y la tarea es estructural, no semantica.
 */

import { createHash } from 'node:crypto';

export const PROMPT_SISTEMA = `Sos un auditor de ESTRUCTURA ARGUMENTAL. Analizas UNA afirmacion y devolves SOLO un objeto JSON.

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
Devolve UNICAMENTE este JSON, sin texto antes ni despues, sin markdown, sin explicaciones:
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
    `Devolve solo el objeto JSON con las 3 claves exactas (causal, contraste, ventana) y nada mas.`
  );
}
