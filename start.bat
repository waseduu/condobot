@echo off
title CondoBot
echo ============================================
echo  CondoBot - Associação de Moradores
echo ============================================
echo.
echo Instalando dependencias...
cd /d "%~dp0"
call npm install --production 2>nul
echo.
echo Iniciando servidor...
echo Acesse: http://localhost:3000
echo.
start http://localhost:3000
node server.js
pause
