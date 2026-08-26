/**
 * Prefiltro heuristico: barato, deterministico y multilingue.
 *
 * Por que existe: mandar cada oracion de un discurso de 40 minutos al LLM local
 * es desperdiciar computo. Una afirmacion causal SIEMPRE deja rastro lexico
 * (un conector), asi que solo lo que trae conector viaja a Ollama.
 * Se puede desactivar con --sin-prefiltro para auditar el recall del propio filtro.
 */

interface Conector {
  /** Patron ya normalizado (minusculas, sin tildes). Los espacios aceptan cualquier blanco. */
  patron: string;
  /** Forma legible que se muestra en el reporte. */
  etiqueta: string;
  idioma: string;
}

/**
 * Expande un verbo causal regular en -ar a las formas que realmente aparecen en
 * un discurso: preterito, participios (con genero y numero), gerundio y presente.
 * Sin esto, "fue provocada por la reforma" se escaparia del filtro.
 * Todas las formas comparten una unica etiqueta (el infinitivo) en el reporte.
 */
function familiaAR(raiz: string, etiqueta: string): Conector[] {
  const sufijos = ['o', 'aron', 'ando', 'ada', 'ado', 'adas', 'ados', 'a', 'an', 'aba', 'aban'];
  return sufijos.map((sufijo) => ({ patron: raiz + sufijo, etiqueta, idioma: 'es' }));
}

