/**
 * Validacion del prompt contra el modelo local, campo por campo.
 *
 *   npm run test:prompt
 *   npm run test:prompt -- --modelo qwen2.5:1.5b
 *   npm run test:prompt -- --rapido              (solo los 10 primeros)
 *   npm run test:prompt -- --guardar medidas.json
 *
 * Tres cosas, en este orden de importancia:
 *
 *  1. BLOQUEANTE   el JSON respeta SIEMPRE el esquema estricto.
 *  2. BLOQUEANTE   con temperature 0 la salida es reproducible.
 *  3. DIAGNOSTICO  precision y sensibilidad de CADA campo por separado.
 *
 * El punto 3 es el que cambia decisiones. Un agregado tipo "acierta 7 de 10" esconde
 * el error que mas importa: un modelo puede clavar el score y equivocarse siempre en
 * si hay comparacion, y ese sesgo invalida la tesis del proyecto sin que se note.
 *
 * Costo: ~22 llamadas. En CPU son unos 4 minutos; en GPU, segundos.
 */
import fs from 'node:fs';
import { MODELO_LLM, OPCIONES_OLLAMA, REINTENTOS_LLM, URL_OLLAMA } from '../src/config.js';
import {
  acumular,
  acumularMatriz,
  conteoVacio,
  exactitud,
  exactitudMatriz,
  f1,
  matrizVacia,
  metricasScore,
  pct,
  precision,
  sensibilidad,
  type ConteoBinario,
} from '../src/analisis/metricas.js';
import { criterioFramingCausal } from '../src/criterios/framing-causal/index.js';
import { estadoOllama, generar, mensajeAyudaOllama, tieneModelo } from '../src/motor/ollama.js';
import { amarillo, gris, negrita, rojo, verde } from '../src/utilidades/log.js';
import { CASOS, type CasoSintetico } from './afirmaciones-sinteticas.js';

function arg(bandera: string, porDefecto: string): string {
  const i = process.argv.indexOf(bandera);
  return i !== -1 ? (process.argv[i + 1] ?? porDefecto) : porDefecto;
}
const bandera = (b: string): boolean => process.argv.includes(b);

const MODELO = arg('--modelo', MODELO_LLM);
const URL = arg('--ollama', URL_OLLAMA);
const RAPIDO = bandera('--rapido');
const GUARDAR = process.argv.includes('--guardar') ? arg('--guardar', 'medidas.json') : null;

const SELECCION = RAPIDO ? CASOS.slice(0, 10) : CASOS;

const OK = verde('  ok  ');
const FALLA = rojo(' falla');
const CASI = amarillo('  ~   ');

interface Medicion {
  caso: CasoSintetico;
  causal: boolean;
  contraste: boolean;
  ventana: string;
  score: number;
  justificacion: string;
  ms: number;
  aciertos: number;
}

function fila(nombre: string, c: ConteoBinario): string {
  return (
    `  ${nombre.padEnd(24)}` +
    `${pct(exactitud(c))}   ${pct(precision(c))}   ${pct(sensibilidad(c))}   ${pct(f1(c))}` +
    gris(`    vp ${c.vp}  vn ${c.vn}  fp ${c.fp}  fn ${c.fn}`)
  );
}

