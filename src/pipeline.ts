/**
 * Orquestador del pipeline completo:
 *   ingesta -> transcripcion -> segmentacion -> prefiltro -> LLM local -> reporte.
 *
 * Cada etapa persiste su salida en ./data/<hash>/ y se reutiliza en la siguiente
 * corrida salvo que se pase --forzar. Asi, cambiar el prompt o el umbral no obliga
 * a volver a transcribir 40 minutos de audio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXT_MEDIO, EXT_SUBTITULOS, EXT_TEXTO, VERSION_ESQUEMA } from './config.js';
import { descargarAudio, descargarSubtitulos } from './ingesta/descargar.js';
import { parsearArchivoTexto } from './ingesta/parsear-texto.js';
import { evaluarAfirmaciones, type MetricasLLM } from './motor/analizar.js';
import { motorOllama } from './motor/inferencia.js';
import { obtenerCriterio } from './criterios/registro.js';
import { CacheEvaluaciones } from './motor/cache.js';
import { estadoOllama, mensajeAyudaOllama, procesosCargados, tieneModelo } from './motor/ollama.js';
import { detectarIdiomaDocumento } from './procesamiento/idioma.js';
import { segmentarEnAfirmaciones, transcripcionSinPuntuacion } from './procesamiento/segmentar.js';
import { escribirReporte } from './reporte/generar.js';
import type {
  Afirmacion,
  OpcionesCorrida,
  ResultadoAfirmacion,
  Resultados,
  ResumenAnalisis,
  TipoEntrada,
  Transcripcion,
} from './tipos.js';
import { log, progreso } from './utilidades/log.js';
import { dirTrabajo, escribirJSON, esURL, hashDeEntrada, leerJSON } from './utilidades/rutas.js';

/**
 * Whisper y el decodificador de audio se cargan bajo demanda: un analisis de .srt
 * no deberia pagar el arranque de Transformers.js ni de wavefile.
 */
async function cargarTranscriptor() {
  const modulo = await import('./ingesta/transcribir.js');
  return modulo.transcribirMedio;
}

export interface OpcionesPipeline extends OpcionesCorrida {
  preferirSubtitulos: boolean;
  /** --subtitulos-asr: usa la ASR aunque el video tenga subtitulos publicados. */
  subtitulosASR: boolean;
}

export function detectarTipoEntrada(entrada: string): TipoEntrada {
  if (esURL(entrada)) return 'url';
  if (!fs.existsSync(entrada)) {
    throw new Error(`No existe el archivo "${entrada}" y tampoco parece una URL http(s).`);
  }
  const ext = path.extname(entrada).toLowerCase();
  if (EXT_MEDIO.has(ext)) return 'medio';
  if (EXT_SUBTITULOS.has(ext)) return 'subtitulos';
  if (EXT_TEXTO.has(ext)) return 'texto';
  throw new Error(
    `Extension "${ext || '(ninguna)'}" no soportada.\n` +
      `  Audio/video: ${[...EXT_MEDIO].join(' ')}\n` +
      `  Subtitulos:  ${[...EXT_SUBTITULOS].join(' ')}\n` +
      `  Texto:       ${[...EXT_TEXTO].join(' ')}`,
  );
}

