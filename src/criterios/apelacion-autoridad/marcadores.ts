/**
 * Rastro lexico de la apelacion a autoridad, en 4 idiomas.
 *
 * Mas selectivo que el causal a proposito: "los datos" o "el informe" a secas aparecen
 * todo el tiempo en discurso economico sin ser apelaciones, asi que solo entran en
 * construcciones que si lo son ("segun los datos").
 */
import { compilarGate, lista, type EntradaLexica } from '../../procesamiento/prefiltro.js';

const ENTRADAS: EntradaLexica[] = [
  ...lista('es', [
    ['los expertos', 'los expertos'], ['expertos coinciden', 'expertos coinciden'],
    ['los especialistas', 'los especialistas'], ['los cientificos', 'los científicos'],
    ['los economistas', 'los economistas'], ['los analistas', 'los analistas'],
    ['los estudios', 'los estudios'], ['estudios demuestran', 'estudios demuestran'],
    ['estudios muestran', 'estudios muestran'], ['la investigacion', 'la investigación'],
    ['las investigaciones', 'las investigaciones'], ['la evidencia', 'la evidencia'],
    ['la ciencia', 'la ciencia'], ['esta demostrado', 'está demostrado'],
    ['esta probado', 'está probado'], ['esta comprobado', 'está comprobado'],
    ['esta cientificamente', 'está científicamente'], ['es sabido', 'es sabido'],
    ['todo el mundo sabe', 'todo el mundo sabe'], ['todos sabemos', 'todos sabemos'],
    ['nadie discute', 'nadie discute'], ['nadie duda', 'nadie duda'],
    ['el consenso', 'el consenso'], ['hay consenso', 'hay consenso'],
    ['segun los datos', 'según los datos'], ['los datos muestran', 'los datos muestran'],
    ['las cifras demuestran', 'las cifras demuestran'], ['segun los expertos', 'según los expertos'],
    ['organismos internacionales', 'organismos internacionales'],
    ['la comunidad cientifica', 'la comunidad científica'],
    ['quedo demostrado', 'quedó demostrado'], ['ha quedado claro', 'ha quedado claro'],
    // La forma hablada de dirigirse al auditorio, que es la mas frecuente en un discurso.
    ['saben que', 'saben que'], ['sabemos que', 'sabemos que'], ['ya saben', 'ya saben'],
    ['como saben', 'como saben'], ['ustedes saben', 'ustedes saben'],
  ]),

  ...lista('en', [
    ['experts', 'experts'], ['experts agree', 'experts agree'], ['specialists', 'specialists'],
    ['scientists', 'scientists'], ['economists', 'economists'], ['analysts', 'analysts'],
    ['studies show', 'studies show'], ['studies have shown', 'studies have shown'],
    ['research shows', 'research shows'], ['the research', 'the research'],
    ['the evidence', 'the evidence'], ['the science', 'the science'],
    ['it is proven', 'it is proven'], ['it has been proven', 'it has been proven'],
    ['scientifically proven', 'scientifically proven'], ['proven that', 'proven that'],
    ['everyone knows', 'everyone knows'], ['we all know', 'we all know'],
    ['no one disputes', 'no one disputes'], ['nobody denies', 'nobody denies'],
    ['the consensus', 'the consensus'], ['there is consensus', 'there is consensus'],
    ['the data shows', 'the data shows'], ['the figures show', 'the figures show'],
    ['according to experts', 'according to experts'], ['it is well known', 'it is well known'],
    ['you know that', 'you know that'], ['as you know', 'as you know'], ['we know that', 'we know that'],
  ]),

  ...lista('pt', [
    ['os especialistas', 'os especialistas'], ['os cientistas', 'os cientistas'],
    ['estudos mostram', 'estudos mostram'], ['esta provado', 'está provado'],
    ['a ciencia', 'a ciência'], ['todo mundo sabe', 'todo mundo sabe'],
  ]),

  ...lista('fr', [
    ['les experts', 'les experts'], ['les scientifiques', 'les scientifiques'],
    ['les etudes montrent', 'les études montrent'], ['il est prouve', 'il est prouvé'],
    ['la science', 'la science'], ['tout le monde sait', 'tout le monde sait'],
  ]),
];

export const GATE_AUTORIDAD = compilarGate(ENTRADAS);

export function marcadoresDeAutoridad(texto: string): string[] {
  return GATE_AUTORIDAD.detectar(texto);
}
