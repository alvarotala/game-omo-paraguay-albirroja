@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%uninstall-windows-autostart.ps1" %*

if errorlevel 1 (
  echo.
  echo No se pudo eliminar el arranque automatico. Revisa el mensaje anterior.
  pause
)