async function principal(): Promise<void> {
  console.log(negrita('\nValidacion del prompt de framing causal'));
  console.log(gris(`modelo: ${MODELO}   ollama: ${URL}   casos: ${SELECCION.length}`));
  console.log(
    gris(`opciones: format=json temperature=${OPCIONES_OLLAMA.temperature} ` +
      `num_ctx=${OPCIONES_OLLAMA.num_ctx} num_predict=${OPCIONES_OLLAMA.num_predict}\n`),
  );

  const estado = await estadoOllama(URL);
  if (!estado.disponible || !tieneModelo(estado.modelos, MODELO)) {
    console.error(rojo(await mensajeAyudaOllama(URL, MODELO, estado)));
    process.exitCode = 1;
    return;
  }

  let esquemaOk = 0;
  let msTotal = 0;
  let tokens = 0;
  let msGeneracion = 0;
  const fallosEsquema: string[] = [];
  const primerJSON = new Map<string, string>();
  const mediciones: Medicion[] = [];

  for (const caso of SELECCION) {
    let evaluacion = null;
    let problema = '';
    let ms = 0;

    for (let intento = 1; intento <= REINTENTOS_LLM + 1; intento++) {
      const r = await generar(URL, MODELO, criterioFramingCausal.promptSistema, criterioFramingCausal.construirPrompt(caso.texto, caso.idioma));
      ms += r.ms;
      tokens += r.tokensSalida;
      msGeneracion += r.msGeneracion;
      const v = criterioFramingCausal.validar(r.texto);
      if (v.ok) {
        evaluacion = v.evaluacion;
        if (intento === 1) primerJSON.set(caso.id, JSON.stringify(v.evaluacion));
        if (v.ajustes.length > 0) problema = `ajustes: ${v.ajustes.join('; ')}`;
        break;
      }
      problema = v.problema;
    }
    msTotal += ms;

    if (!evaluacion) {
      fallosEsquema.push(`${caso.id}: ${problema}`);
      console.log(`${FALLA} ${caso.id} [${caso.idioma}] esquema invalido -> ${problema}`);
      continue;
    }
    esquemaOk++;

    const e = caso.espera;
    const okCausal = evaluacion.tiene_lenguaje_causal_fuerte === e.causal;
    const okContraste = evaluacion.tiene_contrafactual_o_comparacion === e.contraste;
    const okVentana = evaluacion.ventana_temporal_mencionada === e.ventana;
    const s = evaluacion.score_framing_causal;
    const okScore = s >= e.score[0] && s <= e.score[1];
    const aciertos = [okCausal, okContraste, okVentana, okScore].filter(Boolean).length;

    mediciones.push({
      caso,
      causal: evaluacion.tiene_lenguaje_causal_fuerte,
      contraste: evaluacion.tiene_contrafactual_o_comparacion,
      ventana: evaluacion.ventana_temporal_mencionada,
      score: s,
      justificacion: evaluacion.justificacion,
      ms,
      aciertos,
    });

    const marca = caso.dificil ? gris(' dific') : aciertos === 4 ? OK : aciertos >= 2 ? CASI : FALLA;
    const cruz = (ok: boolean) => (ok ? '' : rojo('!'));
    console.log(
      `${marca} ${caso.id} [${caso.idioma}] ` +
        `causal=${evaluacion.tiene_lenguaje_causal_fuerte}${cruz(okCausal)} ` +
        `contraste=${evaluacion.tiene_contrafactual_o_comparacion}${cruz(okContraste)} ` +
        `ventana=${evaluacion.ventana_temporal_mencionada}${cruz(okVentana)} ` +
        `score=${s.toFixed(2)}${okScore ? '' : rojo(`! esperado ${e.score[0]}-${e.score[1]}`)} ` +
        gris(`${ms} ms`),
    );
    if (problema) console.log(gris(`       ${problema}`));
    console.log(gris(`       "${evaluacion.justificacion.slice(0, 130)}"`));
  }

  // ---------------------------------------- reproducibilidad con temperature 0
  const casoRepetido = SELECCION[0]!;
  const r2 = await generar(URL, MODELO, criterioFramingCausal.promptSistema, criterioFramingCausal.construirPrompt(casoRepetido.texto, casoRepetido.idioma));
  const v2 = criterioFramingCausal.validar(r2.texto);
  const deterministico = v2.ok && primerJSON.get(casoRepetido.id) === JSON.stringify(v2.evaluacion);

  // ------------------------------------------------------ metricas por campo
  const puntuables = mediciones.filter((m) => !m.caso.dificil);
  const cCausal = conteoVacio();
  const cContraste = conteoVacio();
  const mVentana = matrizVacia(['ninguna', 'corta', 'razonable']);
  for (const m of puntuables) {
    acumular(cCausal, m.caso.espera.causal, m.causal);
    acumular(cContraste, m.caso.espera.contraste, m.contraste);
    acumularMatriz(mVentana, m.caso.espera.ventana, m.ventana);
  }
  const mScore = metricasScore(puntuables.map((m) => ({ obtenido: m.score, rango: m.caso.espera.score })));
  const perfectos = puntuables.filter((m) => m.aciertos === 4).length;

  // ------------------------------------------------------------------ salida
  console.log(negrita('\nCumplimiento del esquema') + gris('  (bloqueante)'));
  console.log(`  JSON valido              ${esquemaOk}/${SELECCION.length}`);
  console.log(`  Determinismo temp=0      ${deterministico ? verde('si') : amarillo('no')}`);

  console.log(negrita('\nCalidad del juicio, campo por campo') + gris(`  (${puntuables.length} casos puntuables)`));
  console.log(gris('                          exact.  prec.  sens.     F1'));
  console.log(fila('lenguaje causal fuerte', cCausal));
  console.log(fila('contrafactual/compar.', cContraste));
  console.log(`  ${'ventana temporal'.padEnd(24)}${pct(exactitudMatriz(mVentana))}` + gris('    (matriz abajo)'));
  console.log(
    `  ${'score en rango'.padEnd(24)}${pct(mScore.dentroDelRango)}` +
      gris(`    error medio ${mScore.errorMedio === null ? 'n/d' : mScore.errorMedio.toFixed(2)}`),
  );
  console.log(`  ${'los 4 campos a la vez'.padEnd(24)}${pct(perfectos / Math.max(1, puntuables.length))}`);

  console.log(negrita('\nMatriz de la ventana temporal') + gris('  (filas = esperado, columnas = obtenido)'));
  console.log(gris('              ninguna   corta  razonable'));
  for (const esperado of mVentana.etiquetas) {
    const celdas = mVentana.etiquetas
      .map((obt) => String(mVentana.matriz[esperado]?.[obt] ?? 0).padStart(7))
      .join('  ');
    console.log(`  ${esperado.padEnd(11)}${celdas}`);
  }

  const dificiles = mediciones.filter((m) => m.caso.dificil);
  if (dificiles.length > 0) {
    console.log(negrita('\nCasos ambiguos') + gris('  (no puntuan; solo para ver como los resuelve)'));
    for (const m of dificiles) {
      console.log(`  ${m.caso.id}  causal=${m.causal} contraste=${m.contraste} score=${m.score.toFixed(2)}`);
    }
  }

  const tokPorSeg = msGeneracion > 0 ? (tokens / msGeneracion) * 1000 : 0;
  console.log(negrita('\nRendimiento'));
  console.log(`  Latencia media           ${Math.round(msTotal / SELECCION.length)} ms por afirmacion`);
  console.log(
    `  Velocidad de generacion  ${tokPorSeg.toFixed(1)} tok/s ` +
      gris(`(${Math.round(tokens / Math.max(1, SELECCION.length))} tokens por respuesta)`),
  );
  if (tokPorSeg > 0 && tokPorSeg < 25) {
    console.log(amarillo('  Ese ritmo es de CPU, no de GPU. Corre "npm run benchmark" para el detalle.'));
  }

  if (fallosEsquema.length > 0) {
    console.log(rojo('\nFallos de esquema:'));
    for (const f of fallosEsquema) console.log(rojo(`  - ${f}`));
  }

  if (GUARDAR) {
    const salida = {
      modelo: MODELO,
      creadoEn: new Date().toISOString(),
      casos: SELECCION.length,
      esquemaOk,
      deterministico,
      tokensPorSegundo: Number(tokPorSeg.toFixed(1)),
      msPorAfirmacion: Math.round(msTotal / SELECCION.length),
      campos: {
        causal: { exactitud: exactitud(cCausal), precision: precision(cCausal), sensibilidad: sensibilidad(cCausal), ...cCausal },
        contraste: { exactitud: exactitud(cContraste), precision: precision(cContraste), sensibilidad: sensibilidad(cContraste), ...cContraste },
        ventana: { exactitud: exactitudMatriz(mVentana), matriz: mVentana.matriz },
        score: mScore,
        cuatroCampos: perfectos / Math.max(1, puntuables.length),
      },
      mediciones: mediciones.map((m) => ({
        id: m.caso.id,
        idioma: m.caso.idioma,
        dificil: Boolean(m.caso.dificil),
        esperado: m.caso.espera,
        obtenido: { causal: m.causal, contraste: m.contraste, ventana: m.ventana, score: m.score },
        justificacion: m.justificacion,
        aciertos: m.aciertos,
      })),
    };
    fs.writeFileSync(GUARDAR, JSON.stringify(salida, null, 2), 'utf8');
    console.log(gris(`\nMedidas guardadas en ${GUARDAR}`));
  }

  const pasa = esquemaOk === SELECCION.length && deterministico;
  console.log(
    pasa
      ? verde('\nEl modelo respeta el esquema y es reproducible. Podes procesar archivos completos.')
      : rojo('\nRevisa el modelo o el prompt antes de procesar un archivo completo.'),
  );

  const exactCausal = exactitud(cCausal) ?? 0;
  const exactContraste = exactitud(cContraste) ?? 0;
  if (pasa && exactContraste < 0.7) {
    console.log(
      amarillo('Aviso: el campo "contrafactual o comparacion" es el mas debil. Es la mitad de la tesis\n' +
        '       del proyecto, asi que un modelo mas grande cambia mas aca que en el score.'),
    );
  } else if (pasa && exactCausal < 0.7) {
    console.log(amarillo('Aviso: el modelo confunde seguido si hay lenguaje causal fuerte. Proba otro modelo.'));
  }
  console.log('');
  process.exitCode = pasa ? 0 : 1;
}

principal().catch((e: unknown) => {
  console.error(rojo(`\n${(e as Error).message}\n`));
  process.exitCode = 1;
});
