/**
 * Ingesta de links (YouTube y URLs directas de audio/video) con yt-dlp como
 * subproceso local. No hay servicio intermediario: yt-dlp corre en la maquina
 * del usuario y deja el archivo en ./data/<hash>/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ejecutar, errorBinarioFaltante, existeBinario } from '../utilidades/proceso.js';
import { log } from '../utilidades/log.js';

/**
 * Una descarga interrumpida deja `fuente.webm.part`, que empieza igual que el archivo bueno
 * y puede pasar del kilobyte. Sin esta exclusion, la corrida siguiente lo tomaria por
 * completo y le daria a ffmpeg un archivo truncado.
 */
const RESTOS_DE_DESCARGA = /\.(part|ytdl|temp|tmp|download)$/i;

function buscarPorPrefijo(dir: string, prefijo: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const candidatos = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefijo) && !RESTOS_DE_DESCARGA.test(f))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile() && fs.statSync(f).size > 1024);
  return candidatos[0] ?? null;
}

/** Exportado solo para el test: mismo criterio de "esto es un archivo terminado". */
export function esRestoDeDescarga(nombre: string): boolean {
  return RESTOS_DE_DESCARGA.test(nombre);
}

export interface DescargaAudio {
  ruta: string;
  titulo: string | null;
}

/**
 * YouTube pide cada vez mas seguido una sesion iniciada ("Sign in to confirm you're
 * not a bot"). yt-dlp puede tomar las cookies del navegador ya instalado, sin que
 * nadie tenga que exportar nada a mano.
 */
function argumentosCookies(navegador: string | null): string[] {
  return navegador ? ['--cookies-from-browser', navegador] : [];
}

/**
 * YouTube devuelve 403 cuando el descifrado de la firma que trae yt-dlp quedo viejo.
 * Es el fallo mas comun y el mas facil de confundir con "el video no existe": actualizar
 * yt-dlp lo resuelve casi siempre.
 */
const AVISO_403 =
  'yt-dlp esta desactualizado para el YouTube de hoy (HTTP 403).\n' +
  '  Actualizalo:  winget upgrade --id yt-dlp.yt-dlp -e     (o:  yt-dlp -U)';

/** Convierte un error de yt-dlp en algo accionable en vez de un volcado crudo. */
function explicarFalloYtDlp(salida: string, codigo: number, cookies: string | null): string {
  const s = salida.toLowerCase();
  if (s.includes('403') || s.includes('forbidden')) return AVISO_403;
  if (s.includes('sign in to confirm') || s.includes('not a bot') || s.includes('cookies')) {
    return cookies
      ? `YouTube sigue pidiendo sesion aunque use las cookies de ${cookies}.\n` +
          `  Abri ese navegador, inicia sesion en youtube.com y volve a intentar.`
      : `YouTube esta pidiendo una sesion iniciada para este video.\n` +
          `  Volve a intentar agregando:  --cookies chrome   (o edge, firefox, brave)`;
  }
  if (s.includes('video unavailable') || s.includes('private video')) {
    return 'El video no esta disponible publicamente (privado, borrado o restringido por region).';
  }
  if (s.includes('unsupported url')) {
    return 'yt-dlp no reconoce esa URL. Verifica el link, o descarga el audio a mano y pasa el archivo.';
  }
  return `yt-dlp fallo (codigo ${codigo}):\n${salida.slice(0, 700)}`;
}

