/**
 * Validacion inicial del prompt contra el modelo local.
 *
 *   npm run test:prompt
 *   npm run test:prompt -- --modelo llama3.2:3b
 *
 * Que verifica, en este orden de importancia:
 *  1. BLOQUEANTE  el modelo devuelve SIEMPRE un JSON que respeta el esquema estricto.
 *  2. BLOQUEANTE  con temperature 0 la salida es reproducible (se repite un caso 2 veces).
 *  3. INFORMATIVO cuanto coincide el juicio del modelo con la expectativa humana.
 *
 * Correlo ANTES de procesar un archivo entero: 10 llamadas cuestan segundos y te
 * dicen si el modelo que elegiste sirve para este pipeline.
 */
import { MODELO_LLM, OPCIONES_OLLAMA, REINTENTOS_LLM, URL_OLLAMA } from '../src/config.js';
import { parsearRespuesta } from '../src/motor/esquema.js';
import { estadoOllama, generar, mensajeAyudaOllama, tieneModelo } from '../src/motor/ollama.js';
import { construirPromptUsuario, PROMPT_SISTEMA } from '../src/motor/prompt.js';
import { gris, negrita, rojo, verde, amarillo } from '../src/utilidades/log.js';
import { CASOS } from './afirmaciones-sinteticas.js';

function arg(bandera: string, porDefecto: string): string {
  const i = process.argv.indexOf(bandera);
  return i !== -1 ? (process.argv[i + 1] ?? porDefecto) : porDefecto;
}

const MODELO = arg('--modelo', MODELO_LLM);
const URL = arg('--ollama', URL_OLLAMA);

const OK = verde('  ok  ');
const FALLA = rojo(' falla');
const CASI = amarillo(' ~    ');

async function principal(): Promise<void> {
  console.log(negrita('\nValidacion del prompt de framing causal'));
  console.log(gris(`modelo: ${MODELO}   ollama: ${URL}`));
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
  let coincideTodo = 0;
  let msTotal = 0;
  let tokens = 0;
  let msGeneracion = 0;
  const fallosEsquema: string[] = [];
  const primerJSON = new Map<string, string>();

  for (const caso of CASOS) {
    let evaluacion = null;
    let problema = '';
    let ms = 0;

    for (let intento = 1; intento <= REINTENTOS_LLM + 1; intento++) {
      const r = await generar(URL, MODELO, PROMPT_SISTEMA, construirPromptUsuario(caso.texto, caso.idioma));
      ms += r.ms;
      tokens += r.tokensSalida;
      msGeneracion += r.msGeneracion;
      const v = parsearRespuesta(r.texto);
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
    if (aciertos === 4) coincideTodo++;

    const marca = aciertos === 4 ? OK : aciertos >= 2 ? CASI : FALLA;
    const detalle =
      `causal=${evaluacion.tiene_lenguaje_causal_fuerte}${okCausal ? '' : rojo('!')} ` +
      `contraste=${evaluacion.tiene_contrafactual_o_comparacion}${okContraste ? '' : rojo('!')} ` +
      `ventana=${evaluacion.ventana_temporal_mencionada}${okVentana ? '' : rojo('!')} ` +
      `score=${s.toFixed(2)}${okScore ? '' : rojo(`! esperado ${e.score[0]}-${e.score[1]}`)}`;

    console.log(`${marca} ${caso.id} [${caso.idioma}] ${detalle} ${gris(`${ms} ms`)}`);
    if (problema) console.log(gris(`       ${problema}`));
    console.log(gris(`       "${evaluacion.justificacion.slice(0, 150)}"`));
  }

  // --- Reproducibilidad con temperature 0 -------------------------------
  const casoRepetido = CASOS[0]!;
  const r2 = await generar(URL, MODELO, PROMPT_SISTEMA, construirPromptUsuario(casoRepetido.texto, casoRepetido.idioma));
  const v2 = parsearRespuesta(r2.texto);
  const deterministico =
    v2.ok && primerJSON.get(casoRepetido.id) === JSON.stringify(v2.evaluacion);

  // --- Resumen -----------------------------------------------------------
  console.log(negrita('\nResumen'));
  console.log(`  Esquema JSON valido      ${esquemaOk}/${CASOS.length}`);
  console.log(`  Coincidencia total       ${coincideTodo}/${CASOS.length} ${gris('(informativo, no bloqueante)')}`);
  console.log(`  Determinismo temp=0      ${deterministico ? verde('si') : amarillo('no')}`);
  console.log(`  Latencia media           ${Math.round(msTotal / CASOS.length)} ms por afirmacion`);
  const tokPorSeg = msGeneracion > 0 ? (tokens / msGeneracion) * 1000 : 0;
  console.log(`  Velocidad de generacion  ${tokPorSeg.toFixed(1)} tok/s ${gris(`(${Math.round(tokens / CASOS.length)} tokens por respuesta)`)}`);
  if (tokPorSeg > 0 && tokPorSeg < 25) {
    console.log(amarillo('  Ese ritmo es de CPU, no de GPU. Corre "npm run benchmark" para el detalle.'));
  }

  if (fallosEsquema.length > 0) {
    console.log(rojo('\nFallos de esquema:'));
    for (const f of fallosEsquema) console.log(rojo(`  - ${f}`));
  }

  const pasa = esquemaOk === CASOS.length && deterministico;
  console.log(
    pasa
      ? verde('\nEl modelo respeta el esquema y es reproducible. Podes procesar archivos completos.\n')
      : rojo('\nRevisa el modelo o el prompt antes de procesar un archivo completo.\n'),
  );
  if (coincideTodo < CASOS.length * 0.6) {
    console.log(
      amarillo('Aviso: la coincidencia con la expectativa humana es baja. ' +
        'El esquema se respeta, pero considera un modelo mas grande (qwen2.5:7b) si tu GPU lo permite.\n'),
    );
  }
  process.exitCode = pasa ? 0 : 1;
}

principal().catch((e: unknown) => {
  console.error(rojo(`\n${(e as Error).message}\n`));
  process.exitCode = 1;
});
