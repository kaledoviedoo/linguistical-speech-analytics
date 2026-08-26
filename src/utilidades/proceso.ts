/** Ejecucion de subprocesos locales (yt-dlp, ffmpeg). Nada sale a la nube. */
import { spawn } from 'node:child_process';

export interface ResultadoProceso {
  codigo: number;
  stdout: string;
  stderr: string;
}

export interface OpcionesEjecucion {
  onLinea?: (linea: string) => void;
}

/**
 * En Windows, `spawn` con shell:true concatena los argumentos en una unica linea
 * de comandos, asi que hay que citar a mano lo que lleve espacios o metacaracteres.
 */
export function citarWindows(arg: string): string {
  if (arg.length > 0 && !/[\s"^&|<>()%!]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

function ejecutarInterno(
  comando: string,
  args: string[],
  opciones: OpcionesEjecucion,
  usarShell: boolean,
): Promise<ResultadoProceso> {
  return new Promise((resolve, reject) => {
    const argsFinales = usarShell && process.platform === 'win32' ? args.map(citarWindows) : args;
    const comandoFinal = usarShell && process.platform === 'win32' ? citarWindows(comando) : comando;

    const proc = spawn(comandoFinal, argsFinales, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: usarShell,
      windowsVerbatimArguments: usarShell && process.platform === 'win32',
    });

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

/**
 * Ejecuta un binario local.
 *
 * Primero sin shell (es lo correcto y lo seguro: los argumentos van tal cual,
 * sin que nadie los reinterprete). Si en Windows falla por ENOENT/EINVAL se
 * reintenta con shell, que es la unica forma de invocar wrappers .cmd/.bat
 * desde Node 20 en adelante.
 */
export async function ejecutar(
  comando: string,
  args: string[],
  opciones: OpcionesEjecucion = {},
): Promise<ResultadoProceso> {
  try {
    return await ejecutarInterno(comando, args, opciones, false);
  } catch (err) {
    const codigo = (err as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && (codigo === 'ENOENT' || codigo === 'EINVAL')) {
      return ejecutarInterno(comando, args, opciones, true);
    }
    throw err;
  }
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

/** Instrucciones de instalacion por plataforma, para no mandar al usuario a buscar. */
export function instruccionesInstalacion(comando: string): string {
  const esWindows = process.platform === 'win32';
  const guias: Record<string, { win: string; otros: string }> = {
    'yt-dlp': {
      win: 'winget install --id yt-dlp.yt-dlp -e    (despues cerra y volve a abrir la terminal)',
      otros: 'brew install yt-dlp   |   pipx install yt-dlp   |   sudo apt install yt-dlp',
    },
    ffmpeg: {
      win: 'winget install --id Gyan.FFmpeg -e      (despues cerra y volve a abrir la terminal)',
      otros: 'brew install ffmpeg   |   sudo apt install ffmpeg',
    },
    ollama: {
      win: 'winget install --id Ollama.Ollama -e    (despues cerra y volve a abrir la terminal)',
      otros: 'https://ollama.com/download',
    },
  };
  const g = guias[comando];
  if (!g) return 'Instalalo y volve a intentar.';
  return esWindows ? g.win : g.otros;
}

export function errorBinarioFaltante(comando: string): Error {
  return new Error(
    `No encuentro "${comando}" en el PATH.\n  ${instruccionesInstalacion(comando)}`,
  );
}
