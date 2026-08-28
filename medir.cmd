@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" goto uso

REM Se llama a node DIRECTO y no a npm.cmd. npm.cmd es a su vez un .bat que vuelve a
REM expandir %%* , y en esa segunda expansion se pierden las comillas del argumento.
REM Consecuencia real: una URL de YouTube con "&t=6s" se parte en dos, cmd.exe intenta
REM ejecutar "t=6s" como comando, y las opciones que venian despues del link (por
REM ejemplo --preferir-subtitulos) nunca llegan al programa.
node "node_modules\tsx\dist\cli.mjs" "src\cli.ts" "--medir-prefiltro" "--no-abrir" %*
exit /b %errorlevel%

:uso
echo.
echo Uso: medir.cmd ^<archivo^> [--umbral 0.7]
echo.
echo Evalua TODAS las oraciones del archivo (sin prefiltro) y reporta cuantas
echo afirmaciones de score alto se habria perdido el prefiltro heuristico.
echo.
echo Ejemplo:
echo   medir.cmd tests\fixtures\discurso-es.srt
echo.
echo Tarda bastante: es el archivo entero. Lo ya evaluado sale de la cache.
exit /b 2
