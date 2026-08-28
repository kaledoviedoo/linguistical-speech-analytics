/**
 * De donde salen los segundos.
 *
 * Cada evaluacion tarda ~11,6 s en CPU y no sirve de nada optimizar a ciegas: el tiempo
 * de una llamada a Ollama tiene tres partes muy distintas, y cada una se ataca con una
 * palanca distinta.
 *
 *   carga        el modelo entrando a RAM/VRAM. Se paga una vez si keep_alive aguanta.
 *   prompt_eval  procesar el prompt de ENTRADA. Se ataca acortando el prompt de sistema,
 *                pero solo importa si Ollama NO esta reutilizando el prefijo cacheado.
 *   eval         generar los tokens de SALIDA. Se ataca pidiendo menos texto.
 *
 * Este medidor hace tres llamadas reales con el prompt de sistema del criterio y reporta
 * el reparto. La segunda y la tercera dicen si el prefijo se reutiliza: si prompt_eval_count
 * sigue siendo del tamano del prompt de sistema, se esta re-evaluando todo en cada llamada.
 *
 *   npm run latencia
 *   npm run latencia -- --criterio apelacion-autoridad --modelo qwen2.5:1.5b
 */
import { MODELO_LLM, URL_OLLAMA, OPCIONES_OLLAMA } from '../src/config.js';
import { obtenerCriterio } from '../src/criterios/registro.js';

const args = process.argv.slice(2);
const valor = (bandera: string, porDefecto: string): string => {
  const i = args.indexOf(bandera);
  return i >= 0 ? (args[i + 1] ?? porDefecto) : porDefecto;
};

const idCriterio = valor('--criterio', 'framing-causal');
const modelo = valor('--modelo', MODELO_LLM);
const url = valor('--ollama', URL_OLLAMA);
const criterio = obtenerCriterio(idCriterio);

/** Tres textos distintos: el prefijo de sistema se comparte, el resto no. */
const TEXTOS = [
  'La reforma del año pasado provocó la caída del desempleo en el sector industrial.',
  'El aumento de tarifas generó una fuerte contracción del consumo en los hogares.',
  'La salida de capitales fue consecuencia directa de las declaraciones del ministro.',
];

interface Medicion {
  msTotal: number;
  msCarga: number;
  msPrompt: number;
  msGeneracion: number;
  tokensPrompt: number;
  tokensSalida: number;
}

async function unaLlamada(texto: string): Promise<Medicion> {
  const t0 = Date.now();
  const r = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      system: criterio.promptSistema,
      prompt: criterio.construirPrompt(texto, 'es'),
      stream: false,
      format: 'json',
      keep_alive: '15m',
      options: OPCIONES_OLLAMA,
    }),
  });
  if (!r.ok) throw new Error(`Ollama respondio ${r.status}: ${await r.text()}`);
  const d = (await r.json()) as Record<string, number | undefined>;
  const ms = (ns: number | undefined): number => Math.round((ns ?? 0) / 1e6);
  return {
    msTotal: Date.now() - t0,
    msCarga: ms(d['load_duration']),
    msPrompt: ms(d['prompt_eval_duration']),
    msGeneracion: ms(d['eval_duration']),
    tokensPrompt: d['prompt_eval_count'] ?? 0,
    tokensSalida: d['eval_count'] ?? 0,
  };
}

const pct = (parte: number, total: number): string =>
  total > 0 ? `${String(Math.round((parte / total) * 100)).padStart(3)}%` : '  ?%';

console.log(`\nDe donde salen los segundos  -  criterio "${criterio.nombre}", modelo ${modelo}`);
console.log(`prompt de sistema: ${criterio.promptSistema.length} caracteres\n`);

const mediciones: Medicion[] = [];
for (let i = 0; i < TEXTOS.length; i++) {
  const m = await unaLlamada(TEXTOS[i] as string);
  mediciones.push(m);
  const etiqueta = i === 0 ? 'llamada 1 (fria)' : `llamada ${i + 1}       `;
  console.log(
    `  ${etiqueta}  total ${String(m.msTotal).padStart(6)} ms` +
      `   carga ${String(m.msCarga).padStart(6)} ms` +
      `   prompt ${String(m.tokensPrompt).padStart(5)} tok / ${String(m.msPrompt).padStart(5)} ms` +
      `   salida ${String(m.tokensSalida).padStart(4)} tok / ${String(m.msGeneracion).padStart(5)} ms`,
  );
}

// El regimen estable es lo que importa: la primera llamada paga la carga del modelo.
const estables = mediciones.slice(1);
const media = (f: (m: Medicion) => number): number =>
  Math.round(estables.reduce((a, m) => a + f(m), 0) / estables.length);

const mTotal = media((m) => m.msTotal);
const mPrompt = media((m) => m.msPrompt);
const mGen = media((m) => m.msGeneracion);
const tokPrompt = media((m) => m.tokensPrompt);
const tokSalida = media((m) => m.tokensSalida);
const tokPorSeg = mGen > 0 ? (tokSalida / mGen) * 1000 : 0;

console.log('\nREPARTO EN REGIMEN  (promedio de las llamadas 2 y 3, sin la carga inicial)');
console.log(`  procesar el prompt   ${String(mPrompt).padStart(6)} ms   ${pct(mPrompt, mTotal)}   ${tokPrompt} tokens`);
console.log(`  generar la respuesta ${String(mGen).padStart(6)} ms   ${pct(mGen, mTotal)}   ${tokSalida} tokens a ${tokPorSeg.toFixed(1)} tok/s`);
console.log(`  resto (red, parseo)  ${String(mTotal - mPrompt - mGen).padStart(6)} ms   ${pct(mTotal - mPrompt - mGen, mTotal)}`);

console.log('\nDIAGNOSTICO');

// Un prompt de sistema de ~1300 tokens que se re-evalua entero deja prompt_eval_count alto.
// Si el prefijo se reutiliza, en la segunda llamada solo se evaluan los tokens nuevos.
const tokensPrimera = mediciones[0]?.tokensPrompt ?? 0;
if (tokPrompt < tokensPrimera * 0.5) {
  console.log(`  El prefijo del prompt SI se reutiliza (${tokensPrimera} -> ${tokPrompt} tokens).`);
  console.log('  Acortar el prompt de sistema NO va a acelerar nada apreciable.');
} else {
  console.log(`  El prompt se re-evalua ENTERO en cada llamada (${tokPrompt} tokens, ${pct(mPrompt, mTotal)} del tiempo).`);
  console.log('  Acortar el prompt de sistema se traduce casi 1 a 1 en tiempo ahorrado.');
}

if (mGen > mTotal * 0.5) {
  console.log(`  La palanca principal es la SALIDA: ${tokSalida} tokens son el ${pct(mGen, mTotal)} del tiempo.`);
  for (const objetivo of [40, 25, 15]) {
    if (objetivo >= tokSalida) continue;
    const proyectado = mTotal - mGen + (objetivo / tokPorSeg) * 1000;
    console.log(
      `    bajando la salida a ${String(objetivo).padStart(3)} tokens  ->  ` +
        `${(proyectado / 1000).toFixed(1)} s por afirmacion  ` +
        `(${(mTotal / proyectado).toFixed(1)}x mas rapido)`,
    );
  }
}

console.log(
  `\nHoy, 376 afirmaciones = ${((mTotal * 376) / 60000).toFixed(0)} minutos.` +
    '  Corre "npm run benchmark" para saber si el modelo esta en GPU o en CPU.\n',
);
