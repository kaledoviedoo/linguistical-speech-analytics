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

/** Descarga la mejor pista de audio disponible. Devuelve la ruta local. */
export async function descargarAudio(url: string, dirTrabajo: string): Promise<DescargaAudio> {
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
      '-o', path.join(dirTrabajo, 'fuente.%(ext)s'),
      url,
    ],
    { onLinea: (l) => log.detalle(`yt-dlp: ${l}`) },
  );

  const ruta = buscarPorPrefijo(dirTrabajo, 'fuente.');
  if (r.codigo !== 0 || !ruta) {
    throw new Error(`yt-dlp fallo (codigo ${r.codigo}):\n${(r.stderr || r.stdout).slice(0, 700)}`);
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
export async function descargarSubtitulos(url: string, dirTrabajo: string): Promise<string | null> {
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
