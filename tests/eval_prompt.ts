/**
 * Validacion de un criterio contra el modelo local, campo por campo.
 *
 *   npm run test:prompt
 *   npm run test:prompt -- --criterio apelacion-autoridad
 *   npm run test:prompt -- --modelo qwen2.5:1.5b
 *   npm run test:prompt -- --rapido                  (solo los 10 primeros)
 *   npm run test:prompt -- --guardar medidas.json
 *
 * Tres cosas, en este orden de importancia:
 *
 *  1. BLOQUEANTE   el JSON respeta SIEMPRE el esquema estricto del criterio.
 *  2. BLOQUEANTE   con temperature 0 la salida es reproducible.
 *  3. DIAGNOSTICO  precision y sensibilidad de CADA campo por separado.
 *
 * El punto 3 es el que cambia decisiones. Un agregado tipo "acierta 7 de 10" esconde
 * el error que mas importa: un modelo puede clavar el score y equivocarse siempre en
 * un campo, y ese sesgo invalida la tesis del criterio sin que se note en el promedio.
 *
 * El arnes NO conoce los campos de ningun criterio. Cada caso de control declara que
 * espera por clave, y aca se compara clave por clave: booleanos a matriz binaria,
 * enums a matriz de N valores. Por eso sirve igual para un criterio nuevo.
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
  type MatrizConfusion,
} from '../src/analisis/metricas.js';
import { CRITERIO_POR_DEFECTO, obtenerCriterio } from '../src/criterios/registro.js';
import { estadoOllama, generar, mensajeAyudaOllama, tieneModelo } from '../src/motor/ollama.js';
import { amarillo, gris, negrita, rojo, verde } from '../src/utilidades/log.js';
import { conjuntoDeControl } from './casos-index.js';
import type { CasoControl } from './casos-tipos.js';

function arg(bandera: string, porDefecto: string): string {
  const i = process.argv.indexOf(bandera);
  return i !== -1 ? (process.argv[i + 1] ?? porDefecto) : porDefecto;
}
const bandera = (b: string): boolean => process.argv.includes(b);

const ID_CRITERIO = arg('--criterio', CRITERIO_POR_DEFECTO);
const MODELO = arg('--modelo', MODELO_LLM);
const URL = arg('--ollama', URL_OLLAMA);
const RAPIDO = bandera('--rapido');
const GUARDAR = process.argv.includes('--guardar') ? arg('--guardar', 'medidas.json') : null;

const OK = verde('  ok  ');
const FALLA = rojo(' falla');
const CASI = amarillo('  ~   ');

interface Medicion {
  caso: CasoControl;
  campos: Record<string, unknown>;
  score: number;
  justificacion: string;
  ms: number;
  aciertos: number;
  esperados: number;
}

/**
 * Etiquetas cortas y UNICAS para la linea por caso.
 * Antes se abreviaba con `clave.split('_')[0]`, y como los dos booleanos del criterio
 * causal empiezan con "tiene_", los dos salian como "tiene=" y no se distinguian.
 */
function abreviar(claves: string[]): Record<string, string> {
  const corto = (k: string): string => {
    const sinPrefijo = k.replace(/^(tiene|es|hay)_/, '');
    return sinPrefijo.split('_').filter((p) => p.length > 2).slice(0, 2).join('_') || sinPrefijo;
  };
  const propuesto = Object.fromEntries(claves.map((k) => [k, corto(k)]));
  const usados = Object.values(propuesto);
  // Si dos claves colapsan en la misma etiqueta, se usan las claves enteras.
  const hayChoque = new Set(usados).size !== usados.length;
  return hayChoque ? Object.fromEntries(claves.map((k) => [k, k])) : propuesto;
}

function filaBinaria(nombre: string, c: ConteoBinario): string {
  return (
    `  ${nombre.padEnd(34)}` +
    `${pct(exactitud(c))}   ${pct(precision(c))}   ${pct(sensibilidad(c))}   ${pct(f1(c))}` +
    gris(`   vp ${c.vp} vn ${c.vn} fp ${c.fp} fn ${c.fn}`)
  );
}

