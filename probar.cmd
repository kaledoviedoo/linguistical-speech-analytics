@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Tests offline del pipeline (no necesitan Ollama) ===
echo.
call npm.cmd run test:pipeline
if errorlevel 1 goto fallo

echo.
echo === Criterio 1 de 2: framing causal ===
echo.
call npm.cmd run test:prompt -- --criterio framing-causal
if errorlevel 1 goto fallo

echo.
echo === Criterio 2 de 2: apelacion a autoridad ===
echo.
call npm.cmd run test:prompt -- --criterio apelacion-autoridad
if errorlevel 1 goto fallo

echo.
echo Todo verde. Los dos criterios respetan el esquema y son reproducibles.
exit /b 0

:fallo
echo.
echo [ERROR] Algo fallo. Revisa el detalle de arriba.
exit /b 1
