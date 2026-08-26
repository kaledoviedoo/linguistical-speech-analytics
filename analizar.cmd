@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" goto uso
call npm.cmd run analizar -- %*
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
