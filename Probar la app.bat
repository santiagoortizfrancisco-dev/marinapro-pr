@echo off
chcp 65001 >nul
title Bot de pruebas - MarinaPro PR
cd /d "%~dp0"
echo.
echo  ============================================================
echo   BOT DE PRUEBAS - MarinaPro PR
echo   Prueba la base de datos y las pantallas (como un iPhone).
echo   No toca los datos reales ni envia nada a nadie.
echo  ============================================================
echo.
if not exist node_modules (
  echo  Instalando lo necesario la primera vez...
  call npm install
  call npx playwright install webkit
)
call npm test
if errorlevel 1 (
  echo.
  echo  ************************************************************
  echo   ALGO FALLO. Arriba dice cual prueba.
  echo   Para ver el detalle con fotos:  npx playwright show-report
  echo   Mandale un screenshot de esta ventana a Claude.
  echo  ************************************************************
) else (
  echo.
  echo  ============================================================
  echo   TODO PASO. El app esta funcionando bien.
  echo  ============================================================
)
echo.
pause
