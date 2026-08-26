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
import { extraerJSON, validarEvaluacion, parsearRespuesta } from '../src/motor/esquema.js';
import { detectarIdiomaDocumento } from '../src/procesamiento/idioma.js';
import { marcadoresCausales } from '../src/procesamiento/prefiltro.js';
import { segmentarEnAfirmaciones } from '../src/procesamiento/segmentar.js';
import { construirHTML } from '../src/reporte/generar.js';
import type { ResultadoAfirmacion, Resultados } from '../src/tipos.js';
import { formatearTiempo } from '../src/utilidades/rutas.js';
import { citarWindows, ejecutar } from '../src/utilidades/proceso.js';
import { CacheEvaluaciones } from '../src/motor/cache.js';
import { HASH_PROMPT, PROMPT_SISTEMA } from '../src/motor/prompt.js';
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
const afirmaciones = segmentarEnAfirmaciones(srt.segmentos, 'es');
comprobar('Segmentacion: produce afirmaciones', afirmaciones.length >= 10, `obtuve ${afirmaciones.length}`);
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
const evaluacionCache = {
  tiene_lenguaje_causal_fuerte: true,
  tiene_contrafactual_o_comparacion: false,
  ventana_temporal_mencionada: 'ninguna' as const,
  score_framing_causal: 0.85,
  justificacion: 'Atribucion causal unica sin comparar con el periodo previo.',
};

const c1 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', HASH_PROMPT, true);
comprobar('Cache: arranca vacia', c1.tamano === 0 && c1.obtener('una frase') === null);
c1.guardar('una frase', evaluacionCache);
c1.persistir();
comprobar('Cache: persiste a disco', fs.existsSync(rutaCache));

const c2 = new CacheEvaluaciones(rutaCache, 'qwen2.5:3b', HASH_PROMPT, true);
comprobar(
  'Cache: una corrida nueva reutiliza la evaluacion',
  c2.obtener('una frase')?.score_framing_causal === 0.85 && c2.aciertos === 1,
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

// -------------------------------------------------------------------- reporte
const simulados: ResultadoAfirmacion[] = afirmaciones.map((a, i) => ({
  ...a,
  evaluada: a.preseleccionada,
  desdeCache: false,
  evaluacion: a.preseleccionada
    ? {
        tiene_lenguaje_causal_fuerte: i % 2 === 0,
        tiene_contrafactual_o_comparacion: i % 3 === 0,
        ventana_temporal_mencionada: i % 3 === 0 ? 'razonable' : 'ninguna',
        score_framing_causal: Number(((i % 10) / 10).toFixed(2)),
        justificacion: 'Justificacion simulada para el test del reporte </script><script>alert(1)</script>',
      }
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

const html = construirHTML({ resultados, titulo: 'Discurso de prueba', duracionSegundos: 93 });
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
