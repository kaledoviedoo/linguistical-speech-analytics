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
  CONCURRENCIA_DEFECTO,
  MODELO_LLM,
  MODELO_WHISPER,
  OPCIONES_OLLAMA,
  REINTENTOS_LLM,
  UMBRAL_DEFECTO,
  URL_OLLAMA,
} from './config.js';
import { estadoOllama, generar, procesosCargados, tieneModelo } from './motor/ollama.js';
import { construirPromptUsuario, PROMPT_SISTEMA } from './motor/prompt.js';
import { ejecutarPipeline, type OpcionesPipeline } from './pipeline.js';
import { TOTAL_CONECTORES } from './procesamiento/prefiltro.js';
import { existeBinario, instruccionesInstalacion } from './utilidades/proceso.js';
import { activarVerboso, amarillo, azul, gris, log, negrita, rojo, verde } from './utilidades/log.js';

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
      --concurrencia <n>    Peticiones simultaneas a Ollama (por defecto: ${CONCURRENCIA_DEFECTO})
      --sin-cache           No reutiliza evaluaciones previas de afirmaciones identicas
      --ollama <url>        URL de Ollama               (por defecto: ${URL_OLLAMA})
      --sin-prefiltro       Manda TODAS las oraciones al modelo (mas lento, mas recall)
      --preferir-subtitulos Si el link ya tiene subtitulos, usalos en vez de transcribir
      --forzar              Ignora la cache de ./data y rehace todo
      --no-abrir            No abre el navegador al terminar
  -v, --verboso             Log detallado
      --verificar-entorno   Diagnostico de Ollama, modelos y binarios locales
      --benchmark           Mide tok/s reales y estima cuanto tardara un discurso
  -h, --ayuda               Esta ayuda

${negrita('Ejemplos')}
  npm run analizar -- "https://www.youtube.com/watch?v=XXXX"
  npm run analizar -- ./discurso.mp3 --idioma es
  npm run analizar -- ./tests/fixtures/discurso-es.srt --umbral 0.6
`;

interface Argumentos extends OpcionesPipeline {
  ayuda: boolean;
  verificarEntorno: boolean;
  benchmark: boolean;
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
    concurrencia: CONCURRENCIA_DEFECTO,
    usarCache: true,
    verboso: false,
    preferirSubtitulos: false,
    ayuda: false,
    verificarEntorno: false,
    benchmark: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '-h': case '--ayuda': case '--help': o.ayuda = true; break;
      case '--verificar-entorno': o.verificarEntorno = true; break;
      case '--benchmark': o.benchmark = true; break;
      case '--sin-cache': o.usarCache = false; break;
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
      case '--concurrencia': o.concurrencia = Number(siguiente(argv, i, a)); i++; break;
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
  if (!Number.isFinite(o.concurrencia) || o.concurrencia < 1 || o.concurrencia > 16) {
    throw new Error('--concurrencia debe ser un entero entre 1 y 16.');
  }
  return o;
}

/** Node 18.17+ hace falta para fetch nativo y AbortSignal.timeout. */
function problemaDeNode(): string | null {
  const partes = process.versions.node.split('.').map((n) => Number.parseInt(n, 10));
  const mayor = partes[0] ?? 0;
  const menor = partes[1] ?? 0;
  if (mayor > 18 || (mayor === 18 && menor >= 17)) return null;
  return (
    `Este proyecto necesita Node 18.17 o superior, y estas usando ${process.version}.\n` +
    `  Actualizalo desde https://nodejs.org (version LTS) y volve a abrir la terminal.`
  );
}

