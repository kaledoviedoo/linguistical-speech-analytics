#!/usr/bin/env node
/**
 * CLI del auditor de framing causal.
 *
 *   npm run analizar -- <link-o-ruta> [opciones]
 *
 * No levanta ningun servidor: hace el analisis, escribe un HTML y lo abre con file://.
 */
import { pathToFileURL } from 'node:url';
import {
  MODELO_LLM,
  MODELO_WHISPER,
  REINTENTOS_LLM,
  UMBRAL_DEFECTO,
  URL_OLLAMA,
} from './config.js';
import { estadoOllama, tieneModelo } from './motor/ollama.js';
import { ejecutarPipeline, type OpcionesPipeline } from './pipeline.js';
import { TOTAL_CONECTORES } from './procesamiento/prefiltro.js';
import { existeBinario } from './utilidades/proceso.js';
import { activarVerboso, azul, gris, log, negrita, rojo, verde } from './utilidades/log.js';

const AYUDA = `
${negrita('Auditor de framing causal')} - analiza la ESTRUCTURA de afirmaciones causales, no su veracidad.

${negrita('Uso')}
  npm run analizar -- <link-o-ruta-de-archivo> [opciones]

${negrita('Entradas soportadas')}
  Links       YouTube y URLs directas de audio/video (via yt-dlp local)
  Audio/video .mp3 .wav .m4a .mp4 .webm .ogg .flac .mkv .mov
  Texto       .srt .vtt .txt .md  (con timestamps se salta la transcripcion)

${negrita('Opciones')}
  -m, --modelo <nombre>     Modelo de Ollama            (por defecto: ${MODELO_LLM})
      --whisper <nombre>    Modelo Whisper ONNX         (por defecto: ${MODELO_WHISPER})
  -u, --umbral <0-1>        Umbral inicial del reporte  (por defecto: ${UMBRAL_DEFECTO})
      --idioma <codigo>     Fuerza el idioma (es, en, pt...) en vez de autodetectar
      --limite <n>          Evalua solo las primeras n afirmaciones filtradas
      --reintentos <n>      Reintentos ante JSON invalido (por defecto: ${REINTENTOS_LLM})
      --ollama <url>        URL de Ollama               (por defecto: ${URL_OLLAMA})
      --sin-prefiltro       Manda TODAS las oraciones al modelo (mas lento, mas recall)
      --preferir-subtitulos Si el link ya tiene subtitulos, usalos en vez de transcribir
      --forzar              Ignora la cache de ./data y rehace todo
      --no-abrir            No abre el navegador al terminar
  -v, --verboso             Log detallado
      --verificar-entorno   Diagnostico de Ollama, modelos y binarios locales
  -h, --ayuda               Esta ayuda

${negrita('Ejemplos')}
  npm run analizar -- "https://www.youtube.com/watch?v=XXXX"
  npm run analizar -- ./discurso.mp3 --idioma es
  npm run analizar -- ./tests/fixtures/discurso-es.srt --umbral 0.6
`;

interface Argumentos extends OpcionesPipeline {
  ayuda: boolean;
  verificarEntorno: boolean;
}

function siguiente(argv: string[], i: number, bandera: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`La opcion ${bandera} necesita un valor.`);
  return v;
}

export function parsearArgumentos(argv: string[]): Argumentos {
  const o: Argumentos = {
    entrada: '',
    modelo: MODELO_LLM,
    modeloWhisper: MODELO_WHISPER,
    urlOllama: URL_OLLAMA,
    umbral: UMBRAL_DEFECTO,
    idiomaForzado: null,
    abrirReporte: true,
    forzar: false,
    usarPrefiltro: true,
    limite: null,
    reintentos: REINTENTOS_LLM,
    verboso: false,
    preferirSubtitulos: false,
    ayuda: false,
    verificarEntorno: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '-h': case '--ayuda': case '--help': o.ayuda = true; break;
      case '--verificar-entorno': o.verificarEntorno = true; break;
      case '-v': case '--verboso': o.verboso = true; break;
      case '--no-abrir': o.abrirReporte = false; break;
      case '--forzar': o.forzar = true; break;
      case '--sin-prefiltro': o.usarPrefiltro = false; break;
      case '--preferir-subtitulos': o.preferirSubtitulos = true; break;
      case '-m': case '--modelo': o.modelo = siguiente(argv, i, a); i++; break;
      case '--whisper': o.modeloWhisper = siguiente(argv, i, a); i++; break;
      case '--ollama': o.urlOllama = siguiente(argv, i, a).replace(/\/+$/, ''); i++; break;
      case '--idioma': o.idiomaForzado = siguiente(argv, i, a); i++; break;
      case '-u': case '--umbral': o.umbral = Number(siguiente(argv, i, a)); i++; break;
      case '--limite': o.limite = Number(siguiente(argv, i, a)); i++; break;
      case '--reintentos': o.reintentos = Number(siguiente(argv, i, a)); i++; break;
      default:
        if (a.startsWith('-')) throw new Error(`Opcion desconocida: ${a}`);
        if (!o.entrada) o.entrada = a;
        break;
    }
  }

  if (!Number.isFinite(o.umbral) || o.umbral < 0 || o.umbral > 1) {
    throw new Error('--umbral debe ser un numero entre 0 y 1.');
  }
  if (o.limite !== null && (!Number.isFinite(o.limite) || o.limite < 1)) {
    throw new Error('--limite debe ser un entero mayor o igual a 1.');
  }
  if (!Number.isFinite(o.reintentos) || o.reintentos < 0) {
    throw new Error('--reintentos debe ser 0 o mas.');
  }
  return o;
}

