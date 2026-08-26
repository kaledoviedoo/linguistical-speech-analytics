/**
 * 10 afirmaciones sinteticas de control.
 *
 * No son ejemplos reales ni citas de nadie: estan escritas para cubrir los casos
 * limite del esquema (causal puro, causal con comparacion, matizado, ventana corta,
 * ventana razonable, no causal) en varios idiomas.
 *
 * `espera` es lo que deberia responder un evaluador competente. El test mide dos
 * cosas por separado: (a) que el JSON respete SIEMPRE el esquema, que es lo
 * bloqueante, y (b) cuanto coincide el modelo con la expectativa, que es informativo.
 */
export interface CasoSintetico {
  id: string;
  idioma: string;
  texto: string;
  espera: {
    causal: boolean;
    contraste: boolean;
    ventana: 'ninguna' | 'corta' | 'razonable';
    /** Rango aceptable de score. */
    score: [number, number];
  };
  nota: string;
}

export const CASOS: CasoSintetico[] = [
  {
    id: 'c01',
    idioma: 'es',
    texto: 'La pobreza aumento por culpa de las medidas que tomo la administracion anterior.',
    espera: { causal: true, contraste: false, ventana: 'ninguna', score: [0.6, 1.0] },
    nota: 'H1 causalidad sin contraste, sin plazo.',
  },
  {
    id: 'c02',
    idioma: 'es',
    texto:
      'Desde la reforma de 2018, el empleo formal crecio 6% en nuestra region, frente al 2% de las provincias vecinas en el mismo periodo de cinco anos.',
    espera: { causal: false, contraste: true, ventana: 'razonable', score: [0.0, 0.35] },
    nota: 'Comparacion explicita y ventana larga: el caso defendible.',
  },
  {
    id: 'c03',
    idioma: 'es',
    texto: 'El dolar se disparo tres dias despues del anuncio, y eso lo provoco el anuncio.',
    espera: { causal: true, contraste: false, ventana: 'corta', score: [0.7, 1.0] },
    nota: 'H2 ventana corta sospechosa + post hoc.',
  },
  {
    id: 'c04',
    idioma: 'es',
    texto:
      'La caida del consumo puede haber sido influida por la suba de tasas, aunque tambien pesaron el clima y el precio internacional de los granos.',
    espera: { causal: false, contraste: false, ventana: 'ninguna', score: [0.0, 0.4] },
    nota: 'H3 paradoja del matiz: hedging real y causas alternativas reconocidas.',
  },
  {
    id: 'c05',
    idioma: 'es',
    texto:
      'Cuando nosotros gobernamos, la inflacion bajo gracias a nuestro plan; cuando gobernaron ellos, subio por su incompetencia.',
    espera: { causal: true, contraste: false, ventana: 'ninguna', score: [0.75, 1.0] },
    nota: 'H5 asimetria culpa/merito con el mismo tipo de evidencia (ninguna).',
  },
  {
    id: 'c06',
    idioma: 'en',
    texto: 'The factory closures were caused entirely by the new import tariff.',
    espera: { causal: true, contraste: false, ventana: 'ninguna', score: [0.65, 1.0] },
    nota: 'H1 en ingles, con cuantificador absoluto ("entirely").',
  },
  {
    id: 'c07',
    idioma: 'en',
    texto:
      'Inflation fell from 9% to 4% over the two years after the policy, a decline also seen in most comparable economies during the same window.',
    espera: { causal: false, contraste: true, ventana: 'razonable', score: [0.0, 0.35] },
    nota: 'Reconoce la tendencia comun: descarta implicitamente la causalidad unica.',
  },
  {
    id: 'c08',
    idioma: 'en',
    texto: 'Crime dropped the week we deployed the new patrols, so the patrols are why crime dropped.',
    espera: { causal: true, contraste: false, ventana: 'corta', score: [0.75, 1.0] },
    nota: 'H2 ventana de una semana para un efecto estructural.',
  },
  {
    id: 'c09',
    idioma: 'pt',
    texto: 'O desemprego caiu por causa do nosso programa de credito, sem duvida nenhuma.',
    espera: { causal: true, contraste: false, ventana: 'ninguna', score: [0.65, 1.0] },
    nota: 'H4 razonamiento motivado: causa unica y autoatribuida, sin alternativas.',
  },
  {
    id: 'c10',
    idioma: 'es',
    texto: 'El informe se publicara el proximo martes a las diez de la manana en la sede del ministerio.',
    espera: { causal: false, contraste: false, ventana: 'ninguna', score: [0.0, 0.25] },
    nota: 'Control negativo: no hay ninguna afirmacion causal.',
  },
];
