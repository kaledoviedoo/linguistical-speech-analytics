/**
 * Registro de criterios disponibles.
 *
 * A proposito es un objeto literal y no un cargador dinamico que escanee carpetas:
 * con dos o tres criterios, un `import` explicito es mas claro, mas rapido y deja que
 * TypeScript verifique todo. Si algun dia hay diez, se cambia; hoy seria complejidad
 * sin beneficio.
 */
import type { Criterio } from './tipos.js';
import { criterioFramingCausal } from './framing-causal/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRO: Record<string, Criterio<any>> = {
  [criterioFramingCausal.id]: criterioFramingCausal,
};

export const CRITERIO_POR_DEFECTO = criterioFramingCausal.id;

export function listarCriterios(): { id: string; nombre: string; descripcion: string }[] {
  return Object.values(REGISTRO).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function obtenerCriterio(id: string): Criterio<any> {
  const c = REGISTRO[id];
  if (!c) {
    throw new Error(
      `No existe el criterio "${id}".\n  Disponibles: ${Object.keys(REGISTRO).join(', ')}`,
    );
  }
  return c;
}
