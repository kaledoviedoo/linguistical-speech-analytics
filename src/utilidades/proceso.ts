/** Ejecucion de subprocesos locales (yt-dlp, ffmpeg). Nada sale a la nube. */
import { spawn } from 'node:child_process';

export interface ResultadoProceso {
  codigo: number;
  stdout: string;
  stderr: string;
}

export function ejecutar(
  comando: string,
  args: string[],
  opciones: { onLinea?: (linea: string) => void } = {},
): Promise<ResultadoProceso> {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => {
      const t = d.toString();
      stdout += t;
      if (opciones.onLinea) t.split(/\r?\n/).filter(Boolean).forEach(opciones.onLinea);
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (codigo) => resolve({ codigo: codigo ?? -1, stdout, stderr }));
  });
}

/** true si el binario existe y responde a --version. */
export async function existeBinario(comando: string): Promise<boolean> {
  try {
    const r = await ejecutar(comando, ['--version']);
    return r.codigo === 0;
  } catch {
    return false;
  }
}

export function errorBinarioFaltante(comando: string): Error {
  const guias: Record<string, string> = {
    'yt-dlp':
      'Instalalo local: pipx install yt-dlp  |  brew install yt-dlp  |  winget install yt-dlp.yt-dlp\n' +
      '  (o descarga el binario suelto desde github.com/yt-dlp/yt-dlp/releases y ponlo en el PATH)',
    ffmpeg:
      'Instalalo local: brew install ffmpeg  |  winget install Gyan.FFmpeg  |  sudo apt install ffmpeg',
  };
  return new Error(
    `No encuentro "${comando}" en el PATH.\n  ${guias[comando] ?? 'Instalalo y volve a intentar.'}`,
  );
}