const CONECTORES: Conector[] = [
  // --- Espanol: familias verbales causales ---
  ...familiaAR('caus', 'causar'),
  ...familiaAR('provoc', 'provocar'),
  ...familiaAR('gener', 'generar'),
  ...familiaAR('origin', 'originar'),
  ...familiaAR('ocasion', 'ocasionar'),
  ...familiaAR('desat', 'desatar'),
  ...familiaAR('deton', 'detonar'),
  ...familiaAR('desencaden', 'desencadenar'),
  ...familiaAR('propici', 'propiciar'),
  ...familiaAR('motiv', 'motivar'),
  ...familiaAR('impuls', 'impulsar'),
  ...[
    ['produjo', 'producir'], ['produjeron', 'producir'], ['producida', 'producir'],
    ['producido', 'producir'], ['producidas', 'producir'], ['producidos', 'producir'],
    ['produce', 'producir'], ['producen', 'producir'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'es' })),

  // --- Espanol ---
  ...[
    ['causa de', 'causa de'], ['derivo en', 'derivó en'], ['derivada de', 'derivada de'],
    ['desemboco en', 'desembocó en'], ['se debe a', 'se debe a'], ['debido a', 'debido a'],
    ['por culpa de', 'por culpa de'], ['culpa de', 'culpa de'], ['gracias a', 'gracias a'],
    ['a raiz de', 'a raíz de'], ['como consecuencia', 'como consecuencia'],
    ['consecuencia directa', 'consecuencia directa'], ['consecuencia de', 'consecuencia de'],
    ['dio lugar a', 'dio lugar a'], ['trajo como resultado', 'trajo como resultado'],
    ['es responsable de', 'es responsable de'], ['responsable de', 'responsable de'],
    ['hizo que', 'hizo que'], ['llevo a', 'llevó a'], ['condujo a', 'condujo a'],
    ['por eso', 'por eso'], ['por lo tanto', 'por lo tanto'], ['por ende', 'por ende'],
    ['efecto de', 'efecto de'], ['resultado de', 'resultado de'], ['impacto de', 'impacto de'],
    ['repercutio', 'repercutió'], ['incidio en', 'incidió en'], ['merced a', 'merced a'],
    ['a causa de', 'a causa de'], ['por obra de', 'por obra de'], ['destruyo', 'destruyó'],
    ['hundio', 'hundió'], ['disparo la', 'disparó la'], ['freno la', 'frenó la'],
    ['se explica por', 'se explica por'], ['obedece a', 'obedece a'], ['atribuible a', 'atribuible a'],
    ['la razon por la que', 'la razón por la que'], ['es la razon', 'es la razón'],
    ['culpable de', 'culpable de'], ['culpo a', 'culpó a'], ['achaca', 'achaca'],
    ['fruto de', 'fruto de'], ['producto de', 'producto de'], ['por eso mismo', 'por eso mismo'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'es' })),

  // --- Ingles ---
  ...[
    ['caused', 'caused'], ['causing', 'causing'], ['cause of', 'cause of'],
    ['led to', 'led to'], ['leads to', 'leads to'], ['leading to', 'leading to'],
    ['resulted in', 'resulted in'], ['resulting in', 'resulting in'], ['result of', 'result of'],
    ['brought about', 'brought about'], ['gave rise to', 'gave rise to'],
    ['triggered', 'triggered'], ['sparked', 'sparked'], ['set off', 'set off'],
    ['prompted', 'prompted'], ['fueled', 'fueled'], ['fuelled', 'fuelled'],
    ['because of', 'because of'], ['because', 'because'], ['due to', 'due to'],
    ['thanks to', 'thanks to'], ['owing to', 'owing to'], ['as a result', 'as a result'],
    ['responsible for', 'responsible for'], ['blame for', 'blame for'], ['to blame', 'to blame'],
    ['thats why', "that's why"], ['that is why', 'that is why'], ['which is why', 'which is why'],
    ['consequently', 'consequently'], ['therefore', 'therefore'], ['thereby', 'thereby'],
    ['made possible', 'made possible'], ['drove up', 'drove up'], ['drove down', 'drove down'],
    ['wiped out', 'wiped out'], ['destroyed', 'destroyed'],
    ['is why', 'is why'], ['are why', 'are why'], ['was why', 'was why'], ['were why', 'were why'],
    ['reason for', 'reason for'], ['reason why', 'reason why'], ['stems from', 'stems from'],
    ['attributable to', 'attributable to'], ['brought on by', 'brought on by'],
    ['as a consequence', 'as a consequence'], ['blamed', 'blamed'], ['to blame for', 'to blame for'],
    ['created by', 'created by'], ['driven by', 'driven by'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'en' })),

  // --- Portugues ---
  ...[
    ['causou', 'causou'], ['provocou', 'provocou'], ['gerou', 'gerou'],
    ['levou a', 'levou a'], ['resultou em', 'resultou em'], ['por causa de', 'por causa de'],
    ['devido a', 'devido a'], ['gracas a', 'graças a'], ['desencadeou', 'desencadeou'],
    ['responsavel por', 'responsável por'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'pt' })),

  // --- Frances ---
  ...[
    ['a cause de', 'à cause de'], ['a provoque', 'a provoqué'], ['a entraine', 'a entraîné'],
    ['en raison de', 'en raison de'], ['grace a', 'grâce à'], ['a conduit a', 'a conduit à'],
    ['responsable de', 'responsable de'], ['resulte de', 'résulte de'],
    ['a declenche', 'a déclenché'], ['par consequent', 'par conséquent'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'fr' })),

  // --- Italiano ---
  ...[
    ['ha causato', 'ha causato'], ['ha provocato', 'ha provocato'], ['a causa di', 'a causa di'],
    ['grazie a', 'grazie a'], ['ha portato a', 'ha portato a'], ['ha generato', 'ha generato'],
    ['responsabile di', 'responsabile di'], ['di conseguenza', 'di conseguenza'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'it' })),

  // --- Aleman ---
  ...[
    ['verursacht', 'verursacht'], ['gefuhrt zu', 'geführt zu'], ['aufgrund', 'aufgrund'],
    ['wegen', 'wegen'], ['ausgelost', 'ausgelöst'], ['bewirkt', 'bewirkt'],
    ['verantwortlich fur', 'verantwortlich für'], ['dadurch', 'dadurch'], ['deshalb', 'deshalb'],
  ].map(([p, e]) => ({ patron: p!, etiqueta: e!, idioma: 'de' })),
];

/** Minusculas + sin diacriticos, para que "provocó" y "provoco" coincidan igual. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/\s+/g, ' ');
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMPILADOS = CONECTORES.map((c) => ({
  ...c,
  re: new RegExp(`(?<!\\p{L})${escapar(c.patron).replace(/ /g, '\\s+')}(?!\\p{L})`, 'u'),
}));

/** Devuelve las etiquetas legibles de los conectores causales presentes en el texto. */
export function marcadoresCausales(texto: string): string[] {
  const n = normalizar(texto);
  const encontrados: string[] = [];
  for (const c of COMPILADOS) {
    if (c.re.test(n) && !encontrados.includes(c.etiqueta)) encontrados.push(c.etiqueta);
  }
  return encontrados;
}

/** Total de conectores registrados, util para el diagnostico del entorno. */
export const TOTAL_CONECTORES = CONECTORES.length;
