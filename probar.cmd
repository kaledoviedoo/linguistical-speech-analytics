@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Tests offline del pipeline (no necesitan Ollama) ===
echo.
call npm.cmd run test:pipeline
if errorlevel 1 goto fallo

echo.
echo === Validacion del prompt contra el modelo local ===
echo.
call npm.cmd run test:prompt
if errorlevel 1 goto fallo

exit /b 0

:fallo
echo.
echo [ERROR] Algun test fallo. Revisa el detalle de arriba.
exit /b 1
