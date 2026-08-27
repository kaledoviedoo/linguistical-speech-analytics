/**
 * Reporte HTML autocontenido: un unico archivo con CSS y JS embebidos.
 * Se abre con file:// y no necesita ningun servidor. Los datos viajan
 * dentro del propio HTML en un <script type="application/json">.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Resultados } from '../tipos.js';
import { formatearTiempo, rutaReporte } from '../utilidades/rutas.js';
import { CSS_REPORTE, JS_REPORTE } from './plantilla.js';

function escaparHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Evita que una cadena dentro del JSON cierre el <script> que lo contiene. */
function jsonSeguro(datos: unknown): string {
  return JSON.stringify(datos)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export interface DatosReporte {
  resultados: Resultados;
  titulo: string | null;
  duracionSegundos: number | null;
}

export function construirHTML({ resultados, titulo, duracionSegundos }: DatosReporte): string {
  const filas = resultados.resultados.map((r) => ({
    id: r.id,
    t: r.inicio,
    ts: formatearTiempo(r.inicio),
    tf: formatearTiempo(r.fin),
    idi: r.idioma,
    idn: r.idiomaNombre,
    txt: r.texto,
    ev: r.evaluada,
    sc: r.evaluacion?.score ?? null,
    // El reporte ya no conoce los campos del criterio: recibe marcadores con un tono
    // y los pinta. Un criterio nuevo se muestra sin tocar una linea de esta plantilla.
    mk: r.evaluacion?.marcadores ?? null,
    jus: r.evaluacion?.justificacion ?? null,
    mar: r.marcadoresHeuristicos,
    mot: r.motivoOmision ?? null,
    err: r.error ?? null,
    aj: r.ajustes ?? null,
    ms: r.msLLM,
  }));

  const meta = {
    hash: resultados.hash,
    fuente: resultados.fuente,
    titulo,
    tipoEntrada: resultados.tipoEntrada,
    motorTranscripcion: resultados.motorTranscripcion,
    modeloLLM: resultados.modeloLLM,
    criterio: resultados.criterio,
    idiomaDocumento: resultados.idiomaDocumento,
    timestampsReales: resultados.timestampsReales,
    creadoEn: resultados.creadoEn,
    duracion: duracionSegundos ? formatearTiempo(duracionSegundos) : null,
    umbral: resultados.resumen.umbralUsado,
    resumen: resultados.resumen,
  };

  const nombreVisible = titulo ?? path.basename(resultados.fuente);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auditoría de framing causal - ${escaparHTML(nombreVisible)}</title>
<style>${CSS_REPORTE}</style>
</head>
<body>
<div class="envoltura">

  <header class="cabecera">
    <div>
      <p class="kicker">Auditoría de estructura argumental</p>
      <h1>${escaparHTML(nombreVisible)}</h1>
      <p class="sub" id="sub-meta"></p>
    </div>
    <div class="sello">
      <span class="punto"></span> 100% local
    </div>
  </header>

  <div class="aviso" role="note">
    <strong>Este sistema evalúa la estructura del argumento, no verifica la veracidad del hecho.</strong>
    <span>Un score alto significa que la afirmación presenta una relación causal fuerte sin los marcadores
    que la harían defendible (comparación, contrafactual o ventana temporal razonable). No significa que
    la afirmación sea falsa, ni que sea verdadera: eso queda fuera del alcance de esta herramienta.</span>
  </div>

  <section class="kpis" id="kpis"></section>

  <section class="controles">
    <div class="control">
      <label for="umbral">Umbral de score <output id="valor-umbral"></output></label>
      <input type="range" id="umbral" min="0" max="1" step="0.05">
    </div>
    <div class="control">
      <label for="buscar">Buscar en el texto</label>
      <input type="search" id="buscar" placeholder="palabra o frase...">
    </div>
    <div class="control">
      <label for="idioma">Idioma</label>
      <select id="idioma"></select>
    </div>
    <div class="control">
      <label for="orden">Ordenar por</label>
      <select id="orden">
        <option value="score">Score (mayor primero)</option>
        <option value="tiempo">Timestamp</option>
      </select>
    </div>
    <div class="control interruptores">
      <label><input type="checkbox" id="solo-causal"> Solo las que tienen algún rasgo marcado</label>
      <label><input type="checkbox" id="ver-omitidas"> Mostrar afirmaciones no evaluadas</label>
    </div>
    <div class="control acciones">
      <button type="button" id="btn-csv">Descargar CSV</button>
      <button type="button" id="btn-reset">Restablecer filtros</button>
    </div>
  </section>

  <p class="conteo" id="conteo"></p>

  <div class="tabla-envoltura">
    <table id="tabla">
      <thead>
        <tr>
          <th class="col-t">Timestamp</th>
          <th class="col-i">Idioma</th>
          <th class="col-a">Afirmación</th>
          <th class="col-s">Score</th>
          <th class="col-m">Marcadores</th>
          <th class="col-j">Justificación</th>
        </tr>
      </thead>
      <tbody id="cuerpo"></tbody>
    </table>
  </div>

  <p class="vacio oculto" id="vacio">Ninguna afirmación supera los filtros actuales.</p>

  <footer class="pie">
    <p>Generado localmente el <span id="pie-fecha"></span> &middot; modelo <code id="pie-modelo"></code>
       &middot; transcripción <code id="pie-motor"></code> &middot; hash <code id="pie-hash"></code><span id="pie-rendimiento"></span></p>
    <p class="legal">Herramienta de análisis lingüístico. Los scores son heurísticos y provienen de un
       modelo de lenguaje pequeño ejecutado en local; deben leerse como una señal para revisión humana,
       nunca como un veredicto.</p>
  </footer>

</div>

<script id="datos-meta" type="application/json">${jsonSeguro(meta)}</script>
<script id="datos-filas" type="application/json">${jsonSeguro(filas)}</script>
<script>${JS_REPORTE}</script>
</body>
</html>`;
}

/** Escribe el reporte en ./reportes/<hash>.html y devuelve la ruta absoluta. */
export function escribirReporte(datos: DatosReporte): string {
  const ruta = rutaReporte(datos.resultados.hash);
  fs.writeFileSync(ruta, construirHTML(datos), 'utf8');
  return ruta;
}
