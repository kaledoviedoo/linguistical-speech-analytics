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
| **Ollama** corriendo en `localhost:11434` | todo | https://ollama.com/download |
| Modelo `qwen2.5:3b` | todo | `ollama pull qwen2.5:3b` (~2 GB) |
| **ffmpeg** | audio y video | no hace falta para `.srt` / `.vtt` / `.txt` |
| **yt-dlp** | links | no hace falta para archivos locales |

Pensado para GPUs de consumo de **8 GB de VRAM o menos**. Ver [Optimizaciones](#optimizaciones-para-recursos-bajos).

---

## Instalación y uso

```bash
git clone <repo>
cd <repo>
npm install

# Modelo ligero en Ollama (una sola vez)
ollama pull qwen2.5:3b

# Comprueba que todo esté en su sitio (opcional pero recomendado)
npm run verificar-entorno

# Analizar
npm run analizar -- "https://www.youtube.com/watch?v=XXXXXXXXXXX"
npm run analizar -- ./discurso.mp3
npm run analizar -- ./transcripcion.srt
```

Un solo comando: analiza, escribe `./reportes/<hash>.html` y lo **abre en el navegador vía `file://`**.
No queda ningún proceso corriendo después.

### Opciones

```
-m, --modelo <nombre>     Modelo de Ollama            (por defecto: qwen2.5:3b)
    --whisper <nombre>    Modelo Whisper ONNX         (por defecto: Xenova/whisper-base)
-u, --umbral <0-1>        Umbral inicial del reporte  (por defecto: 0.7)
    --idioma <codigo>     Fuerza el idioma (es, en, pt...) en vez de autodetectar
    --limite <n>          Evalúa solo las primeras n afirmaciones filtradas
    --reintentos <n>      Reintentos ante JSON inválido (por defecto: 2)
    --ollama <url>        URL de Ollama               (por defecto: http://localhost:11434)
    --sin-prefiltro       Manda TODAS las oraciones al modelo (más lento, más recall)
    --preferir-subtitulos Si el link ya tiene subtítulos, úsalos en vez de transcribir
    --forzar              Ignora la caché de ./data y rehace todo
    --no-abrir            No abre el navegador al terminar
-v, --verboso             Log detallado
    --verificar-entorno   Diagnóstico de Ollama, modelos y binarios locales
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

## Optimizaciones para recursos bajos

- **Modelo LLM de 3B por defecto** (`qwen2.5:3b`, ~2 GB en VRAM con cuantización Q4). Alternativa:
  `--modelo llama3.2:3b`.
- **Opciones de inferencia fijas y estrictas** en cada llamada a `POST /api/generate`:
  `format: "json"`, `options: { temperature: 0.0, num_ctx: 2048, num_predict: 250 }`.
  Un contexto chico mantiene la huella de KV-cache mínima, que es lo que permite convivir con Whisper
  en 8 GB; `num_predict: 250` corta divagaciones porque la respuesta es un JSON corto.
- **Whisper cuantizado en ONNX** ejecutado dentro de Node, no en un servicio aparte.
- **Evaluación secuencial**, no en paralelo: con poca VRAM, varias generaciones simultáneas obligan a
  Ollama a swapear KV-cache y la latencia se dispara.
- **Prefiltro heurístico** antes del LLM: una afirmación causal siempre deja rastro léxico, así que solo
  las oraciones con conector causal llegan al modelo. En un discurso típico eso descarta el 60–80% del
  texto sin gastar un token.
- **Caché por etapa** en `./data/<hash>/`: cambiar el umbral o el prompt no obliga a volver a transcribir.

---

## Salidas

```
data/<hash>/transcripcion.json   segmentos con timestamps + idioma + motor usado
data/<hash>/afirmaciones.json    oraciones individuales, idioma y marcadores heurísticos
data/<hash>/resultados.json      evaluación completa + resumen
reportes/<hash>.html             reporte autocontenido (CSS y JS embebidos)
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
npm run test:pipeline   # offline, no necesita Ollama: parseo, segmentación, prefiltro, esquema, reporte
npm run test:prompt     # 10 afirmaciones sintéticas contra el modelo local
npm run typecheck       # TypeScript en modo estricto
```

`npm run test:prompt` es la **validación inicial**: comprueba que el modelo respeta siempre el esquema
JSON, que con `temperature: 0` la salida es reproducible, y —de forma informativa— cuánto coincide su
juicio con la expectativa humana en los 10 casos de control (`tests/afirmaciones-sinteticas.ts`).
Correlo antes de procesar un archivo entero: cuesta segundos y te dice si el modelo que elegiste sirve.

```bash
npm run test:prompt -- --modelo llama3.2:3b
```

---

## Estructura

```
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
    prefiltro.ts              conectores causales en 6 idiomas
  motor/
    prompt.ts                 prompt del sistema con las 5 hipótesis
    ollama.ts                 cliente REST mínimo
    esquema.ts                validación y reparación del JSON
    analizar.ts               bucle de evaluación con reintentos
  reporte/
    generar.ts                ensamblado del HTML
    plantilla.ts              CSS y JS embebidos
tests/
  eval_pipeline.ts            tests offline
  eval_prompt.ts              validación del prompt contra Ollama
  afirmaciones-sinteticas.ts  los 10 casos de control
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

## Licencia

MIT. Ver [LICENSE](LICENSE).
