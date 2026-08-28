/**
 * Fase C: elegir el modelo con datos, no por intuicion.
 *
 * Corre el conjunto de control completo contra varios modelos, uno por uno, y arma la
 * tabla comparativa. Es un solo comando porque la fase se ejecuta en otra maquina —una
 * con GPU— y quien la corra no tiene por que conocer el arnes por dentro.
 *
 *   npm run comparar
 *   npm run comparar -- --modelos qwen2.5:3b,qwen2.5:1.5b,llama3.2:3b
 *   npm run comparar -- --criterio apelacion-autoridad
 *
 * Cada corrida deja su JSON crudo en medidas-<modelo>.json, asi que la tabla se puede
 * rehacer sin volver a pagar el computo. Los dos primeros renglones son BLOQUEANTES: un
 * modelo que no respeta el esquema o que no es reproducible no compite, por rapido que sea.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODELO_LLM, URL_OLLAMA } from '../src/config.js';
import { obtenerCriterio } from '../src/criterios/registro.js';
import { estadoOllama, tieneModelo } from '../src/motor/ollama.js';
import { ejecutar } from '../src/utilidades/proceso.js';
import { amarillo, gris, negrita, rojo, verde } from '../src/utilidades/log.js';

const args = process.argv.slice(2);
const valor = (bandera: string, porDefecto: string): string => {
  const i = args.indexOf(bandera);
  return i >= 0 ? (args[i + 1] ?? porDefecto) : porDefecto;
};

const MODELOS = valor('--modelos', `${MODELO_LLM},qwen2.5:1.5b,llama3.2:3b`)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const ID_CRITERIO = valor('--criterio', 'framing-causal');
const URL = valor('--ollama', URL_OLLAMA);
const criterio = obtenerCriterio(ID_CRITERIO);

interface Medidas {
  modelo: string;
  casos: number;
  esquemaOk: number;
  deterministico: boolean;
  tokensPorSegundo: number;
  msPorAfirmacion: number;
  campos: Record<string, { exactitud: number | null; matriz?: unknown }> & {
    score?: { dentroDelRango: number | null; errorMedio: number | null };
    todosLosCampos?: number;
  };
}

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? '  n/d' : `${(v * 100).toFixed(0).padStart(3)}%`;

async function main(): Promise<number> {
  console.log(negrita(`\nComparacion de modelos  -  criterio "${criterio.nombre}"\n`));

  const estado = await estadoOllama(URL);
  if (!estado.disponible) {
    console.log(rojo(`Ollama no responde en ${URL}. Arrancalo con:  ollama serve`));
    return 1;
  }

  const faltantes = MODELOS.filter((m) => !tieneModelo(estado.modelos, m));
  if (faltantes.length > 0) {
    console.log(rojo('Faltan modelos. Descargalos primero:\n'));
    for (const m of faltantes) console.log(`  ollama pull ${m}`);
    console.log(gris(`\nInstalados ahora mismo: ${estado.modelos.join(', ') || '(ninguno)'}`));
    return 1;
  }

  const resultados: Medidas[] = [];
  for (const modelo of MODELOS) {
    const archivo = `medidas-${modelo.replace(/[:/]/g, '_')}-${ID_CRITERIO}.json`;
    console.log(negrita(`\n--- ${modelo} ---`));
    const r = await ejecutar(
      process.execPath,
      [
        path.join('node_modules', 'tsx', 'dist', 'cli.mjs'),
        path.join('tests', 'eval_prompt.ts'),
        '--modelo', modelo,
        '--criterio', ID_CRITERIO,
        '--ollama', URL,
        '--guardar', archivo,
      ],
      { onLinea: (l) => console.log(gris(`    ${l}`)) },
    );
    if (!fs.existsSync(archivo)) {
      console.log(rojo(`  ${modelo}: la corrida no dejo medidas (codigo ${r.codigo}). Se omite.`));
      continue;
    }
    resultados.push(JSON.parse(fs.readFileSync(archivo, 'utf8')) as Medidas);
  }

  if (resultados.length === 0) {
    console.log(rojo('\nNinguna corrida produjo medidas.'));
    return 1;
  }

  // Las claves de campo las declara el conjunto de control, no este script: asi la
  // tabla sirve igual para un criterio con otros campos.
  const claves = Object.keys(resultados[0]!.campos).filter(
    (k) => k !== 'score' && k !== 'todosLosCampos',
  );

  // La tabla SIN esta linea no se puede comparar con otra corrida. Medido: el mismo
  // modelo a temperatura 0 dio 86% de exactitud en ventana_temporal en una maquina y
  // 82% en otra, con distinta version de Ollama y GPU en vez de CPU. El determinismo
  // vale dentro de una maquina, no entre maquinas.
  console.log(negrita('\n\nTABLA COMPARATIVA'));
  console.log(
    gris(`  Ollama ${estado.version ?? '?'} · ${process.platform}-${process.arch} · Node ${process.version}\n`),
  );
  const cab = [
    'modelo'.padEnd(18),
    'esquema'.padStart(9),
    'determ'.padStart(7),
    ...claves.map((k) => k.slice(0, 10).padStart(11)),
    'score'.padStart(6),
    'todos'.padStart(6),
    'tok/s'.padStart(7),
    'ms/afirm'.padStart(9),
  ].join('');
  console.log(gris(cab));

  for (const m of resultados) {
    const bloqueante = m.esquemaOk === m.casos && m.deterministico;
    const fila = [
      m.modelo.padEnd(18),
      `${m.esquemaOk}/${m.casos}`.padStart(9),
      (m.deterministico ? 'si' : 'NO').padStart(7),
      ...claves.map((k) => pct(m.campos[k]?.exactitud).padStart(11)),
      pct(m.campos.score?.dentroDelRango).padStart(6),
      pct(m.campos.todosLosCampos).padStart(6),
      m.tokensPorSegundo.toFixed(1).padStart(7),
      String(m.msPorAfirmacion).padStart(9),
    ].join('');
    console.log(bloqueante ? fila : rojo(fila));
  }

  console.log(negrita('\nLECTURA'));
  const aptos = resultados.filter((m) => m.esquemaOk === m.casos && m.deterministico);
  const descalificados = resultados.filter((m) => !aptos.includes(m));
  for (const m of descalificados) {
    console.log(
      rojo(`  ${m.modelo} queda fuera: `) +
        (m.esquemaOk !== m.casos ? `solo ${m.esquemaOk}/${m.casos} JSON validos. ` : '') +
        (m.deterministico ? '' : 'no es reproducible a temperatura 0. '),
    );
  }
  if (aptos.length === 0) {
    console.log(rojo('  Ningun modelo pasa los dos gates bloqueantes.'));
    return 1;
  }

  const porCalidad = [...aptos].sort(
    (a, b) => (b.campos.todosLosCampos ?? 0) - (a.campos.todosLosCampos ?? 0),
  );
  const porVelocidad = [...aptos].sort((a, b) => a.msPorAfirmacion - b.msPorAfirmacion);
  const mejor = porCalidad[0]!;
  const rapido = porVelocidad[0]!;

  console.log(`  Mas exacto:  ${verde(mejor.modelo)}  (${pct(mejor.campos.todosLosCampos)} todos los campos)`);
  console.log(`  Mas rapido:  ${verde(rapido.modelo)}  (${rapido.msPorAfirmacion} ms por afirmacion)`);

  if (mejor.modelo === rapido.modelo) {
    console.log(verde(`\n  ${mejor.modelo} gana en las dos cosas. Cambialo por defecto en src/config.ts.`));
  } else {
    const deltaCalidad = ((mejor.campos.todosLosCampos ?? 0) - (rapido.campos.todosLosCampos ?? 0)) * 100;
    const veces = mejor.msPorAfirmacion / rapido.msPorAfirmacion;
    console.log(
      amarillo(
        `\n  Hay que elegir: ${rapido.modelo} es ${veces.toFixed(1)}x mas rapido y pierde ` +
          `${deltaCalidad.toFixed(0)} puntos de exactitud contra ${mejor.modelo}.`,
      ),
    );
    console.log(
      gris(
        '  Regla sugerida: si la diferencia de exactitud es menor a 10 puntos, gana el rapido;\n' +
          '  un discurso de 40 minutos con un modelo el doble de lento son 10 minutos mas de espera.',
      ),
    );
  }
  console.log(gris(`\n  Los JSON crudos quedaron en medidas-*-${ID_CRITERIO}.json\n`));
  return 0;
}

process.exitCode = await main();