/** Etapa 1+2: consigue una transcripcion con timestamps, venga de donde venga. */
async function obtenerTranscripcion(
  opciones: OpcionesPipeline,
  tipo: TipoEntrada,
  dir: string,
): Promise<{ transcripcion: Transcripcion; titulo: string | null }> {
  const rutaCache = path.join(dir, 'transcripcion.json');
  const rutaTitulo = path.join(dir, 'titulo.txt');
  const tituloCacheado = fs.existsSync(rutaTitulo) ? fs.readFileSync(rutaTitulo, 'utf8').trim() : null;

  if (!opciones.forzar) {
    const cache = leerJSON<Transcripcion>(rutaCache);
    if (cache && cache.segmentos?.length > 0) {
      log.ok(`Transcripcion reutilizada de cache (${cache.segmentos.length} segmentos, motor ${cache.motor}).`);
      return { transcripcion: cache, titulo: tituloCacheado };
    }
  }

  let segmentos;
  let motor: string;
  let timestampsReales = true;
  let duracion: number | null = null;
  let titulo: string | null = tituloCacheado;

  if (tipo === 'url') {
    if (opciones.preferirSubtitulos) {
      log.paso('2a', 'Buscando subtitulos publicados en el link (evita transcribir)...');
      const subs = await descargarSubtitulos(opciones.entrada, dir, opciones.cookiesNavegador, opciones.subtitulosASR);
      if (subs) {
        const origen = subs.auto ? 'transcripcion automatica de YouTube' : 'publicados por el canal';
        log.ok(`Subtitulos [${subs.lang}] ${origen}: ${path.basename(subs.ruta)}`);
        if (subs.auto) {
          log.aviso(
            'La ASR de YouTube no puntua de forma fiable. Las afirmaciones pueden quedar mal cortadas;\n' +
              '      si el resultado se ve troceado, corre sin --preferir-subtitulos para transcribir local.',
          );
        }
        const p = parsearArchivoTexto(subs.ruta);
        segmentos = p.segmentos;
        motor = `${p.motor}:yt-dlp-${subs.auto ? 'asr' : 'publicados'}`;
        timestampsReales = p.timestampsReales;
      }
    }
    if (!segmentos) {
      log.paso('2a', 'Descargando audio con yt-dlp (local)...');
      const d = await descargarAudio(opciones.entrada, dir, opciones.cookiesNavegador);
      titulo = d.titulo ?? titulo;
      log.ok(`Audio local: ${path.basename(d.ruta)}`);
      log.paso('2b', `Transcribiendo con ${opciones.modeloWhisper} (Transformers.js, en proceso)...`);
      const transcribirMedio = await cargarTranscriptor();
      const t = await transcribirMedio(d.ruta, dir, opciones.modeloWhisper, opciones.idiomaForzado);
      segmentos = t.segmentos;
      motor = t.motor;
      duracion = t.duracionSegundos;
    }
  } else if (tipo === 'medio') {
    log.paso(2, `Transcribiendo con ${opciones.modeloWhisper} (Transformers.js, en proceso)...`);
    const transcribirMedio = await cargarTranscriptor();
    const t = await transcribirMedio(opciones.entrada, dir, opciones.modeloWhisper, opciones.idiomaForzado);
    segmentos = t.segmentos;
    motor = t.motor;
    duracion = t.duracionSegundos;
  } else {
    log.paso(2, 'Parseando transcripcion existente (se salta Whisper)...');
    const p = parsearArchivoTexto(opciones.entrada);
    segmentos = p.segmentos;
    motor = p.motor;
    timestampsReales = p.timestampsReales;
  }

  motor = motor!;
  const textoCompleto = segmentos.map((s) => s.texto).join(' ');
  const idiomaDocumento = opciones.idiomaForzado ?? detectarIdiomaDocumento(textoCompleto);
  const ultimo = segmentos[segmentos.length - 1];

  const transcripcion: Transcripcion = {
    fuente: opciones.entrada,
    tipoEntrada: tipo,
    motor,
    idiomaDocumento,
    duracionSegundos: duracion ?? (ultimo ? ultimo.fin : null),
    timestampsReales,
    segmentos,
    creadoEn: new Date().toISOString(),
  };

  escribirJSON(rutaCache, transcripcion);
  log.ok(`Transcripcion lista: ${segmentos.length} segmentos, idioma dominante "${idiomaDocumento}".`);
  return { transcripcion, titulo };
}

function resumir(
  resultados: ResultadoAfirmacion[],
  umbral: number,
  msTotal: number,
  metricas: MetricasLLM,
  concurrencia: number,
  ejecucion: string,
): ResumenAnalisis {
  const evaluados = resultados.filter((r) => r.evaluada && r.evaluacion);
  const scores = evaluados.map((r) => r.evaluacion!.score);
  const idiomas: Record<string, number> = {};
  for (const r of resultados) idiomas[r.idiomaNombre] = (idiomas[r.idiomaNombre] ?? 0) + 1;

  return {
    totalSegmentos: resultados.length,
    preseleccionados: resultados.filter((r) => r.preseleccionada).length,
    evaluados: evaluados.length,
    fallidos: resultados.filter((r) => r.preseleccionada && !r.evaluada).length,
    sobreUmbral: scores.filter((s) => s >= umbral).length,
    umbralUsado: umbral,
    scorePromedio: scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)) : 0,
    idiomas,
    msTotalLLM: msTotal,
    rendimiento: {
      msCargaModelo: metricas.msCargaModelo,
      tokensGenerados: metricas.tokensGenerados,
      tokensPorSegundo: metricas.tokensPorSegundo,
      desdeCache: metricas.desdeCache,
      llamadas: metricas.llamadas,
      concurrencia,
      ejecucion,
    },
  };
}

