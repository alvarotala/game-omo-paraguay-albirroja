@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

rem Configuracion usada por la tarea programada de Windows.
rem Editar estos valores si la maquina final usa otras teclas o puerto.
if not defined STARTUP_DELAY_SECONDS set "STARTUP_DELAY_SECONDS=10"
if not defined HTTP_PORT set "HTTP_PORT=8000"
if not defined LEFT_BUTTON_KEY set "LEFT_BUTTON_KEY=z"
if not defined RIGHT_BUTTON_KEY set "RIGHT_BUTTON_KEY=x"
if not defined EFFECTS_SCALE set "EFFECTS_SCALE=1.2"
if not defined KIOSK set "KIOSK=1"
if not defined START_ARDUINO_BRIDGE set "START_ARDUINO_BRIDGE=1"
if not defined ARDUINO_SERIAL_BAUD set "ARDUINO_SERIAL_BAUD=115200"

if not "%STARTUP_DELAY_SECONDS%"=="0" (
  timeout /t %STARTUP_DELAY_SECONDS% /nobreak >nul
)

call "%SCRIPT_DIR%start-windows.bat"
