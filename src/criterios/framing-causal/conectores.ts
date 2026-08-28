/**
 * Rastro lexico del framing causal, en 6 idiomas.
 *
 * Vive dentro del criterio y no en `procesamiento/`, porque es contenido de ESTA
 * pregunta: otro criterio busca otras palabras. La maquinaria que lo compila es
 * generica y esta en `procesamiento/prefiltro.ts`.
 *
 * Recall: este filtro descarta el 60-80% del texto sin gastar un token, y a cambio
 * pierde las afirmaciones causales sin conector lexico ("subio el desempleo; ellos
 * estaban en el gobierno"). Cuanto se pierde exactamente se mide con `npm run medir`.
 */
import { compilarGate, familiaAR, lista, type EntradaLexica } from '../../procesamiento/prefiltro.js';

const ENTRADAS: EntradaLexica[] = [
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
  ...lista('es', [
    ['produjo', 'producir'], ['produjeron', 'producir'], ['producida', 'producir'],
    ['producido', 'producir'], ['producidas', 'producir'], ['producidos', 'producir'],
    ['produce', 'producir'], ['producen', 'producir'],
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
  ]),

  ...lista('en', [
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
    // Hallados midiendo el recall sobre un discurso real (Fase B). El gate tenia
    // "drove up" y "drove down" pero no "drove" a secas, que es como aparece en
    // "drove innovation overseas" y "wanted to drive it out".
    ['drove', 'drove'], ['drive out', 'drive out'], ['drives', 'drives'], ['driving', 'driving'],
    // Misma familia semantica —verbos de forzar o empujar un efecto— agregados por
    // analogia con el anterior, no por haber aparecido en la medicion.
    ['spurred', 'spurred'], ['pushed', 'pushed'], ['forced', 'forced'],
    ['paved the way', 'paved the way'], ['contributed to', 'contributed to'],
    ['gave way to', 'gave way to'], ['set in motion', 'set in motion'],
    // Hallado en la medicion sobre la pista ASR del mismo discurso: "And so it for 250
    // years has been subject to...". El gate tenia "therefore" y "consequently" pero no
    // la forma hablada. Va como bigrama: "so" a secas dispararia con medio discurso.
    ['and so', 'and so'],
  ]),

  ...lista('pt', [
    ['causou', 'causou'], ['provocou', 'provocou'], ['gerou', 'gerou'],
    ['levou a', 'levou a'], ['resultou em', 'resultou em'], ['por causa de', 'por causa de'],
    ['devido a', 'devido a'], ['gracas a', 'graças a'], ['desencadeou', 'desencadeou'],
    ['responsavel por', 'responsável por'],
  ]),

  ...lista('fr', [
    ['a cause de', 'à cause de'], ['a provoque', 'a provoqué'], ['a entraine', 'a entraîné'],
    ['en raison de', 'en raison de'], ['grace a', 'grâce à'], ['a conduit a', 'a conduit à'],
    ['responsable de', 'responsable de'], ['resulte de', 'résulte de'],
    ['a declenche', 'a déclenché'], ['par consequent', 'par conséquent'],
  ]),

  ...lista('it', [
    ['ha causato', 'ha causato'], ['ha provocato', 'ha provocato'], ['a causa di', 'a causa di'],
    ['grazie a', 'grazie a'], ['ha portato a', 'ha portato a'], ['ha generato', 'ha generato'],
    ['responsabile di', 'responsabile di'], ['di conseguenza', 'di conseguenza'],
  ]),

  ...lista('de', [
    ['verursacht', 'verursacht'], ['gefuhrt zu', 'geführt zu'], ['aufgrund', 'aufgrund'],
    ['wegen', 'wegen'], ['ausgelost', 'ausgelöst'], ['bewirkt', 'bewirkt'],
    ['verantwortlich fur', 'verantwortlich für'], ['dadurch', 'dadurch'], ['deshalb', 'deshalb'],
  ]),
];

export const GATE_CAUSAL = compilarGate(ENTRADAS);

/** Etiquetas legibles de los conectores causales presentes en el texto. */
export function marcadoresCausales(texto: string): string[] {
  return GATE_CAUSAL.detectar(texto);
}