async function verificarEntorno(o: Argumentos): Promise<number> {
  log.info(negrita('\nDiagnostico del entorno local\n'));

  const marca = (ok: boolean) => (ok ? verde('  OK  ') : rojo(' FALTA'));
  const estado = await estadoOllama(o.urlOllama);

  log.info(`${marca(estado.disponible)} Ollama en ${o.urlOllama}` +
    (estado.disponible ? gris(`  (v${estado.version ?? '?'})`) : gris(`  ${estado.error ?? ''}`)));

  const modeloOk = estado.disponible && tieneModelo(estado.modelos, o.modelo);
  log.info(`${marca(modeloOk)} Modelo "${o.modelo}"` +
    (estado.disponible && !modeloOk ? gris(`  -> ollama pull ${o.modelo}`) : ''));
  if (estado.disponible && estado.modelos.length > 0) {
    log.info(gris(`       modelos instalados: ${estado.modelos.join(', ')}`));
  }

  const ffmpeg = await existeBinario('ffmpeg');
  log.info(`${marca(ffmpeg)} ffmpeg` + gris('  (necesario para audio/video; no lo es para .srt/.txt)'));

  const ytdlp = await existeBinario('yt-dlp');
  log.info(`${marca(ytdlp)} yt-dlp` + gris('  (necesario solo para links)'));

  log.info(`${verde('  OK  ')} Prefiltro causal cargado` + gris(`  (${TOTAL_CONECTORES} conectores, 6 idiomas)`));
  log.info(`${verde('  OK  ')} Node ${process.version}`);

  const listo = estado.disponible && modeloOk;
  log.info(
    listo
      ? verde('\nListo para analizar texto y subtitulos.') +
          (ffmpeg ? verde(' Audio y video tambien.') : gris(' (instala ffmpeg para audio/video)')) + '\n'
      : rojo('\nFalta configurar Ollama antes de poder analizar.\n'),
  );
  return listo ? 0 : 1;
}

async function principal(): Promise<number> {
  let o: Argumentos;
  try {
    o = parsearArgumentos(process.argv.slice(2));
  } catch (e) {
    log.error((e as Error).message);
    log.info(gris('Usa --ayuda para ver las opciones.'));
    return 2;
  }

  activarVerboso(o.verboso);
  if (o.ayuda) {
    log.info(AYUDA);
    return 0;
  }
  if (o.verificarEntorno) return verificarEntorno(o);

  if (!o.entrada) {
    log.error('Falta la entrada: un link o la ruta de un archivo.');
    log.info(AYUDA);
    return 2;
  }

  log.info(negrita('\nAuditor de framing causal') + gris('  -  audita la estructura del argumento, no el hecho\n'));

  const salida = await ejecutarPipeline(o);
  const url = pathToFileURL(salida.rutaReporte).href;

  log.info('');
  log.ok(`Reporte: ${salida.rutaReporte}`);
  log.info(gris(`      ${url}`));

  if (o.abrirReporte) {
    try {
      const { default: open } = await import('open');
      await open(url);
      log.info(azul('      Abriendolo en el navegador...'));
    } catch (e) {
      log.aviso(`No pude abrir el navegador automaticamente (${(e as Error).message}). Abri el link de arriba.`);
    }
  }
  log.info('');
  return 0;
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e: unknown) => {
    log.info('');
    log.error((e as Error).message);
    if (process.env.AFC_DEBUG === '1') console.error(e);
    process.exitCode = 1;
  });