/** Descarga la mejor pista de audio disponible. Devuelve la ruta local. */
export async function descargarAudio(
  url: string,
  dirTrabajo: string,
  cookiesNavegador: string | null = null,
): Promise<DescargaAudio> {
  const existente = buscarPorPrefijo(dirTrabajo, 'fuente.');
  const rutaTitulo = path.join(dirTrabajo, 'titulo.txt');
  if (existente) {
    log.detalle(`Audio ya descargado: ${existente}`);
    const titulo = fs.existsSync(rutaTitulo) ? fs.readFileSync(rutaTitulo, 'utf8').trim() : null;
    return { ruta: existente, titulo: titulo || null };
  }

  if (!(await existeBinario('yt-dlp'))) throw errorBinarioFaltante('yt-dlp');

  const r = await ejecutar(
    'yt-dlp',
    [
      '--no-playlist',
      '--no-warnings',
      '--no-simulate',
      '--print', '%(title)s',
      '-f', 'bestaudio/best',
      ...argumentosCookies(cookiesNavegador),
      '-o', path.join(dirTrabajo, 'fuente.%(ext)s'),
      url,
    ],
    { onLinea: (l) => log.detalle(`yt-dlp: ${l}`) },
  );

  const ruta = buscarPorPrefijo(dirTrabajo, 'fuente.');
  if (r.codigo !== 0 || !ruta) {
    throw new Error(explicarFalloYtDlp(r.stderr || r.stdout, r.codigo, cookiesNavegador));
  }

  const titulo = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? null;
  if (titulo) fs.writeFileSync(rutaTitulo, titulo, 'utf8');
  return { ruta, titulo };
}

/** Lo que YouTube ofrece para un link, antes de bajar nada. */
export interface PistasDelLink {
  idioma: string | null;
  /** Subtitulos que subio quien publico el video. Nunca son traduccion automatica. */
  publicados: string[];
  /** automatic_captions: la ASR del original y, ademas, su traduccion a ~200 idiomas. */
  automaticos: string[];
}

export interface PistaElegida {
  lang: string;
  /** true = ASR de YouTube: sin puntuacion fiable, peor segmentacion en afirmaciones. */
  auto: boolean;
}

const raiz = (lang: string): string => (lang.split('-')[0] ?? lang).toLowerCase();

/**
 * Elige UNA pista, y solo si esta en el idioma original.
 *
 * `automatic_captions` mezcla dos cosas muy distintas bajo el mismo nombre: la
 * transcripcion automatica del audio original (`en-orig`, o el idioma del video) y su
 * traduccion automatica a todos los idiomas (`es`, `fr`, `pt`...). Pedir `es` para un
 * discurso en ingles no trae subtitulos: trae una traduccion hecha por YouTube.
 *
 * Eso rompe el analisis por dos motivos. Uno tecnico: el prefiltro busca conectores
 * causales, y una traduccion automatica reescribe justamente esas construcciones. Uno de
 * diseno: la traduccion automatica esta fuera de alcance de forma permanente en este
 * proyecto — el analisis es estructural y se hace en el idioma en que se hablo.
 *
 * Por eso, si lo unico disponible es una traduccion, esta funcion devuelve null y el
 * pipeline transcribe el audio localmente, que si respeta el original.
 */
export function elegirPistaOriginal(pistas: PistasDelLink, forzarASR = false): PistaElegida | null {
  const idioma = pistas.idioma ? raiz(pistas.idioma) : null;

  // --subtitulos-asr salta los publicados a proposito: sirve para medir CUANTO cuesta
  // la ASR sobre el mismo video del que si hay una version limpia. Sin esta opcion, la
  // comparacion "publicados vs ASR" mezclaria dos discursos y dos idiomas distintos.
  const publicado = forzarASR
    ? undefined
    : idioma
    ? pistas.publicados.find((l) => raiz(l) === idioma)
      : (pistas.publicados.find((l) => raiz(l) !== 'und') ?? pistas.publicados[0]);
  if (publicado) return { lang: publicado, auto: false };

  // YouTube marca la ASR del original con el sufijo -orig cuando ademas ofrece traducciones.
  const orig = pistas.automaticos.find((l) => l.toLowerCase().endsWith('-orig'));
  if (orig) return { lang: orig, auto: true };

  if (idioma) {
    const mismo = pistas.automaticos.find((l) => raiz(l) === idioma);
    if (mismo) return { lang: mismo, auto: true };
  }
  return null;
}

