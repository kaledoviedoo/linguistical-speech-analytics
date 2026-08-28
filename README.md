# Auditor de framing causal

Analiza discursos y declaraciones políticas o económicas (español, inglés y otros idiomas) y detecta
afirmaciones que usan **lenguaje causal fuerte** — *"X causó Y"*, *"X provocó Y"* — **sin los marcadores
lingüísticos que hacen defendible una afirmación causal**: comparación, contrafactual o ventana temporal
razonable.

> **El sistema no verifica si el hecho es cierto. Audita la estructura del argumento, no el hecho en sí.**
> Un score alto significa que la afirmación está construida sin los elementos que permitirían evaluarla,
> no que sea falsa. Este aviso aparece también, de forma visible, en cada reporte generado.

Todo corre **en tu máquina**: transcripción local con Whisper (ONNX), inferencia local con
[Ollama](https://ollama.com), reporte HTML estático. Sin nube, sin APIs de pago, sin cuentas externas y
sin ningún servidor levantado en segundo plano.

---

## Requisitos

| Requisito | Necesario para | Nota |
|---|---|---|
| **Node.js 18.17+** | todo | `node -v` |
| **Ollama** corriendo en `127.0.0.1:11434` | todo | https://ollama.com/download |
| Modelo `qwen2.5:3b` | todo | `ollama pull qwen2.5:3b` (~2 GB) |
| **ffmpeg** | audio y video | no hace falta para `.srt` / `.vtt` / `.txt` |
| **yt-dlp** | links | no hace falta para archivos locales |

Pensado para GPUs de consumo de **8 GB de VRAM o menos**. Si Ollama no encuentra GPU compatible corre en
CPU y todo va unas 10 veces mas lento: medilo con `npm run benchmark`. Ver [Rendimiento](#rendimiento).

---

## Instalación y uso

### Windows (PowerShell)

PowerShell bloquea por defecto el script `npm.ps1`, así que el repo trae wrappers `.cmd` que lo evitan
por completo. **No hace falta cambiar ninguna política ni ser administrador.**

```powershell
cd C:\ruta\al\repo
.\instalar.cmd                                    # npm install + ollama pull qwen2.5:3b
.\verificar.cmd                                   # diagnóstico del entorno
.\analizar.cmd tests\fixtures\discurso-es.srt     # primer análisis
```

Antes hace falta tener **Node.js** (https://nodejs.org, versión LTS) y **Ollama**:

```powershell
winget install --id Ollama.Ollama -e
```

Después de instalar cualquiera de los dos, **cerrá y volvé a abrir la terminal** — si no, el PATH de la
sesión actual no los ve.

### macOS y Linux

```bash
git clone <repo>
cd <repo>
npm install

# Modelo ligero en Ollama (una sola vez)
ollama pull qwen2.5:3b

# Comprueba que todo esté en su sitio
npm run verificar-entorno

# Analizar
npm run analizar -- "https://www.youtube.com/watch?v=XXXXXXXXXXX"
npm run analizar -- ./discurso.mp3
npm run analizar -- ./transcripcion.srt
```

Un solo comando: analiza, escribe `./reportes/<hash>.html` y lo **abre en el navegador vía `file://`**.
No queda ningún proceso corriendo después.

### Los wrappers de Windows

| Archivo | Equivale a |
|---|---|
| `instalar.cmd` | `npm install` + `ollama pull qwen2.5:3b`, con chequeos previos |
| `verificar.cmd` | `npm run verificar-entorno` |
| `analizar.cmd <entrada>` | `npm run analizar -- <entrada>` |
| `probar.cmd` | `npm run test:pipeline` y luego `npm run test:prompt` |
| `benchmark.cmd` | `npm run benchmark` |
| `medir.cmd <archivo>` | `npm run medir -- <archivo>` |

Los `.cmd` existen porque PowerShell bloquea `npm.ps1`; en cualquier otro shell usá `npm run ...` directamente.

Aceptan las mismas opciones: `.\analizar.cmd discurso.mp3 --idioma es --umbral 0.6`

### Opciones

```
-m, --modelo <nombre>     Modelo de Ollama            (por defecto: qwen2.5:3b)
    --whisper <nombre>    Modelo Whisper ONNX         (por defecto: Xenova/whisper-base)
-u, --umbral <0-1>        Umbral inicial del reporte  (por defecto: 0.7)
    --idioma <codigo>     Fuerza el idioma (es, en, pt...) en vez de autodetectar
    --limite <n>          Evalúa solo las primeras n afirmaciones filtradas
    --reintentos <n>      Reintentos ante JSON inválido (por defecto: 2)
    --concurrencia <n>    Peticiones simultáneas a Ollama (por defecto: 1)
    --sin-cache           No reutiliza evaluaciones previas de afirmaciones idénticas
    --ollama <url>        URL de Ollama               (por defecto: http://127.0.0.1:11434)
    --sin-prefiltro       Manda TODAS las oraciones al modelo (más lento, más recall)
    --preferir-subtitulos Si el link ya tiene subtítulos, úsalos en vez de transcribir
    --subtitulos-asr      Fuerza la transcripción automática aunque haya publicados (para medir)
    --cookies <navegador> Cookies del navegador para YouTube (chrome, edge, firefox, brave)
    --criterio <id>       Criterio de auditoría: framing-causal | apelacion-autoridad
    --forzar              Ignora la caché de ./data y rehace todo
    --no-abrir            No abre el navegador al terminar
-v, --verboso             Log detallado
    --verificar-entorno   Diagnóstico de Ollama, modelos y binarios locales
    --benchmark           Mide tok/s reales y estima cuánto tardará un discurso
    --medir-prefiltro     Evalúa TODO el archivo y mide qué se pierde el prefiltro
-h, --ayuda               Ayuda
```

---

## Entradas soportadas

| Tipo | Extensiones / formato | Qué hace |
|---|---|---|
| Links | YouTube y URLs directas de audio/video | `yt-dlp` descarga el audio localmente → transcribe |
| Audio / video | `.mp3` `.wav` `.m4a` `.mp4` `.webm` `.ogg` `.flac` `.mkv` `.mov` | transcribe con Whisper local |
| Subtítulos | `.srt` `.vtt` | **se salta la transcripción**, usa los timestamps del archivo |
| Texto | `.txt` `.md` | si trae marcas `[00:01:23]` las usa; si no, estima tiempos y lo advierte en el reporte |

El idioma se detecta automáticamente y el reporte lo indica **por segmento**.

### Analizar videos: las tres rutas

Para links hacen falta dos binarios que no vienen con el proyecto:

```powershell
winget install --id yt-dlp.yt-dlp -e
winget install --id Gyan.FFmpeg -e
# cerrá y volvé a abrir la terminal para que aparezcan en el PATH
.\verificar.cmd
```

Con eso hay tres caminos, de más rápido a más lento:

**1. Link de YouTube que ya tiene subtítulos — segundos.**

```powershell
.\analizar.cmd "https://www.youtube.com/watch?v=XXXXXXXXXXX" --preferir-subtitulos
```

Descarga los subtítulos publicados (propios o automáticos) y **se salta Whisper por completo**.
En una máquina sin GPU esta es casi siempre la opción correcta. Si el video no tiene subtítulos,
cae solo al camino 2.

**2. Link sin subtítulos, o archivo de audio/video local — minutos.**

```powershell
.\analizar.cmd "https://www.youtube.com/watch?v=XXXXXXXXXXX"
.\analizar.cmd "C:\Users\tu-usuario\Videos\discurso.mp4"
.\analizar.cmd "D:\entrevistas\rueda-de-prensa.mp3" --idioma es
```

Transcribe con Whisper local. **En CPU esto tarda del orden de la duración del audio**: un video de
40 minutos puede llevar entre 20 y 80 minutos. El CLI te dice la duración detectada y una estimación
antes de empezar, y la barra muestra tiempo transcurrido y restante real.

Para probar el flujo sin esperar, recortá el audio primero:

```powershell
ffmpeg -i discurso.mp4 -t 300 -vn -ac 1 -ar 16000 muestra.wav
.\analizar.cmd muestra.wav
```

**3. Ya tenés la transcripción — instantáneo.**

```powershell
.\analizar.cmd "C:\ruta\transcripcion.srt"
```

Es también la salida de escape si Whisper te resulta muy lento: transcribí una vez con la herramienta
que prefieras, guardá el `.srt` y de ahí en adelante el análisis es inmediato.

#### Cuando YouTube pide iniciar sesión

Es cada vez más frecuente (`Sign in to confirm you're not a bot`). yt-dlp puede tomar las cookies del
navegador que ya usás:

```powershell
.\analizar.cmd "https://youtu.be/XXXX" --cookies chrome
```

Acepta `chrome`, `edge`, `firefox`, `brave`. Necesitás tener sesión iniciada en YouTube en ese navegador.
El CLI detecta este error concreto y te sugiere la opción en vez de escupir el volcado de yt-dlp.

#### Dónde queda cada cosa

El audio descargado, el WAV normalizado y la transcripción quedan en `./data/<hash>/`. Si volvés a
correr el mismo link, **no se vuelve a descargar ni a transcribir**: se reutiliza. `--forzar` rehace todo.

---

## Cómo funciona

```
entrada ──┬─ link ──> yt-dlp ──> audio local ──┐
          ├─ audio/video ────────────────────► │──> Whisper local (ONNX, Transformers.js)
          └─ .srt/.vtt/.txt ───────────────────┴──> parseo directo
                                                        │
                                        transcripcion.json (segmentos + timestamps)
                                                        │
                        segmentación en oraciones, preservando el timestamp de cada una
                                                        │
                        prefiltro heurístico: ¿hay algún conector causal? (6 idiomas)
                                                        │
                                  afirmaciones.json ────┴──> solo las que pasan
                                                        │
                     Ollama local  POST /api/generate  format:"json"  temperature:0
                                                        │
                                validación estricta del esquema + reintentos
                                                        │
                                              resultados.json
                                                        │
                                    reportes/<hash>.html (autocontenido) ──> file://
```

### El esquema que exige al modelo

Cada afirmación produce exactamente esto, y nada más:

```json
{
  "tiene_lenguaje_causal_fuerte": true,
  "tiene_contrafactual_o_comparacion": false,
  "ventana_temporal_mencionada": "ninguna | corta | razonable",
  "score_framing_causal": 0.82,
  "justificacion": "Afirma causalidad directa sin comparar con períodos previos ni incluir mecanismos contrafactuales."
}
```

La **justificación es obligatoria**: si falta o es demasiado corta, la respuesta se descarta y se reintenta.
El validador (`src/motor/esquema.ts`) además extrae el JSON aunque venga envuelto en prosa o en un bloque
markdown, normaliza variantes del enum (`"corta (días/semanas)"` → `"corta"`), reescala scores que vengan
en 0–100 y corrige incoherencias (sin lenguaje causal fuerte, el score no puede ser alto). Cada corrección
queda registrada y se muestra en el reporte.

### Los 5 criterios del prompt

El prompt del sistema (`src/motor/prompt.ts`) incorpora las cinco hipótesis de la investigación:

1. **Causalidad sin contraste** — se afirma A→B sin comparar contra nada. Es el patrón más fuerte.
2. **Ventanas cortas sospechosas** — efecto estructural atribuido a algo que ocurrió hace días o semanas.
3. **Paradoja del matiz** — cuanto más limpia y contundente suena la frase, menos condiciones admite;
   el matiz explícito baja el score, la contundencia sin condiciones lo sube.
4. **Razonamiento motivado** — la causa señalada coincide con el adversario o el aliado político del
   hablante, y no se considera ninguna causa alternativa.
5. **Asimetría culpa/mérito** — lo malo se atribuye a otro y lo bueno a uno mismo, con el mismo tipo de
   evidencia (o sin ninguna) en ambos casos.

---

## Rendimiento

Antes de optimizar a ciegas, **medí**:

```bash
npm run benchmark          # Windows: .\benchmark.cmd
```

Reporta tokens/segundo reales, tokens por respuesta, **si el modelo está corriendo en GPU o en CPU**
(leído de `/api/ps`, no adivinado) y una estimación de cuánto tardaría un discurso de 40 minutos.

**La diferencia entre GPU y CPU es de un orden de magnitud.** Un `qwen2.5:3b` cuantizado ronda los
60–120 tok/s en una GPU dedicada y los 8–12 tok/s en CPU. Como cada afirmación genera unos 80–110 tokens,
eso se traduce en menos de 2 segundos por afirmación en GPU y unos 10 en CPU. Ollama usa CPU cuando no
encuentra una GPU compatible — gráficos integrados Intel y AMD sin ROCm entran en ese caso.

Si el benchmark dice CPU, en orden de impacto:

| Palanca | Ganancia típica | Costo |
|---|---|---|
| `--modelo qwen2.5:1.5b` | ~2× más rápido | algo menos de precisión en el juicio — validalo con `npm run test:prompt -- --modelo qwen2.5:1.5b` |
| Caché de evaluaciones (automática) | la segunda corrida es instantánea | ninguno |
| `--limite 50` | proporcional | analiza solo una parte |
| `--concurrencia 3` | 0–40% | necesita `OLLAMA_NUM_PARALLEL=4` en el entorno de Ollama |

### Optimizaciones incorporadas

- **Modelo LLM de 3B por defecto** (`qwen2.5:3b`, ~2 GB en VRAM con cuantización Q4). Alternativas:
  `--modelo llama3.2:3b`, `--modelo qwen2.5:1.5b`.
- **Opciones de inferencia fijas y estrictas** en cada llamada a `POST /api/generate`:
  `format: "json"`, `options: { temperature: 0.0, num_ctx: 2048, num_predict: 250 }`.
  Un contexto chico mantiene la huella de KV-cache mínima, que es lo que permite convivir con Whisper
  en 8 GB; `num_predict: 250` corta divagaciones porque la respuesta es un JSON corto.
- **`keep_alive: 15m`** en cada petición: cargar el modelo desde disco cuesta decenas de segundos y sin
  esto se paga en **cada** ejecución del CLI, no solo la primera.
- **El prompt exige justificaciones de una frase, máximo 20 palabras.** La justificación es cerca de la
  mitad de los tokens generados, y en CPU el tiempo es directamente proporcional a los tokens.
- **Caché de evaluaciones** en `./data/<hash>/cache-evaluaciones.json`. La clave combina el texto de la
  afirmación, el modelo y una huella del prompt del sistema: si cambiás cualquiera de los tres, las
  entradas afectadas se invalidan solas. Volver a correr para mirar otro umbral no cuesta cómputo.
- **Whisper cuantizado en ONNX** ejecutado dentro de Node, no en un servicio aparte.
- **Evaluación secuencial por defecto**: con poca VRAM, varias generaciones simultáneas obligan a Ollama
  a swapear KV-cache y la latencia se dispara. `--concurrencia` lo sube cuando el cuello de botella es otro.
- **Prefiltro heurístico** antes del LLM: una afirmación causal siempre deja rastro léxico, así que solo
  las oraciones con conector causal llegan al modelo. En un discurso típico eso descarta el 60–80% del
  texto sin gastar un token.
- **Caché por etapa** en `./data/<hash>/`: cambiar el umbral o el prompt no obliga a volver a transcribir.

---

## Salidas

```
data/<hash>/transcripcion.json              compartida entre criterios
data/<hash>/afirmaciones-<criterio>.json    oraciones, idioma y marcadores léxicos
data/<hash>/resultados-<criterio>.json      evaluación completa + resumen + rendimiento
data/<hash>/cache-<criterio>.json           evaluaciones ya pagadas
reportes/<hash>-<criterio>.html             reporte autocontenido (CSS y JS embebidos)
```

El `<hash>` es estable: para archivos es el hash del contenido (renombrarlos no invalida la caché); para
links, el de la URL normalizada.

### El reporte

Tabla interactiva con timestamp, idioma, afirmación, score, marcadores y justificación. Filtro dinámico
por umbral de score (por defecto **0.7**), búsqueda de texto, filtro por idioma, orden por score o por
tiempo, y descarga a CSV. Todo en JavaScript del lado del cliente dentro del mismo archivo: se puede
copiar, mandar por correo o abrir sin conexión.

---

## Tests

```bash
npm run test:pipeline   # 117 tests offline, no necesitan Ollama
npm run test:prompt     # 24 afirmaciones de control contra el modelo local
npm run typecheck       # TypeScript en modo estricto
```

`npm run test:prompt` es la **validación del motor**. Corre 24 afirmaciones de control
(`tests/afirmaciones-sinteticas.ts`) y reporta tres cosas distintas:

1. **Bloqueante:** que el JSON respete siempre el esquema estricto.
2. **Bloqueante:** que con `temperature: 0` la salida sea reproducible.
3. **Diagnóstico:** precisión y sensibilidad de **cada campo por separado**, más la matriz de confusión
   de la ventana temporal.

El punto 3 es el que cambia decisiones. Un agregado tipo «acierta 7 de 10» esconde el error que más
importa: un modelo puede clavar el score y equivocarse siempre en si hay comparación, y ese sesgo
invalida la tesis del proyecto sin que se note en el promedio.

```bash
npm run test:prompt -- --modelo qwen2.5:1.5b             # comparar modelos
npm run test:prompt -- --criterio apelacion-autoridad    # medir el otro criterio
npm run test:prompt -- --rapido                          # solo los 10 primeros
npm run test:prompt -- --guardar medidas.json            # para diferenciar entre corridas
```

El arnés no conoce los campos de ningún criterio: cada caso de control declara qué espera por clave, y
la comparación es clave por clave (booleanos a matriz binaria, enums a matriz de N valores).

Los casos marcados como difíciles (atribución a terceros, causalidad parcial) se ejecutan y se muestran
pero **no puntúan**: meter casos ambiguos en el denominador solo ensucia el número.

En CPU las 24 llamadas tardan unos 4 minutos; en GPU, segundos.

### Medir el prefiltro

```bash
npm run medir -- discurso.srt        # Windows: .\medir.cmd discurso.srt
```

Evalúa **todas** las oraciones con el modelo, ignorando el prefiltro, y después pregunta cuáles de las
que superaron el umbral no tenían ningún conector causal: esas son exactamente las que el prefiltro
habría descartado en silencio. Devuelve el recall, el ahorro de cómputo, y —lo más útil— **la lista de
las afirmaciones perdidas**, que se lee como una lista de conectores que le faltan a `prefiltro.ts`.

No hacen falta dos corridas: con el prefiltro desactivado cada afirmación sigue trayendo sus marcadores
heurísticos, así que una sola pasada alcanza. Y como la caché es por texto, lo que ya evaluaste antes no
se vuelve a pagar.

---

## Estructura

```
.github/workflows/ci.yml      typecheck + tests offline en Ubuntu y Windows
.gitattributes                CRLF para los .cmd, LF para el resto
ROADMAP.md                    plan por fases con criterios de aceptacion
ARQUITECTURA.md               decisiones de diseño, y las que no se tomaron
instalar.cmd                  wrappers de Windows: evitan el bloqueo de npm.ps1
verificar.cmd
analizar.cmd
probar.cmd
benchmark.cmd
src/
  cli.ts                      parseo de argumentos y arranque
  pipeline.ts                 orquestador de las 5 etapas
  config.ts                   toda la configuración, sobreescribible por entorno
  tipos.ts                    contratos compartidos
  ingesta/
    descargar.ts              yt-dlp (audio y, opcionalmente, subtítulos)
    audio.ts                  ffmpeg -> WAV mono 16 kHz -> Float32Array
    transcribir.ts            Whisper ONNX vía Transformers.js, con timestamps
    parsear-texto.ts          .srt, .vtt, texto plano y texto con marcas
  procesamiento/
    idioma.ts                 detección de idioma en dos niveles (franc)
    segmentar.ts              oraciones con timestamp interpolado
    prefiltro.ts              maquinaria genérica del gate léxico
  analisis/
    metricas.ts               precision, sensibilidad, matriz de confusion
    recall-prefiltro.ts       cuanto se pierde el filtro heuristico
  criterios/
    tipos.ts                  la interfaz Criterio y el contrato universal
    registro.ts               qué criterios existen
    validacion.ts             reparación de JSON compartida por todos los criterios
    framing-causal/
      index.ts                el criterio de framing causal
      prompt.ts               prompt del sistema con las 5 hipótesis
      esquema.ts              validación y tipos propios
      conectores.ts           263 conectores causales en 6 idiomas
    apelacion-autoridad/
      index.ts                el criterio de apelación a autoridad
      prompt.ts, esquema.ts, marcadores.ts
  motor/
    inferencia.ts             el motor como puerto; Ollama es una implementación
    ollama.ts                 cliente REST mínimo + métricas de /api/ps
    cache.ts                  evaluaciones ya pagadas, invalidadas por modelo y prompt
    analizar.ts               pool de evaluación con reintentos y caché
  reporte/
    generar.ts                ensamblado del HTML
    plantilla.ts              CSS y JS embebidos
tests/
  eval_pipeline.ts            117 tests offline
  eval_prompt.ts              validación del motor, campo por campo, para cualquier criterio
  casos-tipos.ts              forma genérica de un caso de control
  casos-index.ts              qué conjunto le toca a cada criterio
  afirmaciones-sinteticas.ts  24 casos de framing causal (22 puntúan, 2 ambiguos)
  afirmaciones-autoridad.ts   12 casos de apelación a autoridad (10 puntúan, 2 ambiguos)
  fixtures/                   discurso-es.srt, speech-en.vtt
```

---

## Privacidad

Nada del contenido analizado sale de tu máquina. El único tráfico de red posible es:

1. `npm install` (una vez).
2. `yt-dlp` descargando el link que **tú** le pasas.
3. La primera descarga del modelo Whisper ONNX desde HuggingFace, que queda cacheado en `.models/`.
   Con `AFC_SOLO_LOCAL=1` se prohíbe cualquier descarga de modelos y solo se usa lo ya cacheado.

Las llamadas al LLM van a `localhost`. `./data` y `./reportes` están en `.gitignore`.

---

## Problemas frecuentes

**`No se puede cargar el archivo ...\npm.ps1 porque la ejecución de scripts está deshabilitada`**

Es la política de ejecución de PowerShell, no un problema del proyecto. Tres salidas, de menos a más
invasiva:

1. Usar los wrappers: `.\instalar.cmd`, `.\analizar.cmd ...` (recomendado, no toca nada del sistema).
2. Llamar al `.cmd` de npm directamente: `npm.cmd install`, `npm.cmd run analizar -- archivo.srt`.
3. Habilitarlo solo para tu usuario, sin admin:
   `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

**`El término 'ollama' no se reconoce...`**

Ollama no está instalado, o lo instalaste con la terminal ya abierta. Instalá con
`winget install --id Ollama.Ollama -e`, cerrá la ventana, abrí una nueva y probá `ollama --version`.

**`Ollama esta instalado pero no responde en http://127.0.0.1:11434`**

El demonio no está levantado. En Windows suele arrancar solo (icono en la bandeja del sistema); si no,
`ollama serve` en una terminal aparte.

Si `ollama serve` responde `bind: Only one usage of each socket address...`, entonces sí está
levantado y el problema es de resolución de nombre o de qué proceso ocupa el puerto:

```powershell
Get-NetTCPConnection -LocalPort 11434 -State Listen |
  Select-Object LocalAddress, OwningProcess
curl.exe -s http://127.0.0.1:11434/api/version
curl.exe -s http://localhost:11434/api/version
```

Si `127.0.0.1` contesta y `localhost` no, es IPv6: `localhost` resolvió a `::1` y Ollama escucha en
IPv4. Por eso el valor por defecto de la herramienta es `127.0.0.1` y no `localhost`.

**`Ollama responde pero no tiene el modelo "qwen2.5:3b"`**

`ollama pull qwen2.5:3b`. Son ~2 GB y la descarga tarda unos minutos.

**El análisis dice "Ninguna afirmación superó el prefiltro"**

El material no tiene conectores causales léxicos, o el prefiltro no los cubre. Volvé a correr con
`--sin-prefiltro` para mandar todas las oraciones al modelo.

**Cada afirmación tarda ~10 segundos**

Ollama está usando la CPU. Corré `npm run benchmark` para confirmarlo y ver las alternativas.
No es un problema del pipeline: es la velocidad de generación del modelo en tu hardware.

**La primera corrida sobre audio tarda mucho**

Transformers.js descarga el modelo Whisper ONNX (~80 MB para `whisper-base`) la primera vez y lo cachea
en `.models/`. Además la transcripción en CPU es lenta: para un video de YouTube con subtítulos,
`--preferir-subtitulos` salta Whisper por completo.

---

## Limitaciones conocidas

- **El prefiltro tiene recall imperfecto.** Una afirmación causal sin conector léxico
  (*"subió el desempleo; ellos estaban en el gobierno"*) no llega al modelo. Usa `--sin-prefiltro`
  para auditar cuánto se pierde en tu material.
- **Un modelo de 3B se equivoca.** El score es una señal para revisión humana, nunca un veredicto.
  Con más VRAM, `--modelo qwen2.5:7b` mejora el juicio manteniendo el mismo esquema.
- **La detección de idioma por segmento es conservadora**: una frase corta hereda el idioma del
  documento en vez de arriesgar una etiqueta dudosa.
- **La transcripción hereda los errores de Whisper**, incluidos los timestamps aproximados en audio con
  música o varias voces superpuestas.
- **Fuera de alcance por diseño:** verificación de hechos, traducción, servidores persistentes, bases de
  datos externas y cualquier clave de API en la nube.

---

## Publicar en GitHub

El proyecto ya está listo para publicarse: `.gitignore` deja fuera `data/`, `reportes/`, `.models/` y
`node_modules/`; `.gitattributes` fuerza CRLF en los `.cmd` (si no, `cmd.exe` puede no leer las
etiquetas) y LF en todo lo demás; y `.github/workflows/ci.yml` corre typecheck y los tests offline en
Ubuntu y Windows con Node 20 y 22, sin necesitar Ollama.

```bash
git add .
git commit -m "Auditor de framing causal: pipeline local completo"
gh repo create auditor-framing-causal --public --source=. --push
# o, sin gh:
#   git remote add origin https://github.com/<usuario>/auditor-framing-causal.git
#   git push -u origin main
```

Verificá antes de publicar que no se cuele material analizado:

```bash
git status --short        # no deberían aparecer data/ ni reportes/
```

### Correr el proyecto en otra máquina

Todo lo que hace falta está en el repo. En la máquina nueva:

```bash
git clone https://github.com/<usuario>/auditor-framing-causal.git
cd auditor-framing-causal
npm install
```

Después, Ollama y el modelo (una sola vez):

```bash
# Windows:  winget install --id Ollama.Ollama -e
# macOS:    brew install ollama          |   Linux: curl -fsSL https://ollama.com/install.sh | sh
ollama serve                 # dejalo corriendo en otra terminal
ollama pull qwen2.5:3b
```

Y verificá antes de analizar nada:

```bash
npm run verificar-entorno
npm run test:pipeline        # 152 tests offline, no necesitan Ollama
```

`data/` y `reportes/` no viajan en el repo, así que la máquina nueva arranca sin caché: la primera
corrida de un link vuelve a descargar subtítulos y a evaluar. Si querés llevarte el trabajo ya hecho,
copiá esas dos carpetas a mano.

### Qué modelo usar (medido)

| modelo | esquema | causal | contraste | ventana | score | todos | ms/afirm |
|---|---|---|---|---|---|---|---|
| **qwen2.5:3b** (por defecto) | 24/24 | 91% | **91%** | 82% | **91%** | **73%** | 602 |
| qwen2.5:1.5b | 24/24 | 77% | 68% | 82% | 64% | 45% | **269** |
| llama3.2:3b | 24/24 | **95%** | 73% | 82% | 91% | 59% | 809 |

Medido con Ollama 0.32.15 sobre GPU, 24 casos de control. `qwen2.5:1.5b` es 2,2× más rápido pero
pierde 27 puntos, casi todos en `tiene_contrafactual_o_comparacion` — el campo que decide si una
afirmación causal es defendible. `llama3.2:3b` detecta mejor el lenguaje causal pero sobre-detecta
comparaciones, lo que baja de más el score de afirmaciones frágiles.

Estos números valen **para esa máquina**: el mismo modelo a temperatura 0 dio 86% en `ventana` en
una y 82% en otra, por diferencias de versión de Ollama y de backend. Reproducilos con
`npm run comparar` antes de cambiar el modelo por defecto.

### Comparar modelos (Fase C)

La comparación conviene correrla en una máquina con GPU, porque son tres pasadas completas del
conjunto de control. Es un solo comando:

```bash
ollama pull qwen2.5:1.5b
ollama pull llama3.2:3b
npm run comparar
```

Corre el conjunto contra los tres modelos, deja el JSON crudo de cada uno en `medidas-*.json` y
arma la tabla comparativa. Los dos primeros renglones son **bloqueantes**: un modelo que no respeta
el esquema o que no es reproducible a temperatura 0 no compite, por rápido que sea.

```bash
npm run comparar -- --modelos qwen2.5:3b,qwen2.5:1.5b   # elegir cuáles
npm run comparar -- --criterio apelacion-autoridad      # el otro criterio
```

Si un modelo gana en exactitud y en velocidad a la vez, cambialo por defecto en `src/config.ts`
(`MODELO_LLM`). Si hay que elegir, el script dice cuánto cuesta cada opción en puntos de exactitud
y en milisegundos por afirmación.

### Sobre "deployar"

**Este proyecto no se despliega, y es a propósito.** No hay servidor, ni base de datos, ni claves de
API: el "deploy" es que alguien clone el repo y corra `npm install`. Montar un servicio web que reciba
videos rompería las tres garantías centrales — que el material nunca sale de la máquina, que no hay
costos de infraestructura, y que el reporte es un archivo que se puede leer sin conexión.

Lo que sí tiene sentido publicar:

| En vez de | Hacé esto |
|---|---|
| Un servidor que analice videos | El repo en GitHub; cada persona corre el suyo |
| Una demo online | Subí un `reportes/<hash>.html` de ejemplo a GitHub Pages: es un archivo estático autocontenido |
| Binarios instalables | Un GitHub Release con el `.zip` del repo, si querés versionar |

Un reporte generado es un único HTML sin dependencias externas, así que publicarlo en Pages, mandarlo
por correo o abrirlo desde un pendrive funciona igual.

---

## Criterios de auditoría

El sistema audita **estructuras argumentales**, en plural. Hay dos criterios:

| id | Qué busca | Qué NO dice |
|---|---|---|
| `framing-causal` *(por defecto)* | Lenguaje causal fuerte sin comparación, contrafactual ni ventana temporal razonable | Si el hecho ocurrió |
| `apelacion-autoridad` | Afirmaciones apoyadas en expertos, estudios o el saber común sin fuente identificable ni evidencia concreta | Si la autoridad citada tiene razón |

```bash
npm run analizar -- discurso.srt --criterio apelacion-autoridad
npm run test:prompt -- --criterio apelacion-autoridad
```

Los dos comparten todo el pipeline pero tienen prompt, esquema, prefiltro léxico y conjunto de control
propios. El mismo discurso se puede analizar con los dos: la transcripción se reutiliza y cada uno
escribe su propio reporte (`reportes/<hash>-<criterio>.html`).

### Agregar uno nuevo

1. Crear `src/criterios/<id>/` con `prompt.ts`, `esquema.ts`, `marcadores.ts` e `index.ts`.
2. Implementar la interfaz `Criterio<T>`.
3. Registrarlo en `src/criterios/registro.ts`.
4. Escribir su conjunto de control en `tests/` y registrarlo en `tests/casos-index.ts`.

El pipeline, la caché, la concurrencia, el reporte y el medidor de recall funcionan sin cambios.
El detalle —y qué reveló construir el segundo— está en [ARQUITECTURA.md](ARQUITECTURA.md).

---

## Qué sigue

El plan de trabajo, con criterios de aceptación medibles por fase, está en [ROADMAP.md](ROADMAP.md).
Las decisiones de diseño —y las que deliberadamente no se tomaron— en
[ARQUITECTURA.md](ARQUITECTURA.md).

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
