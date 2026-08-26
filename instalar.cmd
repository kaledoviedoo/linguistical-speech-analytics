@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ==================================================
echo   Auditor de framing causal  -  instalacion
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto sin_node
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [OK] Node !NODEV!
echo.

echo Instalando dependencias...
echo Usamos npm.cmd en vez de npm: asi PowerShell no bloquea el script npm.ps1.
echo.
call npm.cmd install
if errorlevel 1 goto fallo_npm
echo.
echo [OK] Dependencias instaladas.
echo.

where ollama >nul 2>nul
if errorlevel 1 goto sin_ollama
echo [OK] Ollama encontrado. Descargando el modelo qwen2.5:3b si hace falta...
echo.
call ollama pull qwen2.5:3b
if errorlevel 1 goto fallo_pull
goto listo

:sin_node
echo [ERROR] No encuentro Node.js en el PATH.
echo         Instalalo desde https://nodejs.org  -  elegi la version LTS.
echo         Despues cerra esta ventana, abri una nueva y volve a correr instalar.cmd
exit /b 1

:fallo_npm
echo [ERROR] npm install fallo. Revisa el mensaje de arriba.
exit /b 1

:sin_ollama
echo [AVISO] Ollama no esta en el PATH.
echo         Instalalo con:   winget install --id Ollama.Ollama -e
echo         O descargalo de  https://ollama.com/download
echo.
echo         Despues cerra esta ventana, abri una nueva y corre:
echo             ollama pull qwen2.5:3b
echo.
echo Las dependencias de Node ya quedaron instaladas.
exit /b 0

:fallo_pull
echo [ERROR] "ollama pull qwen2.5:3b" fallo.
echo         Verifica que Ollama este corriendo: busca su icono en la bandeja del sistema,
echo         o arrancalo a mano con:  ollama serve
exit /b 1

:listo
echo.
echo ==================================================
echo   Todo listo.
echo ==================================================
echo.
echo   Verificar el entorno:   verificar.cmd
echo   Probar con el ejemplo:  analizar.cmd tests\fixtures\discurso-es.srt
echo.
exit /b 0
