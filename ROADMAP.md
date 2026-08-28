# Roadmap

Estado y próximos pasos del auditor de framing causal. Cada fase tiene un **criterio de aceptación**
concreto: algo que se pueda medir, no una sensación de que "ya está mejor".

---

## Estado actual — funcionando y verificado

| Componente | Estado | Cómo se verificó |
|---|---|---|
| Parseo `.srt` / `.vtt` / `.txt` | ✅ | 117 tests offline |
| Segmentación en afirmaciones con timestamp | ✅ | timestamps monótonos, cues cortados se reúnen |
| Detección de idioma por segmento | ✅ | español e inglés en los fixtures |
| Prefiltro causal (263 conectores, 6 idiomas) | ✅ | participios, tildes, control negativo |
| Motor Ollama + esquema JSON estricto | ✅ | 4/4 al primer intento en material real |
| Validador y reparación de JSON | ✅ | markdown, enums, escala 0-100, incoherencias |
| Caché de evaluaciones | ✅ | invalidación por modelo y por prompt |
| Reporte HTML autocontenido | ✅ | render headless, filtros, escapado de XSS |
| Métricas por campo del motor | ✅ | 117 tests offline |
| Criterio como unidad extensible | ✅ | dos criterios corriendo sobre el mismo pipeline |
| Motor de inferencia como puerto | ✅ | el bucle se testea sin servidor HTTP |
| Criterio `apelacion-autoridad` | ✅ | 12 casos de control, reporte verificado |
| Medición del recall del prefiltro | ✅ herramienta lista | falta correrla sobre material real |
| Ingesta de links con yt-dlp (subtítulos) | ✅ | discurso real de YouTube analizado de punta a punta |
| Selección de pista en el idioma original | ✅ | 6 tests; nunca baja una traducción automática |
| Transcripción Whisper local | ⚠️ binarios instalados, **sin ejecutar todavía** | pendiente Fase A, ruta 2 y 3 |

**Rendimiento medido en la máquina de referencia (sin GPU compatible):** ~10 tok/s, ~11 s por
afirmación, ~100 tokens por respuesta. Un discurso de 40 min ronda los 18 minutos de análisis.

---

## Fase A — Desbloquear video

Las cinco filas de `verificar.cmd` están en OK y la ruta de subtítulos corrió sobre material real.

| Ruta | Estado | Evidencia |
|---|---|---|
| Link con `--preferir-subtitulos` | ✅ | 916 cues → 376 afirmaciones → 25 evaluadas → reporte |
| Audio local corto → Whisper | ⬜ | falta |
| Link sin subtítulos → audio → Whisper | ⬜ | falta; necesitaba la nightly de yt-dlp por el 403 |

La primera corrida real dejó tres cosas registradas:

- **El prefiltro es lo que hace viable esto.** 376 afirmaciones en un discurso de ~50 minutos; a
  11,6 s por evaluación, mandarlas todas serían 73 minutos. Cuánto se pierde a cambio es la Fase B.
- **yt-dlp estable no alcanza para YouTube.** El descifrado de firmas se rompe seguido y el arreglo
  sale en la nightly (`yt-dlp --update-to nightly`). Documentado en el README.