async function principal(): Promise<void> {
  const criterio = obtenerCriterio(ID_CRITERIO);
  const conjunto = conjuntoDeControl(ID_CRITERIO);
  const SELECCION = RAPIDO ? conjunto.casos.slice(0, 10) : conjunto.casos;

  console.log(negrita(`\nValidacion del criterio "${criterio.nombre}"`));
  console.log(gris(`${criterio.descripcion}`));
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
    let evaluacion: Record<string, unknown> | null = null;
    let problema = '';
    let ms = 0;

    for (let intento = 1; intento <= REINTENTOS_LLM + 1; intento++) {
      const r = await generar(URL, MODELO, criterio.promptSistema, criterio.construirPrompt(caso.texto, caso.idioma));
      ms += r.ms;
      tokens += r.tokensSalida;
      msGeneracion += r.msGeneracion;
      const v = criterio.validar(r.texto);
      if (v.ok) {
        evaluacion = v.evaluacion as Record<string, unknown>;
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

    const score = criterio.score(evaluacion as never);
    const justificacion = criterio.justificacion(evaluacion as never);
    const [minS, maxS] = caso.espera.score;
    const okScore = score >= minS && score <= maxS;

    const claves = Object.keys(caso.espera.campos);
    const etiquetas = abreviar(claves);
    const aciertosCampos = claves.filter((k) => evaluacion![k] === caso.espera.campos[k]).length;
    const aciertos = aciertosCampos + (okScore ? 1 : 0);
    const esperados = claves.length + 1;

    mediciones.push({ caso, campos: evaluacion, score, justificacion, ms, aciertos, esperados });

    const marca = caso.dificil ? gris(' dific') : aciertos === esperados ? OK : aciertos >= esperados - 2 ? CASI : FALLA;
    const detalle = claves
      .map((k) => `${etiquetas[k]}=${String(evaluacion![k])}${evaluacion![k] === caso.espera.campos[k] ? '' : rojo('!')}`)
      .join(' ');
    console.log(
      `${marca} ${caso.id} [${caso.idioma}] ${detalle} ` +
        `score=${score.toFixed(2)}${okScore ? '' : rojo(`! esperado ${minS}-${maxS}`)} ` +
        gris(`${ms} ms`),
    );
    if (problema) console.log(gris(`       ${problema}`));
    console.log(gris(`       "${justificacion.slice(0, 130)}"`));
  }

  // ---------------------------------------- reproducibilidad con temperature 0
  const casoRepetido = SELECCION[0]!;
  const r2 = await generar(URL, MODELO, criterio.promptSistema, criterio.construirPrompt(casoRepetido.texto, casoRepetido.idioma));
  const v2 = criterio.validar(r2.texto);
  const deterministico = v2.ok && primerJSON.get(casoRepetido.id) === JSON.stringify(v2.evaluacion);

  // ------------------------------------------------------ metricas por campo
  const puntuables = mediciones.filter((m) => !m.caso.dificil);
  const clavesTodas = [...new Set(puntuables.flatMap((m) => Object.keys(m.caso.espera.campos)))];

  const binarios = new Map<string, ConteoBinario>();
  const matrices = new Map<string, MatrizConfusion>();

  for (const clave of clavesTodas) {
    const valores = puntuables.map((m) => m.caso.espera.campos[clave]).filter((v) => v !== undefined);
    if (valores.every((v) => typeof v === 'boolean')) {
      binarios.set(clave, conteoVacio());
    } else {
      const etiquetas = [...new Set(valores.map(String))].sort();
      matrices.set(clave, matrizVacia(etiquetas));
    }
  }

  for (const m of puntuables) {
    for (const [clave, conteo] of binarios) {
      const esperado = m.caso.espera.campos[clave];
      if (typeof esperado !== 'boolean') continue;
      acumular(conteo, esperado, Boolean(m.campos[clave]));
    }
    for (const [clave, matriz] of matrices) {
      const esperado = m.caso.espera.campos[clave];
      if (esperado === undefined) continue;
      acumularMatriz(matriz, String(esperado), String(m.campos[clave]));
    }
  }

  const mScore = metricasScore(puntuables.map((m) => ({ obtenido: m.score, rango: m.caso.espera.score })));
  const perfectos = puntuables.filter((m) => m.aciertos === m.esperados).length;

  // ------------------------------------------------------------------ salida
  console.log(negrita('\nCumplimiento del esquema') + gris('  (bloqueante)'));
  console.log(`  JSON valido              ${esquemaOk}/${SELECCION.length}`);
  console.log(`  Determinismo temp=0      ${deterministico ? verde('si') : amarillo('no')}`);

  console.log(negrita('\nCalidad del juicio, campo por campo') + gris(`  (${puntuables.length} casos puntuables)`));
  console.log(gris('                                    exact.  prec.  sens.     F1'));
  for (const [clave, conteo] of binarios) console.log(filaBinaria(clave, conteo));
  for (const [clave, matriz] of matrices) {
    console.log(`  ${clave.padEnd(34)}${pct(exactitudMatriz(matriz))}` + gris('    (matriz abajo)'));
  }
  console.log(
    `  ${'score en rango'.padEnd(34)}${pct(mScore.dentroDelRango)}` +
      gris(`    error medio ${mScore.errorMedio === null ? 'n/d' : mScore.errorMedio.toFixed(2)}`),
  );
  console.log(`  ${'todos los campos a la vez'.padEnd(34)}${pct(perfectos / Math.max(1, puntuables.length))}`);

  for (const [clave, matriz] of matrices) {
    console.log(negrita(`\nMatriz de ${clave}`) + gris('  (filas = esperado, columnas = obtenido)'));
    console.log(gris('              ' + matriz.etiquetas.map((e) => e.padStart(11)).join('')));
    for (const esperado of matriz.etiquetas) {
      const celdas = matriz.etiquetas
        .map((obt) => String(matriz.matriz[esperado]?.[obt] ?? 0).padStart(11))
        .join('');
      console.log(`  ${esperado.padEnd(12)}${celdas}`);
    }
  }

  const dificiles = mediciones.filter((m) => m.caso.dificil);
  if (dificiles.length > 0) {
    console.log(negrita('\nCasos ambiguos') + gris('  (no puntuan; solo para ver como los resuelve)'));
    for (const m of dificiles) {
      const cortas = abreviar(Object.keys(m.caso.espera.campos));
      const resumen = Object.keys(m.caso.espera.campos).map((k) => `${cortas[k]}=${String(m.campos[k])}`).join(' ');
      console.log(`  ${m.caso.id}  ${resumen} score=${m.score.toFixed(2)}`);
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
      criterio: criterio.id,
      modelo: MODELO,
      creadoEn: new Date().toISOString(),
      casos: SELECCION.length,
      esquemaOk,
      deterministico,
      tokensPorSegundo: Number(tokPorSeg.toFixed(1)),
      msPorAfirmacion: Math.round(msTotal / SELECCION.length),
      campos: {
        ...Object.fromEntries(
          [...binarios].map(([k, c]) => [
            k,
            { exactitud: exactitud(c), precision: precision(c), sensibilidad: sensibilidad(c), ...c },
          ]),
        ),
        ...Object.fromEntries(
          [...matrices].map(([k, m]) => [k, { exactitud: exactitudMatriz(m), matriz: m.matriz }]),
        ),
        score: mScore,
        todosLosCampos: perfectos / Math.max(1, puntuables.length),
      },
      mediciones: mediciones.map((m) => ({
        id: m.caso.id,
        idioma: m.caso.idioma,
        dificil: Boolean(m.caso.dificil),
        esperado: m.caso.espera,
        obtenido: { ...m.campos, score: m.score },
        aciertos: `${m.aciertos}/${m.esperados}`,
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

  const peor = [...binarios.entries()].sort((a, b) => (exactitud(a[1]) ?? 1) - (exactitud(b[1]) ?? 1))[0];
  if (pasa && peor && (exactitud(peor[1]) ?? 1) < 0.7) {
    console.log(
      amarillo(`Aviso: el campo mas debil es "${peor[0]}" (${pct(exactitud(peor[1])).trim()}).\n` +
        '       Ahi es donde un modelo mas grande cambia mas que en el score.'),
    );
  }
  console.log('');
  process.exitCode = pasa ? 0 : 1;
}

principal().catch((e: unknown) => {
  console.error(rojo(`\n${(e as Error).message}\n`));
  process.exitCode = 1;
});
