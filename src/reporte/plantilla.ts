/**
 * CSS y JS embebidos en el reporte. Se mantienen como cadenas planas
 * (sin backticks ni interpolacion) para poder incrustarlos sin escapes raros.
 */

export const CSS_REPORTE = `
:root {
  color-scheme: light dark;
  --fondo: #f7f7f5;
  --panel: #ffffff;
  --borde: #e3e1dc;
  --texto: #1c1b19;
  --tenue: #6b6862;
  --acento: #2f6f4f;
  --aviso-fondo: #fff8e6;
  --aviso-borde: #e8c66a;
  --alto: #b03a2e;
  --medio: #c47f1c;
  --bajo: #4a7c59;
  --sombra: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.04);
  --radio: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fondo: #16161a;
    --panel: #1e1e23;
    --borde: #33333b;
    --texto: #eceae6;
    --tenue: #9b978f;
    --acento: #7fc0a0;
    --aviso-fondo: #2a2415;
    --aviso-borde: #6b5a25;
    --alto: #e57366;
    --medio: #e0aa55;
    --bajo: #7fc0a0;
    --sombra: none;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--fondo);
  color: var(--texto);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.envoltura { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }

.cabecera { display: flex; gap: 20px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
.kicker { margin: 0 0 4px; font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: var(--tenue); }
h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 650; overflow-wrap: anywhere; }
.sub { margin: 8px 0 0; color: var(--tenue); font-size: 13.5px; }
.sello {
  display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  border: 1px solid var(--borde); background: var(--panel); color: var(--tenue);
  border-radius: 999px; padding: 6px 14px; font-size: 12.5px; box-shadow: var(--sombra);
}
.punto { width: 8px; height: 8px; border-radius: 50%; background: var(--bajo); }

.aviso {
  margin: 24px 0 28px; padding: 16px 18px; display: grid; gap: 6px;
  background: var(--aviso-fondo); border: 1px solid var(--aviso-borde);
  border-left-width: 4px; border-radius: var(--radio); font-size: 13.5px;
}
.aviso strong { font-size: 14.5px; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
.kpi { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px 16px; box-shadow: var(--sombra); }
.kpi .n { font-size: 24px; font-weight: 640; font-variant-numeric: tabular-nums; }
.kpi .e { font-size: 12px; color: var(--tenue); margin-top: 2px; }

.controles {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px 18px;
  background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio);
  padding: 16px 18px; margin-bottom: 14px; box-shadow: var(--sombra); align-items: end;
}
.control { display: grid; gap: 6px; }
.control > label { font-size: 12px; color: var(--tenue); }
.control input[type=search], .control select {
  width: 100%; padding: 7px 9px; border-radius: 7px; font: inherit; font-size: 13.5px;
  border: 1px solid var(--borde); background: var(--fondo); color: var(--texto);
}
.control input[type=range] { width: 100%; accent-color: var(--acento); }
.interruptores { gap: 6px; }
.interruptores label { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--texto); }
.acciones { display: flex; flex-wrap: wrap; gap: 8px; }
button {
  font: inherit; font-size: 13px; padding: 7px 12px; cursor: pointer;
  border: 1px solid var(--borde); background: var(--fondo); color: var(--texto); border-radius: 7px;
}
button:hover { border-color: var(--acento); color: var(--acento); }
output { font-variant-numeric: tabular-nums; font-weight: 620; color: var(--texto); }

.conteo { margin: 0 0 12px; font-size: 13px; color: var(--tenue); }

.tabla-envoltura { overflow-x: auto; border: 1px solid var(--borde); border-radius: var(--radio); background: var(--panel); box-shadow: var(--sombra); }
table { width: 100%; min-width: 880px; table-layout: fixed; border-collapse: collapse; font-size: 13.5px; }
thead th {
  position: sticky; top: 0; z-index: 1; text-align: left; font-weight: 600; font-size: 12px;
  letter-spacing: .04em; text-transform: uppercase; color: var(--tenue);
  background: var(--panel); border-bottom: 1px solid var(--borde); padding: 11px 14px; white-space: nowrap;
}
tbody td { padding: 12px 14px; border-bottom: 1px solid var(--borde); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
tbody tr.omitida { opacity: .58; }
.col-t { width: 92px; }
.col-i { width: 100px; }
.col-s { width: 108px; }
.col-m { width: 186px; }
.col-j { width: 27%; }
.marca-tiempo { font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--tenue); white-space: nowrap; }
.nota-ajustes { margin-top: 5px; font-size: 12px; font-style: italic; opacity: .85; }
.afirmacion { overflow-wrap: break-word; hyphens: auto; }
.justificacion { color: var(--tenue); font-size: 13px; overflow-wrap: break-word; }

.score { display: grid; gap: 5px; }
.score .v { font-variant-numeric: tabular-nums; font-weight: 640; font-size: 14px; }
.barra { height: 5px; border-radius: 3px; background: var(--borde); overflow: hidden; }
.barra > i { display: block; height: 100%; border-radius: 3px; }
.s-alto .v, .s-alto > .barra > i { color: var(--alto); background: var(--alto); }
.s-medio .v, .s-medio > .barra > i { color: var(--medio); background: var(--medio); }
.s-bajo .v, .s-bajo > .barra > i { color: var(--bajo); background: var(--bajo); }
.s-alto .v, .s-medio .v, .s-bajo .v { background: none; }

.etiquetas { display: flex; flex-wrap: wrap; gap: 5px; }
.et {
  font-size: 11.5px; padding: 2.5px 7px; border-radius: 999px;
  border: 1px solid var(--borde); color: var(--tenue); white-space: nowrap;
}
.et.si { border-color: var(--bajo); color: var(--bajo); }
.et.no { border-color: var(--alto); color: var(--alto); }
.et.idi { border-color: var(--borde); }
.et.heur { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

.vacio { text-align: center; color: var(--tenue); padding: 32px 0; font-size: 14px; }
.oculto { display: none; }

.pie { margin-top: 28px; color: var(--tenue); font-size: 12.5px; }
.pie code { font-size: 12px; }
.pie .legal { margin-top: 6px; max-width: 78ch; }

@media (max-width: 760px) {
  .envoltura { padding: 22px 14px 48px; }
  h1 { font-size: 21px; }
}
`;