- **Pedir un idioma no es pedir un subtítulo.** Ver [Arquitectura](ARQUITECTURA.md#qué-reveló-el-primer-link-real).

**Criterio de aceptación:** las tres rutas ejecutadas. Falta Whisper.

---

## Fase B — Saber cuánto se pierde el prefiltro — **HECHO**

Medido sobre un discurso real de ~50 minutos (916 cues → 376 afirmaciones), con el prefiltro
desactivado y las 376 evaluadas por el modelo:

```
Con algun conector causal      30   (8% del texto)
Sin ningun conector           346
Superan el umbral 0.70          6
  capturadas                    3
  perdidas                      3
Recall del prefiltro         50.0%
Ahorro de computo              92%
```

**El 50% no es el número real, y esa es la lección principal de la fase.** Las tres perdidas hay
que adjudicarlas a mano:

| afirmación | ¿tiene lenguaje causal? | veredicto |
|---|---|---|
| «…targeting that **drove** innovation overseas…» | sí | hueco real del gate |
| «…this executive order, which came out **ordering** the agencies…» | no | falso positivo del modelo |
| «But the blockade has been 100 percent successful.» | no | falso positivo del modelo |

Solo una era un conector faltante. Recall adjudicado: **3 de 4 = 75%**, y con `drove` agregado
pasa a 4/4 sobre este material.

Lo que esto revela es que **el prefiltro no es solo un ahorro de cómputo: también es un filtro de
precisión**. Al apagarlo, el modelo ve 346 oraciones que nunca vería y en dos de ellas inventa
causalidad donde no hay ninguna. Contarlas como «pérdidas del prefiltro» invierte la
responsabilidad. El veredicto de `medir.cmd` ahora lo dice y pide adjudicación manual en vez de
mandar a agregar conectores a ciegas.

Las tres afirmaciones quedaron como tests fijos: la primera verifica que el gate ahora la captura,
las otras dos son el mejor control negativo del repo —texto real donde el prefiltro acierta al no
gastar un token—.

**Pendiente:** el delta ASR vs subtítulos publicados, sobre el mismo discurso. Ya está todo listo
para medirlo: `--subtitulos-asr` fuerza la pista automática del mismo video, así que la única
variable que cambia es la fuente del texto (no el idioma, ni el orador, ni la duración).

Antes de poder medirlo hubo que arreglar dos bugs que hacían inválida cualquier corrida sobre ASR
—los subtítulos «rolling» y la caché de transcripción sin versión de parser—. Están en
[Arquitectura](ARQUITECTURA.md#y-lo-que-reveló-medir-la-asr). Estado actual del mismo discurso por
las dos vías:

| | cues | palabras | afirmaciones |
|---|---|---|---|
| subtítulos publicados | 916 | 7092 | 376 |
| ASR (`--subtitulos-asr`) | 1231 | 7297 | 498 |

Las palabras coinciden dentro del 3%, así que el texto ya no está duplicado. La diferencia en
afirmaciones es la regla de corte: con puntuación se corta por oraciones (máx. 420 caracteres), sin
ella por pausas del hablante (máx. 240).

```powershell
.\medir.cmd "<link>" --subtitulos-asr
```

### El delta, medido

| | cues | palabras | afirmaciones | con conector | sobre umbral | capturadas | perdidas |
|---|---|---|---|---|---|---|---|
| publicados | 916 | 7092 | 376 | 30 (8%) | 6 | 3 | 3 |
| ASR | 1231 | 7297 | 498 | 29 (6%) | 7 | 3 | 4 |

**El gate dispara 30 veces en el texto publicado y 29 en la ASR, sobre prácticamente las mismas
palabras.** Ese es el número que responde la pregunta: la ASR no está destruyendo los conectores
causales. Si los transcribiera mal, el conteo de la derecha caería, y no cae.

Adjudicando las 7 perdidas de las dos corridas:

| afirmación | corrida | veredicto |
|---|---|---|
| «…targeting that **drove** innovation overseas…» | publicados | hueco del gate — corregido |
| «**And so** it for 250 years has been subject to…» | ASR | hueco del gate — corregido |
| «…this executive order, which came out **ordering** the agencies…» | ambas | falso positivo del modelo |
| «But the blockade has been 100% successful.» | ambas | falso positivo del modelo |
| «Under the Biden administration, the spirit of innovation… was under attack» | ASR | causalidad implícita |

Tres cosas salen de acá:

1. **Ningún conector se perdió por culpa de la ASR.** Los dos huecos reales (`drove`, `and so`)
   estaban igual de ausentes en el texto publicado; la ASR solo los expuso en otra frase. La
   tolerancia fonética en el prefiltro **no tiene evidencia que la justifique** y queda descartada
   hasta que aparezca un caso medido.
2. **Dos falsos positivos del modelo son estables**, aparecen en las dos corridas con el mismo
   score. No son ruido: son un límite del modelo de 3B, y el prefiltro los está tapando gratis.
3. **La causalidad implícita es el límite estructural del enfoque léxico.** «Bajo la administración
   X, Y fue atacado» atribuye causa sin usar una sola palabra causal. No hay conector que agregar:
   el prefiltro no puede capturarla por construcción, y `--sin-prefiltro` es la única vía.

**Criterio de aceptación: cumplido.** Falta repetir todo sobre un discurso en español, para no
generalizar desde un solo caso, y con la corrida en español ya arreglada por el desolapado.

---

## Fase B2 — Medir el prefiltro del criterio nuevo

Mismo procedimiento, con `--criterio apelacion-autoridad`. El gate de autoridad se escribió más
selectivo que el causal a propósito y esa decisión hay que verificarla igual.

```powershell
.\medir.cmd discurso.srt --criterio apelacion-autoridad
```

**Criterio de aceptación:** un recall adjudicado, con la misma tabla caso por caso.

---

## Fase C — Elegir el modelo con datos, no por intuición

**Preparada, pendiente de correrse en otra máquina.** La de referencia no tiene VRAM suficiente
(`ollama ps` da `100% CPU` incluso con el modelo de 1.5b, que pesa 1,1 GB contra ~1 GB disponibles),
así que las tres pasadas del conjunto de control tardarían más de lo razonable acá.

Es un solo comando, pensado para que quien lo corra no tenga que conocer el arnés por dentro:

```bash
ollama pull qwen2.5:1.5b
ollama pull llama3.2:3b
npm run comparar
```

Corre el conjunto de control completo contra los tres modelos, deja el JSON crudo de cada uno en
`medidas-<modelo>-<criterio>.json` y arma la tabla comparativa. Verifica primero que los modelos
estén descargados y dice cuáles faltan.

Los dos primeros renglones son **bloqueantes**: un modelo que no respeta el esquema o que no es
reproducible a temperatura 0 queda descalificado, por rápido que sea. Entre los que pasan, el script
separa "más exacto" de "más rápido" y cuantifica el intercambio en puntos de exactitud y en
milisegundos por afirmación, en vez de declarar un ganador solo.

Punto de partida medido en la máquina de referencia (CPU, sin GPU):

| modelo | tok/s | ms por afirmación | notas |
|---|---|---|---|
| qwen2.5:3b | 10,3 | 2900 | el actual por defecto |
| qwen2.5:1.5b | 19,2 | 1550 | 1,9× más rápido, exactitud sin medir |

**Criterio de aceptación:** la tabla de tres filas en el README y un cambio de `MODELO_LLM` en
`src/config.ts` si alguno gana claramente sin perder cumplimiento del esquema.

---

## Fase D — Ampliar el conjunto de control

**Hecho en su parte estructural.** El conjunto pasó de 10 a 24 casos y ahora cubre los límites que
faltaban: causalidad negada (`c11`), contrafactual explícito (`c12` y `c18`), cadena causal de tres
eslabones (`c13`), correlación declarada como correlación (`c14`), los dos casos intermedios —causal con
ventana pero sin comparación (`c15`) y causal con comparación pero sin plazo (`c16`)—, ventana corta
*con* comparación (`c19`), y controles negativos en dos idiomas. Se agregaron francés y alemán.

Dos casos (`d01`, `d02`) están marcados como ambiguos a propósito: se ejecutan y se muestran, pero no
puntúan. Meter casos discutibles en el denominador solo ensucia el número.

El arnés además dejó de ser causal: cada caso declara qué espera por clave y la comparación es
genérica, así que el criterio de apelación a autoridad se mide con el mismo comando.

Lo que queda:

- Anotar afirmaciones **reales** (no sintéticas) y sumarlas a los dos conjuntos.
- Fijar un umbral mínimo de exactitud por campo que CI pueda verificar cuando haya un Ollama disponible.

**Criterio de aceptación:** un umbral por campo acordado y documentado, con la corrida que lo respalda.

---

## Fase E — Comparar discursos entre sí

Hoy cada reporte vive solo. El salto de utilidad real está en la comparación:

- Un índice `reportes/index.html` que liste todos los análisis con su score promedio y su fecha.
- Comparar al mismo orador en el tiempo, o a dos oradores sobre el mismo tema.
- Exportar el corpus agregado a CSV para analizarlo fuera.

Es donde la herramienta deja de responder "¿cómo argumentó en este discurso?" y empieza a responder
"¿cómo argumenta esta persona?".

**Criterio de aceptación:** un índice navegable generado desde `./data/` sin volver a llamar al modelo.

---

## Fase F — Publicar

`.gitignore`, `.gitattributes` y CI ya están. Ver [Publicar en GitHub](README.md#publicar-en-github).

**Criterio de aceptación:** CI en verde en Ubuntu y Windows, y un clon limpio que llegue a un reporte
siguiendo solo el README.

---

## Riesgos conocidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sin GPU, el análisis es lento | Un discurso largo lleva ~20 min | Caché, `--limite`, modelo de 1.5b, `--preferir-subtitulos` |
| El prefiltro pierde afirmaciones sin conector léxico | Falsos negativos silenciosos | Medido en Fase B: la causalidad implícita («bajo la administración X, Y fue atacado») no tiene rastro léxico y no se puede capturar con conectores. `--sin-prefiltro` es la única vía |
| Un modelo de 3B se equivoca en casos sutiles | Scores poco fiables individualmente | El reporte lo dice; Fase D lo cuantifica |
| Whisper transcribe mal audio con música o voces superpuestas | Afirmaciones mal cortadas | Usar subtítulos publicados cuando existan |
| YouTube endurece las verificaciones anti-bot | Links dejan de descargar | `--cookies <navegador>`; el `.srt` a mano siempre funciona |

---

## Fuera de alcance, de forma permanente

No son "todavía no": son decisiones de diseño que sostienen el resto del proyecto.

- **Fact-checking.** El sistema audita la estructura del argumento. Verificar los hechos es otro
  problema, con otros requisitos y otra responsabilidad.
- **Servidor persistente, base de datos o API en la nube.** Rompería la garantía de que el material
  nunca sale de la máquina.
- **Traducción automática.** El análisis es estructural y funciona en el idioma original.
