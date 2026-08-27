@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" goto uso
call npm.cmd run medir -- %*
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