export const JS_REPORTE = `
(function () {
  'use strict';

  var META = JSON.parse(document.getElementById('datos-meta').textContent);
  var FILAS = JSON.parse(document.getElementById('datos-filas').textContent);

  var elUmbral = document.getElementById('umbral');
  var elValorUmbral = document.getElementById('valor-umbral');
  var elBuscar = document.getElementById('buscar');
  var elIdioma = document.getElementById('idioma');
  var elOrden = document.getElementById('orden');
  var elSoloCausal = document.getElementById('solo-causal');
  var elVerOmitidas = document.getElementById('ver-omitidas');
  var elCuerpo = document.getElementById('cuerpo');
  var elConteo = document.getElementById('conteo');
  var elVacio = document.getElementById('vacio');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nivel(sc) { return sc >= 0.8 ? 's-alto' : (sc >= 0.5 ? 's-medio' : 's-bajo'); }

  // --- cabecera y KPIs -------------------------------------------------
  var partesMeta = [];
  partesMeta.push('Fuente: ' + esc(META.fuente));
  if (META.duracion) partesMeta.push('Duración ' + esc(META.duracion));
  partesMeta.push('Idioma dominante: ' + esc(META.idiomaDocumento));
  if (!META.timestampsReales) partesMeta.push('timestamps estimados (el origen no traía marcas de tiempo)');
  document.getElementById('sub-meta').innerHTML = partesMeta.join(' &middot; ');
  document.getElementById('pie-fecha').textContent = new Date(META.creadoEn).toLocaleString();
  document.getElementById('pie-modelo').textContent = META.modeloLLM;
  document.getElementById('pie-motor').textContent = META.motorTranscripcion;
  document.getElementById('pie-hash').textContent = META.hash;

  var R = META.resumen;
  var kpis = [
    [R.totalSegmentos, 'afirmaciones segmentadas'],
    [R.preseleccionados, 'pasaron el prefiltro causal'],
    [R.evaluados, 'evaluadas por el LLM'],
    [R.sobreUmbral, 'sobre el umbral ' + R.umbralUsado.toFixed(2)],
    [R.scorePromedio.toFixed(2), 'score promedio (evaluadas)']
  ];
  if (R.fallidos > 0) kpis.push([R.fallidos, 'sin JSON válido']);
  document.getElementById('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="n">' + esc(k[0]) + '</div><div class="e">' + esc(k[1]) + '</div></div>';
  }).join('');

  // --- filtro de idiomas ----------------------------------------------
  var idiomas = {};
  FILAS.forEach(function (f) { idiomas[f.idi] = f.idn; });
  var opciones = ['<option value="">Todos</option>'];
  Object.keys(idiomas).sort().forEach(function (k) {
    opciones.push('<option value="' + esc(k) + '">' + esc(idiomas[k]) + '</option>');
  });
  elIdioma.innerHTML = opciones.join('');

  // --- render ----------------------------------------------------------
  function visibles() {
    var u = parseFloat(elUmbral.value);
    var q = elBuscar.value.trim().toLowerCase();
    var idi = elIdioma.value;
    var soloCausal = elSoloCausal.checked;
    var verOmitidas = elVerOmitidas.checked;

    var out = FILAS.filter(function (f) {
      if (idi && f.idi !== idi) return false;
      if (q && f.txt.toLowerCase().indexOf(q) === -1) return false;
      if (!f.ev) return verOmitidas;
      if (soloCausal && !f.cau) return false;
      return f.sc !== null && f.sc >= u;
    });

    if (elOrden.value === 'tiempo') out.sort(function (a, b) { return a.t - b.t; });
    else out.sort(function (a, b) { return (b.sc === null ? -1 : b.sc) - (a.sc === null ? -1 : a.sc) || a.t - b.t; });
    return out;
  }

  function etiquetasDe(f) {
    var e = [];
    if (f.ev) {
      e.push('<span class="et ' + (f.cau ? 'no' : 'si') + '">' +
        (f.cau ? 'causal fuerte' : 'sin causal fuerte') + '</span>');
      e.push('<span class="et ' + (f.con ? 'si' : 'no') + '">' +
        (f.con ? 'con contraste' : 'sin contraste') + '</span>');
      e.push('<span class="et ' + (f.ven === 'razonable' ? 'si' : (f.ven === 'corta' ? 'no' : '')) + '">ventana: ' +
        esc(f.ven) + '</span>');
    }
    (f.mar || []).slice(0, 4).forEach(function (m) {
      e.push('<span class="et heur">' + esc(m) + '</span>');
    });
    return '<div class="etiquetas">' + e.join('') + '</div>';
  }

  function render() {
    elValorUmbral.textContent = parseFloat(elUmbral.value).toFixed(2);
    var datos = visibles();

    elCuerpo.innerHTML = datos.map(function (f) {
      var celdaScore = f.ev && f.sc !== null
        ? '<div class="score ' + nivel(f.sc) + '"><span class="v">' + f.sc.toFixed(2) +
          '</span><span class="barra"><i style="width:' + Math.round(f.sc * 100) + '%"></i></span></div>'
        : '<span class="marca-tiempo">no evaluada</span>';

      var justificacion = f.ev
        ? esc(f.jus)
        : (f.err ? 'Error del modelo: ' + esc(f.err) : esc(f.mot || ''));

      var avisoAjustes = (f.aj && f.aj.length)
        ? '<div class="nota-ajustes">ajustes del validador: ' + esc(f.aj.join('; ')) + '</div>'
        : '';

      return '<tr class="' + (f.ev ? '' : 'omitida') + '">' +
        '<td class="col-t"><span class="marca-tiempo">' + esc(f.ts) + '</span></td>' +
        '<td class="col-i"><span class="et idi">' + esc(f.idn) + '</span></td>' +
        '<td class="afirmacion">' + esc(f.txt) + '</td>' +
        '<td class="col-s">' + celdaScore + '</td>' +
        '<td class="col-m">' + etiquetasDe(f) + '</td>' +
        '<td class="col-j"><div class="justificacion">' + justificacion + avisoAjustes + '</div></td>' +
        '</tr>';
    }).join('');

    elVacio.classList.toggle('oculto', datos.length > 0);
    elConteo.textContent = 'Mostrando ' + datos.length + ' de ' + FILAS.length +
      ' afirmaciones (' + META.resumen.evaluados + ' evaluadas por el modelo).';
  }

  // --- CSV --------------------------------------------------------------
  function csv() {
    var cab = ['timestamp_inicio', 'timestamp_fin', 'idioma', 'afirmacion', 'score',
      'causal_fuerte', 'contrafactual_o_comparacion', 'ventana_temporal', 'justificacion', 'marcadores'];
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lineas = [cab.join(',')];
    visibles().forEach(function (f) {
      lineas.push([f.ts, f.tf, f.idn, f.txt, f.sc === null ? '' : f.sc,
        f.cau === null ? '' : f.cau, f.con === null ? '' : f.con, f.ven || '',
        f.jus || f.mot || f.err || '', (f.mar || []).join(' | ')].map(q).join(','));
    });
    return lineas.join('\\n');
  }

  document.getElementById('btn-csv').addEventListener('click', function () {
    var blob = new Blob(['\\ufeff' + csv()], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'framing-causal-' + META.hash + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    elUmbral.value = META.umbral;
    elBuscar.value = '';
    elIdioma.value = '';
    elOrden.value = 'score';
    elSoloCausal.checked = false;
    elVerOmitidas.checked = false;
    render();
  });

  [elUmbral, elBuscar, elIdioma, elOrden, elSoloCausal, elVerOmitidas].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  elUmbral.value = META.umbral;
  render();
})();
`;
