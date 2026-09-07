/**
 * Forma de un caso de control, generica para cualquier criterio.
 *
 * Cada caso declara que espera POR CLAVE, no por nombre de campo fijo, asi que el arnes
 * compara sin conocer los campos del criterio: los booleanos van a una matriz binaria y
 * los enums a una de N valores.
 *
 * `dificil: true` marca los casos ambiguos a proposito: se ejecutan y se muestran, pero
 * no puntuan (meter casos discutibles en el denominador solo ensucia el numero).
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