/** Traduce /api/ps a una etiqueta legible: donde esta corriendo realmente el modelo. */
export async function dondeCorreElModelo(url: string, modelo: string): Promise<string> {
  const cargados = await procesosCargados(url);
  const m = cargados.find((c) => c.nombre === modelo || c.nombre.startsWith(modelo.split(':')[0] ?? ''));
  if (!m) return 'desconocido';
  if (m.porcentajeGPU >= 95) return 'gpu';
  if (m.porcentajeGPU <= 5) return 'cpu';
  return `mixto (${m.porcentajeGPU}% GPU)`;
}

export interface SalidaPipeline {
  rutaReporte: string;
  resultados: Resultados;
  hash: string;
}

export async function ejecutarPipeline(opciones: OpcionesPipeline): Promise<SalidaPipeline> {
  const criterio = obtenerCriterio(opciones.criterio);
  const motor = motorOllama(opciones.urlOllama, opciones.modelo);
  const tipo = detectarTipoEntrada(opciones.entrada);
  // La pista forzada es parte de la entrada: analizar el MISMO video por subtitulos
  // publicados y por ASR son dos corridas distintas y no deben pisarse los datos.
  const hash = hashDeEntrada(
    opciones.subtitulosASR ? `${opciones.entrada}#asr` : opciones.entrada,
    tipo !== 'url',
  );
  const dir = dirTrabajo(hash);

  log.paso(1, `Entrada detectada: ${tipo}  (hash ${hash})`);
  log.detalle(`Directorio de trabajo: ${dir}`);

  // --- Ollama antes que nada: si no esta, no tiene sentido transcribir 40 minutos.
  const estado = await estadoOllama(opciones.urlOllama);
  if (!estado.disponible || !tieneModelo(estado.modelos, opciones.modelo)) {
    throw new Error(await mensajeAyudaOllama(opciones.urlOllama, opciones.modelo, estado));
  }
  log.ok(`Ollama v${estado.version ?? '?'} responde en ${opciones.urlOllama} con "${opciones.modelo}".`);
  log.detalle(`Criterio de auditoria: ${criterio.nombre} (${criterio.id}) - ${criterio.descripcion}`);

  const { transcripcion, titulo } = await obtenerTranscripcion(opciones, tipo, dir);

  // --- Segmentacion + prefiltro
  log.paso(3, 'Segmentando en afirmaciones y aplicando el prefiltro del criterio...');
  if (transcripcionSinPuntuacion(transcripcion.segmentos)) {
    log.aviso(
      'La transcripcion no trae puntuacion (tipico de la ASR de YouTube).\n' +
        '      Se corta por las pausas del hablante en vez de por oraciones. Es peor que un\n' +
        '      subtitulo publicado: si el resultado no convence, corre sin --preferir-subtitulos.',
    );
  }
  let afirmaciones: Afirmacion[] = segmentarEnAfirmaciones(
    transcripcion.segmentos,
    transcripcion.idiomaDocumento,
    opciones.idiomaForzado,
    (texto) => criterio.marcadoresLexicos(texto),
  );
  if (!opciones.usarPrefiltro) {
    afirmaciones = afirmaciones.map((a) => ({ ...a, preseleccionada: true }));
  }
  if (opciones.limite !== null) {
    const preseleccionadas = afirmaciones.filter((a) => a.preseleccionada).slice(0, opciones.limite);
    const permitidas = new Set(preseleccionadas.map((a) => a.id));
    afirmaciones = afirmaciones.map((a) =>
      a.preseleccionada && !permitidas.has(a.id) ? { ...a, preseleccionada: false } : a,
    );
  }
  escribirJSON(path.join(dir, `afirmaciones-${criterio.id}.json`), afirmaciones);

  const aEvaluar = afirmaciones.filter((a) => a.preseleccionada).length;
  if (opciones.usarPrefiltro) {
    log.ok(`${afirmaciones.length} afirmaciones; ${aEvaluar} tienen marcadores del criterio y van al modelo.`);
  } else {
    const conConector = afirmaciones.filter((a) => a.marcadoresHeuristicos.length > 0).length;
    log.ok(
      `${afirmaciones.length} afirmaciones; van TODAS al modelo (prefiltro desactivado). ` +
        `Con conector habrian sido ${conConector}.`,
    );
  }
  if (aEvaluar === 0) {
    log.aviso('Ninguna afirmacion supero el prefiltro. Proba con --sin-prefiltro para mandarlas todas.');
  }

  // --- Motor de deteccion
  log.paso(4, `Evaluando "${criterio.nombre}" con ${opciones.modelo}` +
    (opciones.concurrencia > 1 ? ` (concurrencia ${opciones.concurrencia})` : '') + '...');

  const cache = opciones.usarCache
    ? new CacheEvaluaciones(
        path.join(dir, `cache-${criterio.id}.json`),
        opciones.modelo,
        criterio.hashPrompt,
        !opciones.forzar,
      )
    : null;
  if (cache && cache.tamano > 0) log.detalle(`Cache de evaluaciones: ${cache.tamano} entradas previas.`);

  const t0 = Date.now();
  const { resultados: resultadosAfirmaciones, metricas } = await evaluarAfirmaciones(
    afirmaciones,
    opciones,
    { criterio, motor, cache },
    (p) => progreso(p.hechas, p.total, p.tokensPorSegundo > 0 ? `${p.tokensPorSegundo} tok/s` : 'cache'),
  );
  const msTotal = Date.now() - t0;

  const ejecucion = await dondeCorreElModelo(opciones.urlOllama, opciones.modelo);
  const resumen = resumir(resultadosAfirmaciones, opciones.umbral, msTotal, metricas, opciones.concurrencia, ejecucion);
  const resultados: Resultados = {
    hash,
    fuente: opciones.entrada,
    tipoEntrada: tipo,
    motorTranscripcion: transcripcion.motor,
    idiomaDocumento: transcripcion.idiomaDocumento,
    modeloLLM: opciones.modelo,
    criterio: criterio.id,
    timestampsReales: transcripcion.timestampsReales,
    creadoEn: new Date().toISOString(),
    versionEsquema: VERSION_ESQUEMA,
    resumen,
    resultados: resultadosAfirmaciones,
  };
  escribirJSON(path.join(dir, `resultados-${criterio.id}.json`), resultados);

  if (resumen.fallidos > 0) {
    log.aviso(`${resumen.fallidos} afirmaciones no obtuvieron un JSON valido tras ${opciones.reintentos + 1} intentos.`);
  }
  log.ok(
    `${resumen.evaluados} evaluadas en ${(msTotal / 1000).toFixed(1)} s ` +
      `(${resumen.evaluados > 0 ? Math.round(msTotal / resumen.evaluados) : 0} ms por afirmacion). ` +
      `${resumen.sobreUmbral} sobre el umbral ${opciones.umbral}.`,
  );
  if (metricas.desdeCache > 0) {
    log.ok(`${metricas.desdeCache} salieron de la cache sin costar computo.`);
  }
  if (metricas.llamadas > 0) {
    log.detalle(
      `Rendimiento: ${metricas.tokensPorSegundo} tok/s, ${metricas.tokensGenerados} tokens generados, ` +
        `carga del modelo ${(metricas.msCargaModelo / 1000).toFixed(1)} s, ejecucion en ${ejecucion}.`,
    );
    if (ejecucion === 'cpu') {
      log.aviso(
        `El modelo esta corriendo en CPU (${metricas.tokensPorSegundo} tok/s). Es lo que hace que ` +
          `cada afirmacion tarde segundos y no milisegundos.`,
      );
      log.aviso(
        'La palanca util es un modelo mas chico (--modelo qwen2.5:1.5b). Subir --concurrencia ' +
          'en CPU suele empeorar: cada peticion paralela vuelve a evaluar el prompt de sistema entero.',
      );
    }
  }

  // --- Reporte
  log.paso(5, 'Generando reporte HTML autocontenido...');
  const ruta = escribirReporte({
    resultados,
    titulo,
    duracionSegundos: transcripcion.duracionSegundos,
    criterio: {
      id: criterio.id,
      nombre: criterio.nombre,
      descripcion: criterio.descripcion,
      alcance: criterio.alcance,
    },
  });

  return { rutaReporte: ruta, resultados, hash };
}
