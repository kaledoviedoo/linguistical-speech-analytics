@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" goto uso

REM Se llama a node DIRECTO y no a npm.cmd. npm.cmd es a su vez un .bat que vuelve a
REM expandir %%* , y en esa segunda expansion se pierden las comillas del argumento.
REM Consecuencia real: una URL de YouTube con "&t=6s" se parte en dos, cmd.exe intenta
REM ejecutar "t=6s" como comando, y las opciones que venian despues del link (por
REM ejemplo --preferir-subtitulos) nunca llegan al programa.
node "node_modules\tsx\dist\cli.mjs" "src\cli.ts" %*
exit /b %errorlevel%

:uso
echo.
echo Uso: analizar.cmd ^<link-o-ruta-de-archivo^> [opciones]
echo.
echo Ejemplos:
echo   analizar.cmd tests\fixtures\discurso-es.srt
echo   analizar.cmd C:\ruta\a\discurso.mp3 --idioma es
echo   analizar.cmd "https://www.youtube.com/watch?v=XXXXXXXXXXX"
echo.
echo Todas las opciones:  analizar.cmd --ayuda
exit /b 2
