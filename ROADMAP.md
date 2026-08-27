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
| Transcripción Whisper local | ⚠️ binarios ya instalados, **sin ejecutar todavía** | pendiente Fase A |
| Descarga de links con yt-dlp | ⚠️ binarios ya instalados, **sin ejecutar todavía** | pendiente Fase A |

**Rendimiento medido en la máquina de referencia (sin GPU compatible):** ~10 tok/s, ~11 s por
afirmación, ~100 tokens por respuesta. Un discurso de 40 min ronda los 18 minutos de análisis.

---

## Fase A — Desbloquear video

`yt-dlp` y `ffmpeg` ya están instalados. Falta ejecutar las tres rutas, en orden:

1. Un audio corto local (recortá 5 minutos con ffmpeg) → confirma que Whisper produce timestamps.
2. Un link de YouTube con `--preferir-subtitulos` → confirma yt-dlp sin pagar transcripción.
3. El mismo link sin esa opción → confirma la ruta completa link → audio → Whisper.

**Criterio de aceptación:** las cinco filas de `verificar.cmd` en OK y un reporte generado desde un link.

---

## Fase B — Saber cuánto se pierde el prefiltro

El prefiltro descarta entre el 60% y el 80% del texto sin gastar un token. Eso es lo que hace viable
correr esto en CPU, pero **nadie midió todavía qué se pierde**.

**La herramienta ya existe.** Una sola pasada alcanza: con el prefiltro desactivado cada afirmación
sigue trayendo sus marcadores heurísticos, así que basta preguntar cuáles de las que superaron el umbral
no tenían ningún conector.

```powershell
.\medir.cmd discurso.srt
```

Devuelve el recall, el ahorro de cómputo y la lista de las afirmaciones perdidas.

**Criterio de aceptación:** un número de recall sobre material real. Si se pierde menos del 5%, el
prefiltro se queda como está y el número queda documentado en el README. Si se pierde más, los conectores
que faltaban se agregan a `prefiltro.ts` y el caso entra al repo como test fijo.

---

## Fase C — Elegir el modelo con datos, no por intuición

Hay tres candidatos razonables y una sola forma honesta de decidir:

```powershell
npm.cmd run test:prompt -- --modelo qwen2.5:3b
npm.cmd run test:prompt -- --modelo qwen2.5:1.5b
npm.cmd run test:prompt -- --modelo llama3.2:3b
```

Cada corrida devuelve cumplimiento del esquema (bloqueante), determinismo (bloqueante), **precisión y
sensibilidad de cada campo por separado**, la matriz de confusión de la ventana temporal, y tok/s.
`--guardar medidas-<modelo>.json` deja el resultado en disco para poder compararlos.

**Criterio de aceptación:** una tabla de tres filas en el README y un cambio del modelo por defecto
si alguno gana claramente en velocidad sin perder cumplimiento del esquema.

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

## Fase B2 — Medir el prefiltro del criterio nuevo

El gate léxico de apelación a autoridad se escribió más selectivo que el causal a propósito: «el
informe» o «los datos» a secas aparecen todo el tiempo en discurso económico sin ser apelaciones a
autoridad. Esa decisión hay que verificarla igual que la otra.

Hay una limitación conocida que conviene medir: el prefiltro está afinado para el patrón **sospechoso**,
así que las afirmaciones bien fundadas («el informe del Banco Central de marzo, sobre una muestra de
1.200 empresas…») no llegan al modelo. Para el objetivo de la herramienta está bien —esas puntuarían
bajo de todos modos— pero significa que el reporte no muestra los buenos ejemplos.

```powershell
.\medir.cmd discurso.srt --criterio apelacion-autoridad
```

**Criterio de aceptación:** un número de recall para este criterio, con el mismo umbral del 5%.

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
| El prefiltro pierde afirmaciones sin conector léxico | Falsos negativos silenciosos | Fase B lo mide; `--sin-prefiltro` como escape |
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
