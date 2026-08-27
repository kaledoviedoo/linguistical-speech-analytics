import type { EvaluacionAfirmacion } from './criterios/tipos.js';

/**
 * Tipos compartidos por todo el pipeline.
 *
 * Nota de alcance: este sistema audita la ESTRUCTURA del argumento causal,
 * no la veracidad del hecho. Ningun tipo aqui representa "verdad" o "falsedad".
 */

/** Como llego el contenido al sistema. */
export type TipoEntrada = 'url' | 'medio' | 'subtitulos' | 'texto';

/** Un tramo de transcripcion con marca de tiempo en segundos. */
export interface SegmentoTranscripcion {
  inicio: number;
  fin: number;
  texto: string;
}

export interface Transcripcion {
  /** Ruta o URL original entregada por el usuario. */
  fuente: string;
  tipoEntrada: TipoEntrada;
  /** Motor que produjo la transcripcion: "whisper:Xenova/whisper-base", "srt", "vtt", "texto". */
  motor: string;
  /** Idioma dominante detectado en el documento completo (ISO 639-1 aproximado). */
  idiomaDocumento: string;
  duracionSegundos: number | null;
  /** true si los timestamps son reales; false si son estimados (texto plano sin tiempos). */
  timestampsReales: boolean;
  segmentos: SegmentoTranscripcion[];
  creadoEn: string;
}

/** Una afirmacion individual lista para auditar. */
export interface Afirmacion {
  id: string;
  indice: number;
  inicio: number;
  fin: number;
  texto: string;
  /** ISO 639-1 aproximado ("es", "en", "pt"...) o el codigo 639-3 si no hay mapeo. */
  idioma: string;
  /** Nombre legible del idioma, para el reporte. */
  idiomaNombre: string;
  /** Marcadores lexicos que detecto el prefiltro del criterio activo. */
  marcadoresHeuristicos: string[];
  /** true si supera el prefiltro y debe ir al LLM. */
  preseleccionada: boolean;
}

export interface ResultadoAfirmacion extends Afirmacion {
  /** Forma universal: score, justificacion y marcadores. Los campos propios del
   *  criterio quedan dentro, en `campos`, sin que el pipeline los interprete. */
  evaluacion: EvaluacionAfirmacion | null;
  evaluada: boolean;
  /** true si la evaluacion salio de la cache y no costo computo. */
  desdeCache: boolean;
  /** Velocidad de generacion de esta llamada; ausente si vino de cache. */
  tokensPorSegundo?: number;
  /** Por que no se evaluo (p. ej. "no supero el prefiltro heuristico"). */
  motivoOmision?: string;
  /** Error del LLM si la evaluacion fallo tras todos los reintentos. */
  error?: string;
  /** Correcciones que el validador tuvo que aplicar a la respuesta del modelo. */
  ajustes?: string[];
  intentos: number;
  msLLM: number;
}

export interface ResumenAnalisis {
  totalSegmentos: number;
  preseleccionados: number;
  evaluados: number;
  fallidos: number;
  sobreUmbral: number;
  umbralUsado: number;
  scorePromedio: number;
  idiomas: Record<string, number>;
  msTotalLLM: number;
  /** Diagnostico de rendimiento: cuello de botella real de la corrida. */
  rendimiento: {
    msCargaModelo: number;
    tokensGenerados: number;
    tokensPorSegundo: number;
    desdeCache: number;
    llamadas: number;
    concurrencia: number;
    /** 'gpu' | 'cpu' | 'mixto' | 'desconocido', segun /api/ps. */
    ejecucion: string;
  };
}

export interface Resultados {
  hash: string;
  fuente: string;
  tipoEntrada: TipoEntrada;
  motorTranscripcion: string;
  idiomaDocumento: string;
  modeloLLM: string;
  /** id del criterio de auditoria con el que se produjo este analisis. */
  criterio: string;
  timestampsReales: boolean;
  creadoEn: string;
  versionEsquema: number;
  resumen: ResumenAnalisis;
  resultados: ResultadoAfirmacion[];
}

/** Opciones efectivas de una corrida, ya resueltas desde CLI + entorno. */
export interface OpcionesCorrida {
  entrada: string;
  modelo: string;
  modeloWhisper: string;
  urlOllama: string;
  umbral: number;
  idiomaForzado: string | null;
  abrirReporte: boolean;
  forzar: boolean;
  usarPrefiltro: boolean;
  limite: number | null;
  reintentos: number;
  concurrencia: number;
  usarCache: boolean;
  /** id del criterio de auditoria a aplicar. */
  criterio: string;
  /** Navegador del que yt-dlp toma cookies para videos que exigen sesion. */
  cookiesNavegador: string | null;
  verboso: boolean;
}
