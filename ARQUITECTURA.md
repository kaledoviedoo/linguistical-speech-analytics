# Arquitectura

Decisiones de diseño del auditor, y —tan importante como eso— las que se decidieron **no** tomar.

---

## El problema que había

El proyecto se llama «auditor de estructura argumental», pero solo sabía auditar **una** estructura.
Los cinco campos del análisis de framing causal (`tiene_lenguaje_causal_fuerte`,
`score_framing_causal`, …) estaban escritos a mano en seis módulos de producción:

```
src/tipos.ts                 el tipo EvaluacionLLM
src/motor/esquema.ts         el validador, campo por campo
src/motor/prompt.ts          el prompt del sistema
src/pipeline.ts              leía score_framing_causal para el resumen
src/reporte/generar.ts       mapeaba los tres booleanos a columnas
src/analisis/recall-prefiltro.ts   leía el score
```

Agregar una segunda pregunta —apelación a autoridad, generalización desde una anécdota, falso
dilema— significaba tocar los seis y arriesgarse a romper el que ya funciona. Y el prefiltro léxico,
que solo busca conectores causales, estaba cableado directo en la segmentación.

Además, `motor/analizar.ts` importaba el cliente HTTP de Ollama. Consecuencia concreta: para testear
el bucle de evaluación había que levantar un servidor falso en el puerto 11434. Un test de lógica no
debería necesitar un socket.

---

## Los dos cambios

### 1. El criterio de auditoría como unidad

Un **criterio** junta en un solo lugar todo lo específico de una pregunta: el prompt, el esquema de
salida, la validación, el gate léxico del prefiltro y cómo se muestra el resultado.

```
src/criterios/
  tipos.ts                    la interfaz Criterio<T> y EvaluacionAfirmacion
  registro.ts                 qué criterios existen
  framing-causal/
    index.ts                  el criterio (implementa Criterio)
    prompt.ts                 el prompt del sistema con las 5 hipótesis
    esquema.ts                el validador y los tipos propios
```

**El contrato universal es corto a propósito.** El pipeline solo necesita tres cosas de cualquier
criterio: un **score** entre 0 y 1, una **justificación** obligatoria, y unos **marcadores** para
mostrar. Todo lo demás es privado del criterio.

```ts
interface EvaluacionAfirmacion {
  criterio: string;              // qué criterio produjo esto
  score: number;
  justificacion: string;
  marcadores: { etiqueta: string; tono: 'bueno' | 'malo' | 'neutro' }[];
  campos: Record<string, unknown>;   // la respuesta cruda del modelo, sin interpretar
}
```

`campos` conserva la respuesta tal cual la devolvió el modelo, así `resultados.json` sigue siendo
auditable aunque el reporte solo lea las tres primeras claves.

**El `tono` es la pieza que desacopla el reporte.** El reporte ya no sabe qué significa
«contrafactual»: recibe una etiqueta y un tono, y pinta un chip. `tono` no es un juicio moral — dice
si ese rasgo **suma o resta defensa** a la afirmación. Tener lenguaje causal fuerte resta; tener
comparación suma.

Medición antes y después:

| | Antes | Ahora |
|---|---|---|
| Módulos de `src/` que conocen los campos causales | 6 | 3, y los tres viven dentro de `criterios/framing-causal/` |
| Archivos a tocar para agregar un criterio | 6 + el reporte + el arnés de tests | 1 carpeta + 1 línea en el registro + su conjunto de control |

### 2. El motor de inferencia como puerto

```ts
interface MotorInferencia {
  readonly descripcion: string;
  generar(sistema: string, prompt: string): Promise<RespuestaInferencia>;
}
```

`motorOllama(url, modelo)` es una implementación. `motorDeGuion([...])` es otra, para tests: devuelve
respuestas de un guion, en orden, y registra qué se le pidió.

El pago fue inmediato. El bucle de evaluación ahora se testea **sin ningún proceso externo**: los
reintentos ante JSON inválido, la recuperación en el segundo intento, un fallo de transporte que no
tumba la corrida, y el orden preservado con concurrencia 4. Diez tests que antes habrían necesitado un
servidor HTTP falso.

`pipeline.ts` y `cli.ts` siguen importando el cliente de Ollama, pero solo para **diagnóstico**
(`/api/tags`, `/api/ps`, la versión). Eso es correcto: diagnosticar el backend es específico del
backend. Lo que ya no ocurre es que el motor de evaluación lo conozca.

---

## Qué reveló el segundo criterio

Una abstracción con una sola implementación es una hipótesis, no un diseño. Construir
**apelación a autoridad** —una pregunta con otros campos, otro enum y otro rastro léxico— puso a
prueba el contrato. Aguantó, pero dejó cuatro cosas a la vista que solo se ven con dos:

**1. Los reportes se pisaban entre sí.** El hash dependía solo de la entrada, así que analizar el
mismo discurso con dos criterios sobrescribía el reporte anterior. Ahora la transcripción se comparte
(es independiente del criterio, y eso es una ventaja: cambiar de criterio no obliga a volver a
transcribir) pero las afirmaciones, los resultados, la caché y el reporte llevan el id del criterio:

