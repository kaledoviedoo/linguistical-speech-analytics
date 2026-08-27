/**
 * Forma generica de un caso de control, valida para cualquier criterio.
 *
 * Antes, el arnes de medicion conocia los cinco campos del criterio causal por su
 * nombre. Eso volvia imposible medir un criterio nuevo sin reescribir el arnes —el
 * mismo acoplamiento que se saco del pipeline, escondido en los tests.
 *
 * Ahora el caso declara QUE espera por clave, y el arnes compara clave por clave:
 * los booleanos van a una matriz de confusion binaria, los enums a una de N valores.
 * No hace falta que el criterio describa sus campos: los declara el conjunto de control,
 * que es donde vive el juicio humano.
 */

export interface CasoControl {
  id: string;
  idioma: string;
  texto: string;
  espera: {
    /** Valor esperado por cada campo propio del criterio. */
    campos: Record<string, boolean | string>;
    /** Rango aceptable del score, que si es universal. */
    score: [number, number];
  };
  /** Que patron ejercita este caso. */
  nota: string;
  /** true = ambiguo a proposito; se ejecuta y se muestra, pero no puntua. */
  dificil?: boolean;
}

export interface ConjuntoDeControl {
  /** id del criterio al que pertenece. */
  criterio: string;
  casos: CasoControl[];
}