/** Pregunta que hay, sin descargar medios. Devuelve null si yt-dlp no pudo ni mirar. */
async function inspeccionarLink(
  url: string,
  cookiesNavegador: string | null,
): Promise<PistasDelLink | null> {
  const r = await ejecutar('yt-dlp', [
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    '-J',
    ...argumentosCookies(cookiesNavegador),
    url,
  ]);
  if (r.codigo !== 0) {
    log.aviso(`No se pudo consultar el link: ${motivoSinSubtitulos(r.stderr || r.stdout, r.codigo)}`);
    return null;
  }
  try {
    const j = JSON.parse(r.stdout) as {
      language?: string | null;
      subtitles?: Record<string, unknown>;
      automatic_captions?: Record<string, unknown>;
    };
    return {
      idioma: j.language ?? null,
      publicados: Object.keys(j.subtitles ?? {}),
      automaticos: Object.keys(j.automatic_captions ?? {}),
    };
  } catch {
    log.aviso('yt-dlp devolvio metadatos ilegibles; se usara transcripcion local.');
    return null;
  }
}

export interface SubtitulosDescargados {
  ruta: string;
  lang: string;
  auto: boolean;
}

/**
 * Opcional (--preferir-subtitulos): si el video ya trae subtitulos EN SU IDIOMA ORIGINAL,
 * se descargan en vez del audio y se salta Whisper por completo. En un discurso de 40
 * minutos esto es la diferencia entre segundos y varios minutos de CPU.
 * Devuelve null si no hay ninguna pista original utilizable.
 */
export async function descargarSubtitulos(
  url: string,
  dirTrabajo: string,
  cookiesNavegador: string | null = null,
  forzarASR = false,
): Promise<SubtitulosDescargados | null> {
  if (!(await existeBinario('yt-dlp'))) throw errorBinarioFaltante('yt-dlp');

  const pistas = await inspeccionarLink(url, cookiesNavegador);
  if (!pistas) return null;

  const elegida = elegirPistaOriginal(pistas, forzarASR);
  if (!elegida) {
    log.aviso(
      `Este link solo ofrece traducciones automaticas (idioma del video: ${pistas.idioma ?? 'desconocido'}).\n` +
        '      Traducir esta fuera de alcance: se transcribe el audio en el idioma original.',
    );
    return null;
  }

  const existente = buscarPorPrefijo(dirTrabajo, 'subs.');
  if (existente) return { ruta: existente, lang: elegida.lang, auto: elegida.auto };

  const r = await ejecutar('yt-dlp', [
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    elegida.auto ? '--write-auto-subs' : '--write-subs',
    '--sub-format', 'vtt',
    '--sub-langs', elegida.lang,
    ...argumentosCookies(cookiesNavegador),
    '-o', path.join(dirTrabajo, 'subs'),
    url,
  ]);

  const ruta = buscarPorPrefijo(dirTrabajo, 'subs.');
  if (!ruta) {
    // A nivel aviso y no detalle: caer a transcribir el audio cuesta minutos de CPU,
    // asi que el motivo tiene que verse sin volver a correr con --verboso.
    log.aviso(`Sin subtitulos utilizables: ${motivoSinSubtitulos(r.stderr || r.stdout, r.codigo)}`);
    return null;
  }
  return { ruta, lang: elegida.lang, auto: elegida.auto };
}

/** Por que no hubo subtitulos. Distingue "el video no tiene" de "yt-dlp no pudo". */
function motivoSinSubtitulos(salida: string, codigo: number): string {
  const s = salida.toLowerCase();
  if (s.includes('403') || s.includes('forbidden')) return AVISO_403;
  if (s.includes('sign in to confirm') || s.includes('not a bot')) {
    return 'YouTube pide sesion iniciada. Volve a intentar con:  --cookies edge';
  }
  if (s.includes('429') || s.includes('too many requests')) {
    return 'YouTube esta limitando las peticiones (HTTP 429). Espera unos minutos y volve a intentar.';
  }
  if (s.includes('no subtitles')) return 'el video no publica subtitulos en su idioma original.';
  const primerError = salida
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.toUpperCase().startsWith('ERROR'));
  return primerError?.slice(0, 200) ?? `yt-dlp salio con codigo ${codigo} sin dejar archivo.`;
}