```
data/<hash>/transcripcion.json                 compartida
data/<hash>/afirmaciones-<criterio>.json       el prefiltro difiere
data/<hash>/resultados-<criterio>.json
data/<hash>/cache-<criterio>.json
reportes/<hash>-<criterio>.html
```

**2. La mitad del validador no era causal.** Desenvolver un JSON de entre prosa, aceptar `"si"` como
booleano, reescalar un score que vino en 0-100: eso le pasa a cualquier criterio con un modelo chico.
Se movió a `criterios/validacion.ts`. Lo que quedó en cada criterio son sus claves, sus enums y sus
coherencias propias.

**3. La plantilla del reporte todavía describía un criterio concreto.** El disclaimer decía «una
relación causal fuerte sin comparación, contrafactual ni ventana temporal», y un KPI decía «prefiltro
causal». Con el criterio de autoridad eso quedaba directamente mal. Ahora el criterio aporta su
`descripcion` y su `alcance`, y la plantilla los muestra sin saber qué dicen. Hay un test que verifica
que el HTML generado no contenga ningún texto específico de un criterio.

**4. El arnés de medición era el último reducto causal.** `eval_prompt.ts` conocía los cinco campos
por su nombre, así que un criterio nuevo era inmedible. Ahora cada caso de control declara qué espera
por clave, y el arnés compara clave por clave: los booleanos van a una matriz binaria, los enums a una
de N valores. No hizo falta que el criterio describa sus campos —los declara el conjunto de control,
que es donde vive el juicio humano.

Lo que **no** hizo falta tocar para que el criterio nuevo funcione de punta a punta: el pipeline, la
caché, la concurrencia, los reintentos, la segmentación, el medidor de recall y el CSS del reporte.

---

## Cómo se agrega un criterio nuevo

1. Crear `src/criterios/<id>/` con `prompt.ts`, `esquema.ts`, `marcadores.ts` e `index.ts`.
2. Implementar `Criterio<T>`: prompt, validación, `score()`, `justificacion()`,
   `marcadoresLexicos()` y `marcadoresMostrables()`.
3. Agregarlo al objeto de `registro.ts`.
4. Escribir su conjunto de control en `tests/` y registrarlo en `tests/casos-index.ts`.

Nada más. El pipeline, la caché, la concurrencia, el prefiltro, el reporte y el medidor de recall
funcionan sin cambios. Se selecciona con `--criterio <id>`.

El paso 4 no es opcional en la práctica: sin conjunto de control el criterio no se puede medir, y
`npm run test:prompt -- --criterio <id>` falla con un mensaje que lo dice en vez de fingir que midió
algo.

El gate léxico merece atención: cada criterio deja su propio rastro. El causal deja «provocó», «por
culpa de»; uno de apelación a autoridad dejaría «según los expertos», «está demostrado que». Sin un
gate propio, un criterio nuevo mandaría el discurso entero al modelo y el análisis pasaría de 15
minutos a más de una hora.

---

## Decisiones que NO se tomaron

Cada una tiene un motivo, no es una lista de pendientes.

**Un cargador dinámico de criterios que escanee carpetas.** Con dos o tres criterios, un `import`
explícito es más claro, más rápido y deja que TypeScript verifique todo. El registro es un objeto
literal. Si algún día hay diez, se cambia.

**Un bus de eventos para el pipeline.** Hoy `pipeline.ts` llama a `log.paso(...)` directamente, lo
que mezcla orquestación con presentación. Es un defecto real, pero solo molesta cuando el pipeline se
usa desde un contexto que no es el CLI, y eso todavía no pasa. En 3.900 líneas, la indirección
costaría más de lo que devuelve.

**Partir `tipos.ts`.** Mezcla tipos de dominio con tipos de configuración. A 133 líneas eso todavía se
lee de un vistazo.

**Sacar los conectores del prefiltro a un archivo de datos.** Agregar un idioma hoy es editar un array
literal en TypeScript. Un JSON externo daría lo mismo y agregaría un paso de carga.

**Reescribir el reporte para que soporte varios criterios a la vez.** Un reporte muestra un criterio.
Combinar dos en la misma tabla es una decisión de producto que todavía no se tomó, y adelantarla sería
diseñar para un requisito imaginario.

---

## Lo que sigue siendo cierto del diseño original

- **Sin servidor, sin nube, sin claves de API.** El «deploy» es clonar y `npm install`.
- **Cada etapa persiste su salida** en `./data/<hash>/`, y la siguiente corrida la reutiliza.
- **La caché de evaluaciones se invalida sola** cuando cambia el modelo o el prompt del criterio: la
  clave es `sha1(modelo + hashPrompt + texto)`.
- **El prefiltro es lo que hace viable correr esto en CPU.** Descarta el 60-80% del texto sin gastar
  un token. Cuánto se pierde a cambio se mide con `npm run medir`.
- **El sistema audita la estructura del argumento, no verifica el hecho.** Ese límite está en el
  contrato de cada criterio (`alcance`) y visible en cada reporte.
