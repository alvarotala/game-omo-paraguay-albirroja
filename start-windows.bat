@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-windows.ps1" %*

if errorlevel 1 (
  echo.
  echo El launcher de Windows termino con error. Revisa el mensaje anterior.
  pause
)