async function verificarEntorno(o: Argumentos): Promise<number> {
  log.info(negrita('\nDiagnostico del entorno local\n'));

  const marca = (ok: boolean) => (ok ? verde('  OK  ') : rojo(' FALTA'));
  const problemaNode = problemaDeNode();

  log.info(`${marca(problemaNode === null)} Node ${process.version}` + gris('  (hace falta 18.17+)'));
  if (problemaNode) log.info(gris(`       ${problemaNode.split('\n')[1]?.trim() ?? ''}`));

  const ollamaInstalado = await existeBinario('ollama');
  const estado = await estadoOllama(o.urlOllama);

  log.info(`${marca(ollamaInstalado)} Ollama instalado`);
  if (!ollamaInstalado) log.info(gris(`       ${instruccionesInstalacion('ollama')}`));

  log.info(
    `${marca(estado.disponible)} Ollama respondiendo en ${o.urlOllama}` +
      (estado.disponible ? gris(`  (v${estado.version ?? '?'})`) : gris(`  ${estado.error ?? ''}`)),
  );
  if (ollamaInstalado && !estado.disponible) {
    log.info(gris('       arrancalo con:  ollama serve'));
  }

  const modeloOk = estado.disponible && tieneModelo(estado.modelos, o.modelo);
  log.info(`${marca(modeloOk)} Modelo "${o.modelo}"`);
  if (estado.disponible && !modeloOk) log.info(gris(`       descargalo con:  ollama pull ${o.modelo}`));
  if (estado.disponible && estado.modelos.length > 0) {
    log.info(gris(`       modelos instalados: ${estado.modelos.join(', ')}`));
  }

  const ffmpeg = await existeBinario('ffmpeg');
  log.info(`${marca(ffmpeg)} ffmpeg` + gris('  (solo para audio/video; no hace falta para .srt/.vtt/.txt)'));
  if (!ffmpeg) log.info(gris(`       ${instruccionesInstalacion('ffmpeg')}`));

  const ytdlp = await existeBinario('yt-dlp');
  log.info(`${marca(ytdlp)} yt-dlp` + gris('  (solo para links)'));
  if (!ytdlp) log.info(gris(`       ${instruccionesInstalacion('yt-dlp')}`));

  log.info(`${verde('  OK  ')} Prefiltro causal cargado` + gris(`  (${TOTAL_CONECTORES} conectores, 6 idiomas)`));

  const listo = problemaNode === null && estado.disponible && modeloOk;
  log.info('');
  if (listo) {
    log.info(verde('Listo para analizar texto y subtitulos.') +
      (ffmpeg ? verde(' Audio y video tambien.') : gris(' Instala ffmpeg para audio y video.')) +
      (ytdlp ? verde(' Links tambien.') : gris(' Instala yt-dlp para links.')));
    log.info(gris('Proba con:  npm run analizar -- tests/fixtures/discurso-es.srt'));
  } else {
    log.info(rojo('Falta resolver lo marcado como FALTA antes de poder analizar.'));
  }
  log.info('');
  return listo ? 0 : 1;
}

/**
 * Mide el rendimiento real del modelo local y estima cuanto tardara un discurso.
 *
 * Existe porque "va lento" no es un diagnostico. Ollama devuelve en cada respuesta
 * los tokens generados y el tiempo de generacion, y en /api/ps dice cuanto del modelo
 * esta en la GPU. Con esas dos cosas se sabe si el cuello de botella tiene arreglo.
 */
