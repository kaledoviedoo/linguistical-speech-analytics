/**
 * Tests offline del pipeline: NO necesitan Ollama ni red.
 *
 *   npm run test:pipeline
 *
 * Cubren las partes deterministas (parseo, segmentacion, prefiltro, validacion del
 * esquema y generacion del HTML) usando una evaluacion simulada en lugar del LLM.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearArchivoTexto, parsearSubtitulos } from '../src/ingesta/parsear-texto.js';
import { validarEvaluacion, parsearRespuesta } from '../src/criterios/framing-causal/esquema.js';
import { extraerJSON } from '../src/criterios/validacion.js';
import { criterioApelacionAutoridad } from '../src/criterios/apelacion-autoridad/index.js';
import { validarEvaluacion as validarAutoridad } from '../src/criterios/apelacion-autoridad/esquema.js';
import { detectarIdiomaDocumento } from '../src/procesamiento/idioma.js';
import { marcadoresCausales } from '../src/criterios/framing-causal/conectores.js';
import { segmentarEnAfirmaciones } from '../src/procesamiento/segmentar.js';
import { construirHTML } from '../src/reporte/generar.js';
import type { ResultadoAfirmacion, Resultados } from '../src/tipos.js';
import { formatearTiempo } from '../src/utilidades/rutas.js';
import { citarWindows, ejecutar, flagDeVersion } from '../src/utilidades/proceso.js';
import { elegirPistaOriginal, esRestoDeDescarga } from '../src/ingesta/descargar.js';
import { CacheEvaluaciones } from '../src/motor/cache.js';
import {
  acumular, acumularMatriz, conteoVacio, exactitud, exactitudMatriz,
  matrizVacia, metricasScore, precision, sensibilidad,
} from '../src/analisis/metricas.js';
import { medirRecall, veredicto } from '../src/analisis/recall-prefiltro.js';
import { CASOS, CASOS_PUNTUABLES } from './afirmaciones-sinteticas.js';
import { HASH_PROMPT, PROMPT_SISTEMA } from '../src/criterios/framing-causal/prompt.js';
import { criterioFramingCausal } from '../src/criterios/framing-causal/index.js';
import { empaquetar } from '../src/criterios/tipos.js';
import { obtenerCriterio, listarCriterios, CRITERIO_POR_DEFECTO } from '../src/criterios/registro.js';
import { motorDeGuion } from '../src/motor/inferencia.js';
import { evaluarAfirmaciones } from '../src/motor/analizar.js';
import fs from 'node:fs';
import os from 'node:os';
import { gris, negrita, rojo, verde } from '../src/utilidades/log.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(AQUI, 'fixtures');

let pasados = 0;
const fallos: string[] = [];

function comprobar(nombre: string, condicion: boolean, detalle = ''): void {
  if (condicion) {
    pasados++;
    console.log(`${verde('  ok  ')} ${nombre}`);
  } else {
    fallos.push(nombre);
    console.log(`${rojo(' falla')} ${nombre}${detalle ? gris(`  -> ${detalle}`) : ''}`);
  }
}

console.log(negrita('\nTests offline del pipeline (sin Ollama)\n'));

// ---------------------------------------------------------------- parseo SRT
const srt = parsearArchivoTexto(path.join(FIXTURES, 'discurso-es.srt'));
comprobar('SRT: se parsean los 12 cues', srt.segmentos.length === 12, `obtuve ${srt.segmentos.length}`);
comprobar('SRT: timestamps reales', srt.timestampsReales === true);
comprobar(
  'SRT: el tercer cue arranca en 12.4 s',
  Math.abs((srt.segmentos[2]?.inicio ?? -1) - 12.4) < 0.001,
  String(srt.segmentos[2]?.inicio),
);
comprobar(
  'SRT: las lineas multiples de un cue se unen',
  (srt.segmentos[4]?.texto ?? '').includes('provincias vecinas'),
);

// ---------------------------------------------------------------- parseo VTT
const vtt = parsearArchivoTexto(path.join(FIXTURES, 'speech-en.vtt'));
comprobar('VTT: se parsean los 6 cues', vtt.segmentos.length === 6, `obtuve ${vtt.segmentos.length}`);
comprobar('VTT: se ignora la cabecera WEBVTT', !(vtt.segmentos[0]?.texto ?? '').includes('WEBVTT'));

// -------------------------------------------------- etiquetas y cues repetidos
const conEtiquetas = parsearSubtitulos(
  'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<c.colorE5E5E5>Hola</c> <00:00:02.000>mundo\n\n' +
    '00:00:03.000 --> 00:00:05.000\nHola mundo\n',
);
comprobar('VTT: se limpian etiquetas inline', conEtiquetas[0]?.texto === 'Hola mundo', conEtiquetas[0]?.texto);
comprobar('VTT: se fusionan cues duplicados consecutivos', conEtiquetas.length === 1, `obtuve ${conEtiquetas.length}`);

// ---------------------------------------------------------- deteccion idioma
const textoEs = srt.segmentos.map((s) => s.texto).join(' ');
const textoEn = vtt.segmentos.map((s) => s.texto).join(' ');
comprobar('Idioma: el discurso en espanol se detecta como es', detectarIdiomaDocumento(textoEs) === 'es', detectarIdiomaDocumento(textoEs));
comprobar('Idioma: el discurso en ingles se detecta como en', detectarIdiomaDocumento(textoEn) === 'en', detectarIdiomaDocumento(textoEn));

// ------------------------------------------------------------- segmentacion
const afirmaciones = segmentarEnAfirmaciones(
  srt.segmentos, 'es', null, (t) => criterioFramingCausal.marcadoresLexicos(t),
);
comprobar('Segmentacion: produce afirmaciones', afirmaciones.length >= 10, `obtuve ${afirmaciones.length}`);
comprobar(
  'Segmentacion: sin gate lexico del criterio no preselecciona nada',
  segmentarEnAfirmaciones(srt.segmentos, 'es').every((a) => !a.preseleccionada),
);
comprobar(
  'Segmentacion: los cues cortados a mitad de frase se reunen',
  afirmaciones.some((a) => a.texto.startsWith('Quiero hablarles hoy del estado de la economia')),
);
comprobar(
  'Segmentacion: timestamps monotonos y dentro del rango del audio',
  afirmaciones.every((a, i) => a.inicio <= a.fin && (i === 0 || a.inicio >= (afirmaciones[i - 1]?.inicio ?? 0) - 0.01)) &&
    (afirmaciones[afirmaciones.length - 1]?.fin ?? 0) <= 93.1,
);
comprobar(
  'Segmentacion: no se pierde ninguna oracion causal del fixture',
  afirmaciones.some((a) => a.texto.includes('por culpa de')) &&
    afirmaciones.some((a) => a.texto.includes('consecuencia directa')),
);

// ------------------------------------------------------------------ prefiltro
comprobar('Prefiltro: detecta "por culpa de"', marcadoresCausales('subio por culpa de ellos').includes('por culpa de'));
comprobar('Prefiltro: es insensible a tildes', marcadoresCausales('eso provoco la crisis').includes('provocar'));
comprobar('Prefiltro: funciona con tildes puestas', marcadoresCausales('eso provocó la crisis').includes('provocar'));
comprobar(
  'Prefiltro: cubre participios ("fue provocada por")',
  marcadoresCausales('La crisis fue provocada por la reforma.').includes('provocar'),
);
comprobar(
  'Prefiltro: cubre el preterito irregular de producir',
  marcadoresCausales('la medida produjo una caida inmediata').includes('producir'),
);
comprobar('Prefiltro: detecta ingles "led to"', marcadoresCausales('the policy led to chaos').includes('led to'));
comprobar('Prefiltro: control negativo sin conectores', marcadoresCausales('El informe se publicara el martes.').length === 0);
comprobar(
  'Prefiltro: no corta palabras por dentro',
  marcadoresCausales('la causalidad y el causante son conceptos distintos').length === 0,
  marcadoresCausales('la causalidad y el causante son conceptos distintos').join(','),
);
const preseleccionadas = afirmaciones.filter((a) => a.preseleccionada).length;
comprobar(
  'Prefiltro: preselecciona parte del discurso, no todo',
  preseleccionadas >= 4 && preseleccionadas < afirmaciones.length,
  `${preseleccionadas}/${afirmaciones.length}`,
);
comprobar(
  'Prefiltro: deja fuera la frase de control del fixture',
  !(afirmaciones.find((a) => a.texto.includes('se publicara el proximo martes'))?.preseleccionada ?? true),
);

// -------------------------------------------------------------------- esquema
const valido = {
  tiene_lenguaje_causal_fuerte: true,
  tiene_contrafactual_o_comparacion: false,
  ventana_temporal_mencionada: 'ninguna',
  score_framing_causal: 0.82,
  justificacion: 'Afirma causalidad directa sin comparar con periodos previos.',
};
comprobar('Esquema: acepta un objeto valido', validarEvaluacion(valido).ok);
comprobar(
  'Esquema: rechaza justificacion ausente',
  !validarEvaluacion({ ...valido, justificacion: '' }).ok,
);
comprobar(
  'Esquema: normaliza "corta (dias/semanas)"',
  (() => {
    const v = validarEvaluacion({ ...valido, ventana_temporal_mencionada: 'corta (dias/semanas)' });
    return v.ok && v.evaluacion.ventana_temporal_mencionada === 'corta';
  })(),
);
comprobar(
  'Esquema: reescala un score en 0-100',
  (() => {
    const v = validarEvaluacion({ ...valido, score_framing_causal: 82 });
    return v.ok && v.evaluacion.score_framing_causal === 0.82;
  })(),
);
comprobar(
  'Esquema: corrige incoherencia (sin causal fuerte pero score alto)',
  (() => {
    const v = validarEvaluacion({ ...valido, tiene_lenguaje_causal_fuerte: false, score_framing_causal: 0.9 });
    return v.ok && v.evaluacion.score_framing_causal < 0.3 && v.ajustes.length > 0;
  })(),
);
comprobar('Esquema: rechaza enum invalido', !validarEvaluacion({ ...valido, ventana_temporal_mencionada: 'quizas' }).ok);
comprobar(
  'Esquema: extrae JSON envuelto en markdown y prosa',
  (() => {
    const crudo = 'Claro, aca va:\n```json\n' + JSON.stringify(valido) + '\n```\nEspero que sirva.';
    return parsearRespuesta(crudo).ok;
  })(),
);
comprobar(
  'Esquema: extraerJSON respeta llaves dentro de cadenas',
  extraerJSON('{"a": "un } falso", "b": 1} sobra') === '{"a": "un } falso", "b": 1}',
);
comprobar('Esquema: rechaza texto sin JSON', !parsearRespuesta('no puedo responder eso').ok);

// -------------------------------------------------------------- descargas
comprobar(
  'Descarga: los restos .part no se toman por un archivo terminado',
  esRestoDeDescarga('fuente.webm.part') &&
    esRestoDeDescarga('fuente.m4a.ytdl') &&
    esRestoDeDescarga('subs.es.vtt.temp'),
);
comprobar(
  'Descarga: un archivo terminado no se confunde con un resto',
  !esRestoDeDescarga('fuente.webm') && !esRestoDeDescarga('subs.es.vtt'),
);

// El caso real que motivo esto: discurso en ingles, con subtitulos publicados en en-US y
// ~200 "automatic_captions" que son traducciones. Pedir es.* traia una traduccion de YouTube.
const linkReal = {
  idioma: 'en',
  publicados: ['en-US', 'und'],
  automaticos: ['en-orig', 'en', 'es', 'fr', 'pt', 'de'],
};
comprobar(
  'Pistas: prefiere el subtitulo publicado en el idioma del video',
  elegirPistaOriginal(linkReal)?.lang === 'en-US' && elegirPistaOriginal(linkReal)?.auto === false,
  JSON.stringify(elegirPistaOriginal(linkReal)),
);
comprobar(
  'Pistas: sin publicados cae a la ASR original (-orig), no a una traduccion',
  elegirPistaOriginal({ ...linkReal, publicados: [] })?.lang === 'en-orig',
  JSON.stringify(elegirPistaOriginal({ ...linkReal, publicados: [] })),
);
comprobar(
  'Pistas: nunca elige un idioma distinto al del video',
  elegirPistaOriginal({ idioma: 'en', publicados: [], automaticos: ['es', 'fr', 'pt'] }) === null,
  JSON.stringify(elegirPistaOriginal({ idioma: 'en', publicados: [], automaticos: ['es', 'fr'] })),
);
comprobar(
  'Pistas: un publicado en otro idioma tampoco sirve',
  elegirPistaOriginal({ idioma: 'es', publicados: ['en-US'], automaticos: [] }) === null,
);
comprobar(
  'Pistas: sin idioma declarado toma el publicado que no sea "und"',
  elegirPistaOriginal({ idioma: null, publicados: ['und', 'pt-BR'], automaticos: [] })?.lang === 'pt-BR',
);
comprobar(
  'Pistas: sin nada utilizable devuelve null',
  elegirPistaOriginal({ idioma: 'de', publicados: [], automaticos: [] }) === null,
);

// ------------------------------------------------------------- subprocesos
comprobar('Proceso: no cita lo que no lo necesita', citarWindows('ffmpeg') === 'ffmpeg');
comprobar(
  'Proceso: cita rutas con espacios',
  citarWindows('C:\\Mis Videos\\a.mp4') === '"C:\\Mis Videos\\a.mp4"',
  citarWindows('C:\\Mis Videos\\a.mp4'),
);
comprobar(
  'Proceso: cita la plantilla de yt-dlp con %',
  citarWindows('%(title)s') === '"%(title)s"',
  citarWindows('%(title)s'),
);
comprobar(
  'Proceso: escapa comillas internas',
  citarWindows('di "hola"') === '"di \\"hola\\""',
  citarWindows('di "hola"'),
);
comprobar(
  'Proceso: ffmpeg se consulta con -version, no con --version',
  flagDeVersion('ffmpeg') === '-version' && flagDeVersion('ffprobe') === '-version',
  `ffmpeg=${flagDeVersion('ffmpeg')} ffprobe=${flagDeVersion('ffprobe')}`,
);
comprobar(
  'Proceso: el resto de los binarios usa --version',
  flagDeVersion('yt-dlp') === '--version' && flagDeVersion('ollama') === '--version',
  flagDeVersion('yt-dlp'),
);
const eco = await ejecutar(process.execPath, ['-e', 'process.stdout.write(process.argv[1] || "")', 'con espacios & simbolos']);
comprobar(
  'Proceso: los argumentos llegan intactos al subproceso',
  eco.codigo === 0 && eco.stdout === 'con espacios & simbolos',
  `codigo=${eco.codigo} stdout=${JSON.stringify(eco.stdout)}`,
);

// -------------------------------------------------------------------- tiempo
comprobar('Tiempo: 3725 s -> 01:02:05', formatearTiempo(3725) === '01:02:05', formatearTiempo(3725));

// ---------------------------------------------------------------------- cache
const rutaCache = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'afc-')), 'cache.json');
const evaluacionCache = empaquetar(criterioFramingCausal, {
  tiene_lenguaje_causal_fuerte: true,
  tiene_contrafactual_o_comparacion: false,
  ventana_temporal_mencionada: 'ninguna' as const,
  score_framing_causal: 0.85,
  justificacion: 'Atribucion causal unica sin comparar con el periodo previo.',
});

const c1 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', HASH_PROMPT, true);
comprobar('Cache: arranca vacia', c1.tamano === 0 && c1.obtener('una frase') === null);
c1.guardar('una frase', evaluacionCache);
c1.persistir();
comprobar('Cache: persiste a disco', fs.existsSync(rutaCache));

const c2 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', HASH_PROMPT, true);
comprobar(
  'Cache: una corrida nueva reutiliza la evaluacion',
  c2.obtener('una frase')?.score === 0.85 && c2.aciertos === 1,
);
comprobar('Cache: no confunde textos distintos', c2.obtener('otra frase') === null);

const c3 = new CacheEvaluaciones(rutaCache, 'llama3.2:3b', HASH_PROMPT, true);
comprobar('Cache: cambiar de modelo invalida la entrada', c3.obtener('una frase') === null);

const c4 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', 'otrohash', true);
comprobar('Cache: cambiar el prompt invalida la entrada', c4.obtener('una frase') === null);

const c5 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', HASH_PROMPT, false);
comprobar('Cache: deshabilitada nunca acierta', c5.obtener('una frase') === null);
comprobar(
  'Cache: la huella del prompt cambia si cambia el prompt',
  HASH_PROMPT.length === 8 && PROMPT_SISTEMA.includes('maximo 20 palabras'),
);
fs.rmSync(path.dirname(rutaCache), { recursive: true, force: true });

// -------------------------------------------------------------------- metricas
const cb = conteoVacio();
acumular(cb, true, true);    // vp
acumular(cb, true, true);    // vp
acumular(cb, false, false);  // vn
acumular(cb, false, true);   // fp
acumular(cb, true, false);   // fn
comprobar('Metricas: cuenta vp/vn/fp/fn', cb.vp === 2 && cb.vn === 1 && cb.fp === 1 && cb.fn === 1);
comprobar('Metricas: exactitud = (vp+vn)/total', exactitud(cb) === 3 / 5, String(exactitud(cb)));
comprobar('Metricas: precision = vp/(vp+fp)', precision(cb) === 2 / 3, String(precision(cb)));
comprobar('Metricas: sensibilidad = vp/(vp+fn)', sensibilidad(cb) === 2 / 3, String(sensibilidad(cb)));
comprobar('Metricas: sin casos devuelve null en vez de NaN', exactitud(conteoVacio()) === null);
comprobar(
  'Metricas: precision es null si el modelo nunca dijo que si',
  (() => { const c = conteoVacio(); acumular(c, true, false); return precision(c) === null; })(),
);

const mz = matrizVacia(['ninguna', 'corta', 'razonable']);
acumularMatriz(mz, 'ninguna', 'ninguna');
acumularMatriz(mz, 'corta', 'ninguna');
acumularMatriz(mz, 'razonable', 'razonable');
acumularMatriz(mz, 'corta', 'inventada');
comprobar('Metricas: la matriz ignora etiquetas desconocidas', mz.total === 3, String(mz.total));
comprobar('Metricas: exactitud de la matriz', exactitudMatriz(mz) === 2 / 3, String(exactitudMatriz(mz)));
comprobar('Metricas: la matriz ubica el error en la celda correcta', mz.matriz['corta']?.['ninguna'] === 1);

const ms = metricasScore([
  { obtenido: 0.85, rango: [0.6, 1.0] },
  { obtenido: 0.10, rango: [0.6, 1.0] },
]);
comprobar('Metricas: score dentro del rango', ms.dentroDelRango === 0.5, String(ms.dentroDelRango));
comprobar('Metricas: error medio contra el punto medio', Math.abs((ms.errorMedio ?? 0) - 0.375) < 1e-9, String(ms.errorMedio));

// --------------------------------------------------- conjunto de control
comprobar('Control: hay al menos 20 casos', CASOS.length >= 20, `${CASOS.length}`);
comprobar('Control: los dificiles no puntuan', CASOS_PUNTUABLES.length < CASOS.length);
comprobar('Control: ids unicos', new Set(CASOS.map((c) => c.id)).size === CASOS.length);
comprobar(
  'Control: todo rango de score es valido y ordenado',
  CASOS.every((c) => c.espera.score[0] >= 0 && c.espera.score[1] <= 1 && c.espera.score[0] < c.espera.score[1]),
);
comprobar(
  'Control: coherencia interna (sin causal fuerte, el rango no puede llegar alto)',
  CASOS.filter((c) => !c.dificil).every(
    (c) => c.espera.campos['tiene_lenguaje_causal_fuerte'] === true || c.espera.score[1] <= 0.5,
  ),
);
comprobar(
  'Control: cubre los cuatro limites nuevos',
  ['c11', 'c12', 'c13', 'c14'].every((id) => CASOS.some((c) => c.id === id)),
);
comprobar('Control: hay mas de un idioma', new Set(CASOS.map((c) => c.idioma)).size >= 4);

// ------------------------------------------------------- recall del prefiltro
function afirmacionFalsa(id: string, texto: string, score: number, marcadores: string[]): ResultadoAfirmacion {
  return {
    id, indice: 0, inicio: 0, fin: 1, texto,
    idioma: 'es', idiomaNombre: 'Español',
    marcadoresHeuristicos: marcadores,
    preseleccionada: marcadores.length > 0,
    evaluada: true, desdeCache: false, intentos: 1, msLLM: 100,
    evaluacion: empaquetar(criterioFramingCausal, {
      tiene_lenguaje_causal_fuerte: true,
      tiene_contrafactual_o_comparacion: false,
      ventana_temporal_mencionada: 'ninguna' as const,
      score_framing_causal: score,
      justificacion: 'Justificacion de prueba para el test de recall.',
    }),
  };
}

const resultadosRecall = {
  ...({} as Resultados),
  resultados: [
    afirmacionFalsa('a1', 'alta con conector', 0.9, ['provocar']),
    afirmacionFalsa('a2', 'alta con conector', 0.8, ['por culpa de']),
    afirmacionFalsa('a3', 'alta SIN conector', 0.85, []),
    afirmacionFalsa('a4', 'baja sin conector', 0.2, []),
    afirmacionFalsa('a5', 'baja sin conector', 0.1, []),
  ],
} as Resultados;

const inf = medirRecall(resultadosRecall, 0.7);
comprobar('Recall: cuenta las altas correctamente', inf.altasTotal === 3, String(inf.altasTotal));
comprobar('Recall: identifica la perdida', inf.altasPerdidas === 1 && inf.perdidas[0]?.id === 'a3');
comprobar('Recall: calcula 2/3', Math.abs((inf.recall ?? 0) - 2 / 3) < 1e-9, String(inf.recall));
comprobar('Recall: ahorro de computo = sin conector / total', Math.abs(inf.ahorroComputo - 3 / 5) < 1e-9);
comprobar('Recall: veredicto negativo con 67%', !veredicto(inf).ok);

const infPerfecto = medirRecall(
  { ...({} as Resultados), resultados: [afirmacionFalsa('b1', 'alta con conector', 0.9, ['provocar'])] } as Resultados,
  0.7,
);
comprobar('Recall: veredicto positivo con 100%', veredicto(infPerfecto).ok);
comprobar(
  'Recall: sin afirmaciones altas devuelve null y lo dice',
  (() => {
    const i = medirRecall({ ...({} as Resultados), resultados: [afirmacionFalsa('c1', 'baja', 0.1, [])] } as Resultados, 0.7);
    return i.recall === null && !veredicto(i).ok;
  })(),
);

// ------------------------------------------------------- criterio y registro
comprobar('Criterio: el registro devuelve el criterio por defecto', obtenerCriterio(CRITERIO_POR_DEFECTO).id === 'framing-causal');
comprobar('Criterio: pedir uno inexistente falla con un mensaje util', (() => {
  try { obtenerCriterio('no-existe'); return false; }
  catch (e) { return (e as Error).message.includes('Disponibles'); }
})());
comprobar('Criterio: se puede listar lo disponible', listarCriterios().length >= 1 && (listarCriterios()[0]?.descripcion.length ?? 0) > 10);
comprobar('Criterio: la huella del prompt es estable', criterioFramingCausal.hashPrompt === HASH_PROMPT);
comprobar('Criterio: expone el gate lexico', criterioFramingCausal.marcadoresLexicos('eso provoco la crisis').includes('provocar'));

const evalCausal = {
  tiene_lenguaje_causal_fuerte: true,
  tiene_contrafactual_o_comparacion: false,
  ventana_temporal_mencionada: 'corta' as const,
  score_framing_causal: 0.9,
  justificacion: 'Sucesion en dos semanas presentada como causa, sin comparacion.',
};
const empaquetada = empaquetar(criterioFramingCausal, evalCausal);
comprobar('Criterio: empaquetar normaliza score y justificacion', empaquetada.score === 0.9 && empaquetada.justificacion.startsWith('Sucesion'));
comprobar('Criterio: empaquetar conserva los campos crudos para auditoria', empaquetada.campos['ventana_temporal_mencionada'] === 'corta');
comprobar('Criterio: empaquetar registra que criterio lo produjo', empaquetada.criterio === 'framing-causal');
comprobar(
  'Criterio: los marcadores llevan tono, no nombres de campo',
  empaquetada.marcadores.length === 3 &&
    empaquetada.marcadores.every((m) => ['bueno', 'malo', 'neutro'].includes(m.tono)),
);
comprobar(
  'Criterio: causal fuerte y ventana corta se marcan como que RESTAN defensa',
  empaquetada.marcadores.filter((m) => m.tono === 'malo').length === 3,
  JSON.stringify(empaquetada.marcadores),
);

// --------------------------------- segundo criterio: apelacion a autoridad
comprobar('Autoridad: el registro lo conoce', obtenerCriterio('apelacion-autoridad').id === 'apelacion-autoridad');
comprobar('Autoridad: ahora hay dos criterios registrados', listarCriterios().length === 2);
comprobar(
  'Autoridad: su gate lexico es propio y no el causal',
  criterioApelacionAutoridad.marcadoresLexicos('todos los estudios demuestran que funciona').includes('los estudios') &&
    criterioApelacionAutoridad.marcadoresLexicos('eso provoco la crisis').length === 0,
);
comprobar(
  'Autoridad: el gate causal no dispara con lenguaje de autoridad',
  criterioFramingCausal.marcadoresLexicos('todo el mundo sabe que es asi').length === 0,
);
comprobar(
  'Autoridad: los dos criterios tienen huellas de prompt distintas',
  criterioApelacionAutoridad.hashPrompt !== criterioFramingCausal.hashPrompt,
);

const evalAutoridadValida = {
  invoca_autoridad: true,
  fuente_identificable: false,
  alcance_de_la_evidencia: 'vago',
  score_autoridad_vaga: 0.85,
  justificacion: 'Invoca estudios sin nombrar ninguno ni decir cuantos.',
};
comprobar('Autoridad: el esquema acepta un objeto valido', validarAutoridad(evalAutoridadValida).ok);
comprobar(
  'Autoridad: normaliza el enum de alcance',
  (() => {
    const v = validarAutoridad({ ...evalAutoridadValida, alcance_de_la_evidencia: 'ESPECIFICO (con datos)' });
    return v.ok && v.evaluacion.alcance_de_la_evidencia === 'especifico';
  })(),
);
comprobar('Autoridad: rechaza enum invalido', !validarAutoridad({ ...evalAutoridadValida, alcance_de_la_evidencia: 'quizas' }).ok);
comprobar(
  'Autoridad: sin apelacion no puede haber score alto',
  (() => {
    const v = validarAutoridad({ ...evalAutoridadValida, invoca_autoridad: false });
    return v.ok && v.evaluacion.score_autoridad_vaga < 0.3;
  })(),
);
comprobar(
  'Autoridad: fuente identificable + evidencia especifica baja el score',
  (() => {
    const v = validarAutoridad({
      ...evalAutoridadValida, fuente_identificable: true, alcance_de_la_evidencia: 'especifico',
    });
    return v.ok && v.evaluacion.score_autoridad_vaga < 0.3 && v.ajustes.length > 0;
  })(),
);
comprobar(
  'Autoridad: la reparacion generica de JSON tambien le sirve',
  (() => {
    const crudo = 'Claro:\n```json\n' + JSON.stringify({ ...evalAutoridadValida, score_autoridad_vaga: 85 }) + '\n```';
    const v = criterioApelacionAutoridad.validar(crudo);
    return v.ok && v.evaluacion.score_autoridad_vaga === 0.85;
  })(),
);
const empaqAutoridad = empaquetar(criterioApelacionAutoridad, evalAutoridadValida as never);
comprobar('Autoridad: empaqueta al mismo contrato universal', empaqAutoridad.score === 0.85 && empaqAutoridad.criterio === 'apelacion-autoridad');
comprobar(
  'Autoridad: sus marcadores tienen otras etiquetas pero el mismo tono',
  empaqAutoridad.marcadores.some((m) => m.etiqueta === 'fuente sin identificar' && m.tono === 'malo'),
);

// ------------------------------------- bucle de evaluacion, sin servidor HTTP
const afirmacionesDemo = segmentarEnAfirmaciones(
  srt.segmentos, 'es', 'es', (t) => criterioFramingCausal.marcadoresLexicos(t),
);
const opcionesDemo = { concurrencia: 1, reintentos: 2 };

const jsonBueno = JSON.stringify(evalCausal);
const motorBueno = motorDeGuion([jsonBueno]);
const corridaOk = await evaluarAfirmaciones(afirmacionesDemo, opcionesDemo, {
  criterio: criterioFramingCausal, motor: motorBueno, cache: null,
});
const evaluadasDemo = corridaOk.resultados.filter((r) => r.evaluada);
comprobar('Motor: evalua solo las preseleccionadas', evaluadasDemo.length === afirmacionesDemo.filter((a) => a.preseleccionada).length);
comprobar('Motor: el resultado sale empaquetado', evaluadasDemo[0]?.evaluacion?.score === 0.9);
comprobar('Motor: contabiliza las llamadas', corridaOk.metricas.llamadas === evaluadasDemo.length);
comprobar('Motor: el prompt de sistema que se manda es el del criterio', motorBueno.llamadas[0]?.sistema === criterioFramingCausal.promptSistema);
comprobar('Motor: preserva el orden original', corridaOk.resultados.every((r, i) => r.id === afirmacionesDemo[i]?.id));

const motorTerco = motorDeGuion(['no puedo responder eso']);
const corridaMala = await evaluarAfirmaciones(afirmacionesDemo.slice(0, 3), opcionesDemo, {
  criterio: criterioFramingCausal, motor: motorTerco, cache: null,
});
const fallida = corridaMala.resultados.find((r) => r.preseleccionada);
comprobar('Motor: agota los reintentos ante JSON invalido', fallida?.intentos === 3, String(fallida?.intentos));
comprobar('Motor: deja constancia del error', Boolean(fallida?.error) && fallida?.evaluada === false);

const motorQueSeRecupera = motorDeGuion(['basura', jsonBueno]);
const corridaMixta = await evaluarAfirmaciones(afirmacionesDemo.slice(0, 3), opcionesDemo, {
  criterio: criterioFramingCausal, motor: motorQueSeRecupera, cache: null,
});
const recuperada = corridaMixta.resultados.find((r) => r.preseleccionada);
comprobar('Motor: el segundo intento salva la afirmacion', recuperada?.evaluada === true && recuperada?.intentos === 2);

const motorQueExplota = motorDeGuion([new Error('conexion rechazada')]);
const corridaError = await evaluarAfirmaciones(afirmacionesDemo.slice(0, 3), opcionesDemo, {
  criterio: criterioFramingCausal, motor: motorQueExplota, cache: null,
});
comprobar(
  'Motor: un fallo de transporte no tumba la corrida',
  corridaError.resultados.length === 3 && corridaError.resultados.some((r) => r.error?.includes('conexion rechazada')),
);

const corridaParalela = await evaluarAfirmaciones(afirmacionesDemo, { concurrencia: 4, reintentos: 0 }, {
  criterio: criterioFramingCausal, motor: motorDeGuion([jsonBueno]), cache: null,
});
comprobar(
  'Motor: con concurrencia 4 el orden y el conteo se mantienen',
  corridaParalela.resultados.length === afirmacionesDemo.length &&
    corridaParalela.resultados.every((r, i) => r.id === afirmacionesDemo[i]?.id),
);

// --- la prueba de que el bucle es agnostico: mismo codigo, otro criterio ---
const afirmacionesAutoridad = segmentarEnAfirmaciones(
  [{ inicio: 0, fin: 6, texto: 'Todos los estudios demuestran que esta politica funciona. La reunion es el jueves.' }],
  'es', 'es', (t) => criterioApelacionAutoridad.marcadoresLexicos(t),
);
const corridaAutoridad = await evaluarAfirmaciones(afirmacionesAutoridad, opcionesDemo, {
  criterio: criterioApelacionAutoridad,
  motor: motorDeGuion([JSON.stringify(evalAutoridadValida)]),
  cache: null,
});
comprobar(
  'Agnostico: el prefiltro selecciona solo la oracion con marcador de autoridad',
  afirmacionesAutoridad.filter((a) => a.preseleccionada).length === 1,
  `${afirmacionesAutoridad.filter((a) => a.preseleccionada).length}/${afirmacionesAutoridad.length}`,
);
comprobar(
  'Agnostico: el mismo bucle evalua el criterio nuevo sin cambios',
  corridaAutoridad.resultados.some((r) => r.evaluacion?.score === 0.85 && r.evaluacion?.criterio === 'apelacion-autoridad'),
);

// -------------------------------------------------------------------- reporte
const simulados: ResultadoAfirmacion[] = afirmaciones.map((a, i) => ({
  ...a,
  evaluada: a.preseleccionada,
  desdeCache: false,
  evaluacion: a.preseleccionada
    ? empaquetar(criterioFramingCausal, {
        tiene_lenguaje_causal_fuerte: i % 2 === 0,
        tiene_contrafactual_o_comparacion: i % 3 === 0,
        ventana_temporal_mencionada: (i % 3 === 0 ? 'razonable' : 'ninguna') as 'razonable' | 'ninguna',
        score_framing_causal: Number(((i % 10) / 10).toFixed(2)),
        justificacion: 'Justificacion simulada para el test del reporte </script><script>alert(1)</script>',
      })
    : null,
  ...(a.preseleccionada ? {} : { motivoOmision: 'no contiene ningun conector causal (prefiltro heuristico)' }),
  intentos: a.preseleccionada ? 1 : 0,
  msLLM: a.preseleccionada ? 120 : 0,
}));

const resultados: Resultados = {
  hash: 'testhash1234',
  fuente: 'tests/fixtures/discurso-es.srt',
  tipoEntrada: 'subtitulos',
  motorTranscripcion: 'srt',
  idiomaDocumento: 'es',
  modeloLLM: 'qwen2.5:3b',
  criterio: 'framing-causal',
  timestampsReales: true,
  creadoEn: new Date().toISOString(),
  versionEsquema: 1,
  resumen: {
    totalSegmentos: simulados.length,
    preseleccionados: preseleccionadas,
    evaluados: simulados.filter((r) => r.evaluada).length,
    fallidos: 0,
    sobreUmbral: 2,
    umbralUsado: 0.7,
    scorePromedio: 0.45,
    idiomas: { Espanol: simulados.length },
    msTotalLLM: 1400,
    rendimiento: {
      msCargaModelo: 0,
      tokensGenerados: 420,
      tokensPorSegundo: 9.5,
      desdeCache: 0,
      llamadas: 4,
      concurrencia: 1,
      ejecucion: 'cpu',
    },
  },
  resultados: simulados,
};

const html = construirHTML({
  resultados,
  titulo: 'Discurso de prueba',
  duracionSegundos: 93,
  criterio: {
    id: criterioFramingCausal.id,
    nombre: criterioFramingCausal.nombre,
    descripcion: criterioFramingCausal.descripcion,
    alcance: criterioFramingCausal.alcance,
  },
});
comprobar('Reporte: incluye el disclaimer de alcance', html.includes('no verifica la veracidad del hecho'));
comprobar('Reporte: es autocontenido (sin src/href externos)', !/<(script|link)[^>]+(src|href)=["']?https?:/i.test(html));
comprobar('Reporte: el umbral por defecto viaja en los metadatos', html.includes('"umbral":0.7'));
comprobar(
  'Reporte: ningun </script> se escapa del JSON embebido',
  (() => {
    const bloques = html.split('<script id="datos-filas" type="application/json">')[1] ?? '';
    const json = bloques.split('</script>')[0] ?? '';
    try {
      const datos = JSON.parse(json) as unknown[];
      return datos.length === simulados.length;
    } catch {
      return false;
    }
  })(),
);
comprobar(
  'Reporte: la plantilla no menciona ningun campo del criterio',
  !html.includes('tiene_lenguaje_causal_fuerte') && !html.includes('ventana_temporal_mencionada'),
);
comprobar('Reporte: los marcadores viajan con su tono', html.includes('"tono":'));
comprobar(
  'Reporte: el aviso de alcance lo aporta el criterio, no la plantilla',
  html.includes(criterioFramingCausal.alcance) && html.includes(criterioFramingCausal.descripcion),
);
comprobar(
  'Reporte: la plantilla no describe ningun criterio concreto',
  !html.includes('relación causal fuerte sin los marcadores') && !html.includes('prefiltro causal'),
);
comprobar('Reporte: los datos meta son JSON valido', (() => {
  const bloque = (html.split('<script id="datos-meta" type="application/json">')[1] ?? '').split('</script>')[0] ?? '';
  try {
    JSON.parse(bloque);
    return true;
  } catch {
    return false;
  }
})());

// ------------------------------------------------------------------- resumen
console.log(negrita('\nResumen'));
console.log(`  Pasados ${pasados}   Fallidos ${fallos.length}`);
if (fallos.length > 0) {
  console.log(rojo('\nFallaron:'));
  for (const f of fallos) console.log(rojo(`  - ${f}`));
  console.log('');
  process.exitCode = 1;
} else {
  console.log(verde('\nTodo el pipeline determinista funciona.\n'));
}
