/**
 * Ingesta de links (YouTube y URLs directas de audio/video) con yt-dlp como
 * subproceso local. No hay servicio intermediario: yt-dlp corre en la maquina
 * del usuario y deja el archivo en ./data/<hash>/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ejecutar, errorBinarioFaltante, existeBinario } from '../utilidades/proceso.js';
import { log } from '../utilidades/log.js';

function buscarPorPrefijo(dir: string, prefijo: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const candidatos = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefijo))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile() && fs.statSync(f).size > 1024);
  return candidatos[0] ?? null;
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

/** Convierte un error de yt-dlp en algo accionable en vez de un volcado crudo. */
function explicarFalloYtDlp(salida: string, codigo: number, cookies: string | null): string {
  const s = salida.toLowerCase();
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

/**
 * Opcional (--preferir-subtitulos): si el video ya trae subtitulos, se descargan
 * en vez del audio y se salta Whisper por completo. En un discurso de 40 minutos
 * esto es la diferencia entre segundos y varios minutos de CPU.
 * Devuelve null si el video no tiene subtitulos utilizables.
 */
export async function descargarSubtitulos(
  url: string,
  dirTrabajo: string,
  cookiesNavegador: string | null = null,
): Promise<string | null> {
  const existente = buscarPorPrefijo(dirTrabajo, 'subs.');
  if (existente) return existente;
  if (!(await existeBinario('yt-dlp'))) throw errorBinarioFaltante('yt-dlp');

  const r = await ejecutar('yt-dlp', [
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-format', 'vtt',
    '--sub-langs', 'es.*,en.*,pt.*,fr.*',
    ...argumentosCookies(cookiesNavegador),
    '-o', path.join(dirTrabajo, 'subs'),
    url,
  ]);

  const ruta = buscarPorPrefijo(dirTrabajo, 'subs.');
  if (!ruta) {
    log.detalle(`Sin subtitulos descargables (codigo ${r.codigo}). Se usara transcripcion local.`);
    return null;
  }
  return ruta;
}
