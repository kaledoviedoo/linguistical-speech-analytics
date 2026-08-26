@echo off
setlocal
cd /d "%~dp0"
call npm.cmd run verificar-entorno
exit /b %errorlevel%
