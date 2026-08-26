/** Log minimalista con colores ANSI (sin dependencias). */

const soportaColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

const ESC = String.fromCharCode(27) + '[';
const c = (codigo: string) => (t: string) => (soportaColor ? `${ESC}${codigo}m${t}${ESC}0m` : t);

export const gris = c('90');
export const rojo = c('31');
export const verde = c('32');
export const amarillo = c('33');
export const azul = c('36');
export const negrita = c('1');

let verboso = false;
export function activarVerboso(v: boolean): void {
  verboso = v;
}

export const log = {
  info(msg: string): void {
    console.log(msg);
  },
  paso(n: number | string, msg: string): void {
    console.log(`${azul(`[${n}]`)} ${msg}`);
  },
  ok(msg: string): void {
    console.log(`${verde('OK')}    ${msg}`);
  },
  aviso(msg: string): void {
    console.log(`${amarillo('AVISO')} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${rojo('ERROR')} ${msg}`);
  },
  detalle(msg: string): void {
    if (verboso) console.log(gris(`      ${msg}`));
  },
};

/** Barra de progreso de una sola linea, segura fuera de TTY. */
export function progreso(actual: number, total: number, etiqueta: string): void {
  if (total === 0) return;
  if (!process.stdout.isTTY) {
    if (actual === total) console.log(`      ${etiqueta}: ${actual}/${total}`);
    return;
  }
  const ancho = 24;
  const llenos = Math.round((actual / total) * ancho);
  const barra = '#'.repeat(llenos) + '.'.repeat(ancho - llenos);
  const pct = String(Math.round((actual / total) * 100)).padStart(3);
  process.stdout.write(`\r      [${barra}] ${pct}%  ${actual}/${total}  ${etiqueta}`.slice(0, 110));
  if (actual === total) process.stdout.write('\n');
}
