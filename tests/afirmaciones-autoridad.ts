/**
 * Conjunto de control del criterio APELACION A AUTORIDAD.
 *
 * Misma regla que en el causal: la respuesta correcta tiene que deducirse de las
 * definiciones del prompt, no de la opinion de quien anota. Y la misma advertencia
 * de alcance: ninguno de estos casos dice si la autoridad citada tiene razon. Solo
 * si el oyente puede ir a comprobarlo.
 *
 * Son 14 casos, no 24: el criterio es mas nuevo y prefiero pocos casos claros antes
 * que muchos discutibles. Crece cuando haya material real anotado.
 */
import type { CasoControl, ConjuntoDeControl } from './casos-tipos.js';

export const CASOS_AUTORIDAD: CasoControl[] = [
  {
    id: 'a01',
    idioma: 'es',
    texto: 'Todos los estudios demuestran que esta política funciona.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'vago',
      },
      score: [0.7, 1.0],
    },
    nota: 'El patron base: autoridad anonima, cantidad sin precisar, presentado como zanjado.',
  },
  {
    id: 'a02',
    idioma: 'es',
    texto:
      'El informe del Banco Central de marzo, sobre una muestra de 1.200 empresas, encontró una caída del 3%.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: true,
        alcance_de_la_evidencia: 'especifico',
      },
      score: [0.0, 0.3],
    },
    nota: 'El caso defendible: organismo, fecha y tamano de muestra. Se puede ir a verificarlo.',
  },
  {
    id: 'a03',
    idioma: 'es',
    texto: 'Todo el mundo sabe que ese camino no lleva a ningún lado.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.75, 1.0],
    },
    nota: 'Apelacion al saber comun: reemplaza la evidencia por la supuesta obviedad.',
  },
  {
    id: 'a04',
    idioma: 'es',
    texto: 'La reunión del gabinete se adelantó para el jueves a las nueve.',
    espera: {
      campos: {
        invoca_autoridad: false,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.0, 0.25],
    },
    nota: 'Control negativo: describe un hecho sin apoyarse en ninguna autoridad.',
  },
  {
    id: 'a05',
    idioma: 'es',
    texto: 'Está científicamente probado que esta medida reduce la pobreza. Nadie serio lo discute.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.8, 1.0],
    },
    nota: 'Cierre del debate: "probado" y "nadie lo discute" sin decir con que evidencia.',
  },
  {
    id: 'a06',
    idioma: 'es',
    texto:
      'Según el estudio de Martínez y Rojas publicado el año pasado, aunque con una muestra pequeña, el efecto sería moderado.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: true,
        alcance_de_la_evidencia: 'vago',
      },
      score: [0.2, 0.6],
    },
    nota: 'Caso intermedio: fuente identificable pero alcance impreciso. Y reconoce la limitacion.',
  },
  {
    id: 'a07',
    idioma: 'en',
    texto: 'Experts agree that the reform was a mistake.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.7, 1.0],
    },
    nota: 'El patron base en ingles: "experts agree" sin nombrar a ninguno.',
  },
  {
    id: 'a08',
    idioma: 'en',
    texto:
      'A 2023 OECD report covering 38 countries found that unemployment fell by 1.2 points on average.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: true,
        alcance_de_la_evidencia: 'especifico',
      },
      score: [0.0, 0.3],
    },
    nota: 'El caso defendible en ingles: organismo, ano, cobertura y magnitud.',
  },
  {
    id: 'a09',
    idioma: 'en',
    texto: 'The scientists in our team confirmed it, and that should be enough.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.7, 1.0],
    },
    nota: 'Autoridad interna y sin nombre, ademas presentada como suficiente por si sola.',
  },
  {
    id: 'a10',
    idioma: 'pt',
    texto: 'Os especialistas garantem que não há outro caminho.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.7, 1.0],
    },
    nota: 'El patron base en portugues.',
  },

  // ------------------------------------- material real (discurso ONU, es)
  // Los dos son NORMATIVOS: proponen que algo deberia hacerse. No invocan ninguna
  // fuente de conocimiento. El modelo los marco con score 0.80 en la medicion sobre
  // el discurso completo, asi que entran al conjunto como controles negativos: el
  // conjunto anterior no tenia una sola oracion normativa y por eso no veia el fallo.
  {
    id: 'a11',
    idioma: 'es',
    texto:
      'El plan debe ser vinculante a los estados nacionales, realizado en una democracia global, ' +
      'supervisado en su cumplimiento por el Consejo de Seguridad sin veto.',
    espera: {
      campos: {
        invoca_autoridad: false,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.0, 0.3],
    },
    nota: 'Propuesta normativa. Nombrar una institucion como ejecutora no es apoyarse en ella como fuente.',
  },
  {
    id: 'a12',
    idioma: 'es',
    texto:
      'Las Naciones Unidas deben hacer respetar los tribunales internacionales de justicia ' +
      'y debe hacer cumplir la sentencia de su justicia.',
    espera: {
      campos: {
        invoca_autoridad: false,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.0, 0.3],
    },
    nota: 'Otra normativa. El criterio pregunta si la afirmacion SE APOYA en una autoridad, no si la menciona.',
  },

  // ---------------------------------------------------- ambiguos a proposito
  {
    id: 'b01',
    idioma: 'es',
    texto: 'Un premio Nobel de Física dijo que el plan económico es inviable.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'ninguno',
      },
      score: [0.5, 1.0],
    },
    nota: 'Autoridad fuera de dominio: prestigio real, campo equivocado. Discutible si "identificable".',
    dificil: true,
  },
  {
    id: 'b02',
    idioma: 'es',
    texto: 'La evidencia disponible apunta en esa dirección, aunque todavía es preliminar.',
    espera: {
      campos: {
        invoca_autoridad: true,
        fuente_identificable: false,
        alcance_de_la_evidencia: 'vago',
      },
      score: [0.2, 0.6],
    },
    nota: 'Invoca evidencia generica PERO admite que es preliminar. El matiz deberia bajar el score.',
    dificil: true,
  },
];

export const CONJUNTO_APELACION_AUTORIDAD: ConjuntoDeControl = {
  criterio: 'apelacion-autoridad',
  casos: CASOS_AUTORIDAD,
};
