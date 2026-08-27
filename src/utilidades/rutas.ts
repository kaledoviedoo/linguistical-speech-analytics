/** Hash de entrada, creacion de carpetas y helpers de tiempo. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS, DIR_REPORTES } from '../config.js';

/**
 * Identificador estable de una entrada.
 * - Para URLs: hash de la URL normalizada.
 * - Para archivos: hash del contenido (asi renombrar el archivo no invalida la cache).
 */
export function hashDeEntrada(entrada: string, esArchivo: boolean): string {
  const h = crypto.createHash('sha256');
  if (esArchivo) {
    h.update(path.basename(entrada));
    h.update(fs.readFileSync(entrada));
  } else {
    h.update(entrada.trim().toLowerCase());
  }
  return h.digest('hex').slice(0, 12);
}

export function dirTrabajo(hash: string): string {
  const dir = path.join(DIR_DATOS, hash);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Un reporte por (entrada, criterio). Sin el criterio en el nombre, analizar el mismo
 * discurso con dos criterios distintos hacia que el segundo pisara al primero.
 */
export function rutaReporte(hash: string, criterio: string): string {
  fs.mkdirSync(DIR_REPORTES, { recursive: true });
  return path.join(DIR_REPORTES, `${hash}-${criterio}.html`);
}

export function leerJSON<T>(ruta: string): T | null {
  try {
    if (!fs.existsSync(ruta)) return null;
    return JSON.parse(fs.readFileSync(ruta, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function escribirJSON(ruta: string, datos: unknown): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf8');
}

/** 3725.4 -> "01:02:05" */
export function formatearTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const s = Math.floor(segundos % 60);
  const m = Math.floor((segundos / 60) % 60);
  const h = Math.floor(segundos / 3600);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${dd(h)}:${dd(m)}:${dd(s)}`;
}

export function esURL(valor: string): boolean {
  return /^https?:\/\//i.test(valor.trim());
}