async function benchmark(o: Argumentos): Promise<number> {
  log.info(negrita('\nBenchmark del modelo local\n'));

  const estado = await estadoOllama(o.urlOllama);
  if (!estado.disponible || !tieneModelo(estado.modelos, o.modelo)) {
    log.error(`Ollama no esta listo con "${o.modelo}". Corre primero: npm run verificar-entorno`);
    return 1;
  }

  const FRASE = 'La inflacion se disparo por culpa de las politicas de la administracion anterior.';
  const MEDICIONES = 3;

  log.info(gris(`modelo: ${o.modelo}   concurrencia de la prueba: 1`));
  log.info(
    gris(`opciones: format=json temperature=${OPCIONES_OLLAMA.temperature} ` +
      `num_ctx=${OPCIONES_OLLAMA.num_ctx} num_predict=${OPCIONES_OLLAMA.num_predict}\n`),
  );

  log.info('Calentando el modelo (esta llamada incluye la carga en memoria)...');
  const calentamiento = await generar(o.urlOllama, o.modelo, PROMPT_SISTEMA, construirPromptUsuario(FRASE, 'Espanol'));
  log.info(
    gris(`      carga ${(calentamiento.msCarga / 1000).toFixed(1)} s, ` +
      `total ${(calentamiento.ms / 1000).toFixed(1)} s\n`),
  );

  const tiempos: number[] = [];
  const velocidades: number[] = [];
  let tokens = 0;
  let promptTokens = 0;

  for (let i = 1; i <= MEDICIONES; i++) {
    const r = await generar(o.urlOllama, o.modelo, PROMPT_SISTEMA, construirPromptUsuario(FRASE, 'Espanol'));
    tiempos.push(r.ms);
    velocidades.push(r.tokensPorSegundo);
    tokens += r.tokensSalida;
    promptTokens = r.tokensPrompt;
    log.info(`  ${i}/${MEDICIONES}  ${(r.ms / 1000).toFixed(2)} s   ${r.tokensSalida} tokens   ${r.tokensPorSegundo} tok/s`);
  }

  const msMedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const tokMedio = velocidades.reduce((a, b) => a + b, 0) / velocidades.length;
  const tokensMedios = Math.round(tokens / MEDICIONES);

  const cargados = await procesosCargados(o.urlOllama);
  const cargado = cargados.find((c) => c.nombre === o.modelo || c.nombre.startsWith(o.modelo.split(':')[0] ?? ''));

  log.info(negrita('\nResultado'));
  log.info(`  Tiempo por afirmacion    ${(msMedio / 1000).toFixed(2)} s`);
  log.info(`  Velocidad de generacion  ${tokMedio.toFixed(1)} tok/s`);
  log.info(`  Tokens por respuesta     ${tokensMedios}` + gris(`   (prompt: ${promptTokens} tokens)`));

  if (cargado) {
    const gb = (n: number) => (n / 1024 ** 3).toFixed(2);
    const donde =
      cargado.porcentajeGPU >= 95 ? verde('GPU') : cargado.porcentajeGPU <= 5 ? amarillo('CPU') : amarillo(`${cargado.porcentajeGPU}% GPU`);
    log.info(`  Ejecutandose en          ${donde}` + gris(`   (${gb(cargado.bytesVram)} GB en VRAM de ${gb(cargado.bytes)} GB)`));
  } else {
    log.info(`  Ejecutandose en          ${gris('no pude leerlo de /api/ps')}`);
  }

  // Estimacion practica: un discurso de 40 min ronda las 400 oraciones y el prefiltro
  // deja pasar aproximadamente una de cada cuatro.
  const afirmacionesTipicas = 100;
  const minutos = (msMedio * afirmacionesTipicas) / 1000 / 60;
  log.info(
    `\n  Un discurso de ~40 min (${afirmacionesTipicas} afirmaciones filtradas) tardaria ` +
      negrita(`~${minutos.toFixed(0)} min`) + ' con esta configuracion.',
  );

  if (cargado && cargado.porcentajeGPU <= 5) {
    log.info(amarillo('\nEl modelo esta en CPU. Esto es lo que podes hacer:'));
    log.info('  1. Modelo mas chico:   npm run analizar -- <archivo> --modelo qwen2.5:1.5b');
    log.info('     (primero: ollama pull qwen2.5:1.5b, y validalo con npm run test:prompt -- --modelo qwen2.5:1.5b)');
    log.info('  2. Mas paralelismo:    --concurrencia 3');
    log.info('     (requiere OLLAMA_NUM_PARALLEL=4 en el entorno de Ollama para que sirva de verdad)');
    log.info('  3. Menos material:     --limite 50  para probar antes de procesar todo.');
    log.info(gris('  La cache hace que volver a correr el mismo archivo sea instantaneo.'));
  } else if (cargado) {
    log.info(verde('\nEl modelo esta en GPU. Con --concurrencia 2-3 podes ganar mas throughput.'));
  }
  log.info('');
  return 0;
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
  if (o.benchmark) return benchmark(o);

  const problemaNode = problemaDeNode();
  if (problemaNode) {
    log.error(problemaNode);
    return 2;
  }

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
