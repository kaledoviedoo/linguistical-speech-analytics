/**
 * Conjunto de control del motor de deteccion.
 *
 * No son citas reales de nadie: estan escritas para cubrir los casos limite del
 * esquema. La regla al escribirlas fue una sola — **la respuesta correcta tiene que
 * deducirse de las definiciones del prompt**, no de la opinion de quien anota.
 *
 * Los casos marcados `dificil: true` son aquellos donde personas razonables pueden
 * discrepar (atribucion a terceros, causalidad parcial). Se ejecutan y se muestran,
 * pero NO cuentan para las metricas: meter casos ambiguos en el denominador solo
 * sirve para ensuciar el numero.
 */

import type { CasoControl, ConjuntoDeControl } from './casos-tipos.js';

export const CASOS: CasoControl[] = [
  // ---------------------------------------------------------------- nucleo
  {
    id: 'c01',
    idioma: 'es',
    texto: 'La pobreza aumentó por culpa de las medidas que tomó la administración anterior.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.6, 1.0],
    },
    nota: 'H1: causalidad sin contraste ni plazo. El patron base.',
  },
  {
    id: 'c02',
    idioma: 'es',
    texto:
      'Desde la reforma de 2018, el empleo formal creció 6% en nuestra región, frente al 2% de las provincias vecinas en el mismo período de cinco años.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'razonable',
      },
      score: [0.0, 0.35],
    },
    nota: 'El caso defendible: grupo de comparacion explicito y ventana larga.',
  },
  {
    id: 'c03',
    idioma: 'es',
    texto: 'El dólar se disparó tres días después del anuncio, y eso lo provocó el anuncio.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'corta',
      },
      score: [0.7, 1.0],
    },
    nota: 'H2: ventana corta + post hoc ergo propter hoc.',
  },
  {
    id: 'c04',
    idioma: 'es',
    texto:
      'La caída del consumo puede haber sido influida por la suba de tasas, aunque también pesaron el clima y el precio internacional de los granos.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.0, 0.4],
    },
    nota: 'H3: hedging real y causas alternativas reconocidas. El matiz baja el score.',
  },
  {
    id: 'c05',
    idioma: 'es',
    texto:
      'Cuando nosotros gobernamos, la inflación bajó gracias a nuestro plan; cuando gobernaron ellos, subió por su incompetencia.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.75, 1.0],
    },
    nota: 'H5: asimetria culpa/merito con el mismo tipo de evidencia (ninguna).',
  },
  {
    id: 'c06',
    idioma: 'en',
    texto: 'The factory closures were caused entirely by the new import tariff.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.65, 1.0],
    },
    nota: 'H1 en ingles, con cuantificador absoluto ("entirely").',
  },
  {
    id: 'c07',
    idioma: 'en',
    texto:
      'Inflation fell from 9% to 4% over the two years after the policy, a decline also seen in most comparable economies during the same window.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'razonable',
      },
      score: [0.0, 0.35],
    },
    nota: 'Reconoce la tendencia comun: descarta implicitamente la causalidad unica.',
  },
  {
    id: 'c08',
    idioma: 'en',
    texto: 'Crime dropped the week we deployed the new patrols, so the patrols are why crime dropped.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'corta',
      },
      score: [0.75, 1.0],
    },
    nota: 'H2: ventana de una semana para un efecto estructural.',
  },
  {
    id: 'c09',
    idioma: 'pt',
    texto: 'O desemprego caiu por causa do nosso programa de crédito, sem dúvida nenhuma.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.65, 1.0],
    },
    nota: 'H4: causa unica y autoatribuida, sin alternativas.',
  },
  {
    id: 'c10',
    idioma: 'es',
    texto: 'El informe se publicará el próximo martes a las diez de la mañana en la sede del ministerio.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.0, 0.25],
    },
    nota: 'Control negativo: no hay ninguna afirmacion causal.',
  },

  // ------------------------------------------------- limites que faltaban
  {
    id: 'c11',
    idioma: 'es',
    texto: 'La crisis no fue causada por la reforma laboral.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.0, 0.3],
    },
    nota: 'Causalidad NEGADA. Hay verbo causal pero no se afirma A->B. Trampa clasica del lexico.',
  },
  {
    id: 'c12',
    idioma: 'es',
    texto: 'Si no hubiéramos intervenido, el desempleo habría subido tres puntos más.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.1, 0.5],
    },
    nota: 'Contrafactual explicito: afirma causalidad PERO aporta el marcador que la hace defendible.',
  },
  {
    id: 'c13',
    idioma: 'es',
    texto:
      'La sequía redujo la cosecha, lo que disparó los precios de los alimentos, y eso provocó las protestas de diciembre.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.7, 1.0],
    },
    nota: 'Cadena causal de tres eslabones, ninguno contrastado. Cada salto multiplica lo no verificado.',
  },
  {
    id: 'c14',
    idioma: 'es',
    texto:
      'Las dos series se movieron juntas durante ese trimestre, aunque no podemos afirmar que una explique la otra.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'razonable',
      },
      score: [0.0, 0.25],
    },
    nota: 'Correlacion declarada como correlacion. Es el opuesto exacto del patron que buscamos.',
  },
  {
    id: 'c15',
    idioma: 'es',
    texto: 'Tras dos años de vigencia de la reforma, el empleo creció por efecto directo de esa ley.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'razonable',
      },
      score: [0.4, 0.75],
    },
    nota: 'Causal fuerte con ventana razonable pero SIN comparacion: caso intermedio.',
  },
  {
    id: 'c16',
    idioma: 'es',
    texto: 'Nuestro desempleo bajó más que el de los países vecinos gracias a este plan.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.25, 0.6],
    },
    nota: 'Causal fuerte CON comparacion pero sin plazo: el otro caso intermedio.',
  },
  {
    id: 'c17',
    idioma: 'en',
    texto: 'The tariff may have contributed to the closures, alongside falling demand in the region.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.0, 0.4],
    },
    nota: 'H3 en ingles: "may have contributed" es hedging real, no retorico.',
  },
  {
    id: 'c18',
    idioma: 'en',
    texto: 'Without the stimulus package, output would have fallen by another two points.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.1, 0.5],
    },
    nota: 'Contrafactual en ingles. Mismo patron que c12, otro idioma.',
  },
  {
    id: 'c19',
    idioma: 'en',
    texto:
      'Within days of the announcement, our index rose 2%, while the regional index fell 1% over the same days.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: true,
        ventana_temporal_mencionada: 'corta',
      },
      score: [0.15, 0.5],
    },
    nota: 'Ventana corta PERO con comparacion. Separa "plazo corto" de "sin contraste".',
  },
  {
    id: 'c20',
    idioma: 'fr',
    texto: "La hausse des prix est due uniquement à la politique du gouvernement précédent.",
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.65, 1.0],
    },
    nota: 'H1 en frances, con exclusividad ("uniquement").',
  },
  {
    id: 'c21',
    idioma: 'de',
    texto: 'Die Reform hat die hohe Arbeitslosigkeit in dieser Region verursacht.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.6, 1.0],
    },
    nota: 'H1 en aleman. Confirma que la tarea es estructural y no depende del idioma.',
  },
  {
    id: 'c22',
    idioma: 'en',
    texto: 'The budget committee will meet on Thursday at nine in the main hall.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.0, 0.25],
    },
    nota: 'Segundo control negativo, en ingles.',
  },

  // --------------------------------------------------- ambiguos a proposito
  {
    id: 'd01',
    idioma: 'es',
    texto: 'Algunos analistas sostienen que el ajuste fiscal provocó la recesión.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: true,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.4, 0.9],
    },
    nota: 'Atribucion a terceros: el framing es causal pero el hablante no lo asume. Discutible.',
    dificil: true,
  },
  {
    id: 'd02',
    idioma: 'es',
    texto: 'El plan explica buena parte de la recuperación, aunque no toda.',
    espera: {
      campos: {
        tiene_lenguaje_causal_fuerte: false,
        tiene_contrafactual_o_comparacion: false,
        ventana_temporal_mencionada: 'ninguna',
      },
      score: [0.2, 0.6],
    },
    nota: 'Causalidad parcial cuantificada. Entre el matiz genuino y la atribucion. Discutible.',
    dificil: true,
  },
];

/** Solo los casos que puntuan. Los `dificil` se muestran aparte. */
export const CASOS_PUNTUABLES = CASOS.filter((c) => !c.dificil);

export const CONJUNTO_FRAMING_CAUSAL: ConjuntoDeControl = {
  criterio: 'framing-causal',
  casos: CASOS,
};
