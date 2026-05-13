# PROTEGE TU CAMISETA - OMO Ultrapower Paraguay

Juego web portrait para activacion de marca OMO Ultrapower Paraguay. La experiencia corre en una TV 4K con Raspberry Pi 5 y Chromium en modo kiosk/fullscreen.

El jugador protege una camiseta de Paraguay de suciedad, pasto, barro y manchas usando dos botones fisicos tipo arcade: izquierda y derecha. Cada boton dispara jabon/rayos desde su lado. Limpiar suma porcentaje; si la suciedad toca la camiseta, resta. El resultado final va de 0% a 100%; con 75% o mas gana premio, por debajo de 75% queda sin premio.

## Estructura

- `index.html`: entrada del juego.
- `styles.css`: layout fullscreen/portrait.
- `game.js`: juego completo en canvas, scoring, audio, pantallas y cliente WebSocket.
- `assets/`: imagenes y audio.
- `assets/audio/README.md`: fuentes/licencias de audio.
- `gpio_ws_bridge.py`: bridge local GPIO -> WebSocket.
- `arduino/nano_button_serial/nano_button_serial.ino`: sketch para Arduino Nano clasico, envia botones por Serial.
- `arduino_serial_ws_bridge.py`: bridge Windows/macOS/Linux Serial Arduino -> WebSocket.
- `start.sh`: script de arranque para Raspberry OS.
- `start-windows.ps1`: launcher Windows para Chrome.
- `start-windows.bat`: wrapper para ejecutar el launcher Windows con doble click.
- `start-windows-autostart.bat`: wrapper usado por el arranque automatico de Windows.
- `install-windows-autostart.ps1` / `.bat`: instala la tarea programada de Windows.
- `uninstall-windows-autostart.ps1` / `.bat`: elimina la tarea programada de Windows.
- `kiosk_http_server.py`: servidor HTTP local para kiosk, con soporte Range para video y logs menos ruidosos.
- `progress.md`: historial tecnico de cambios.

## Requisitos en Raspberry OS

- Raspberry Pi 5 con Raspberry OS.
- Python 3.
- Chromium (`chromium-browser` o `chromium`).
- `gpiozero` para leer GPIO.
- `unclutter` para ocultar el cursor del mouse en kiosk.

En Raspberry OS normalmente `gpiozero` ya viene instalado. Si no esta:

```bash
sudo apt update
sudo apt install -y python3-gpiozero unclutter
```

## Arranque rapido

Desde la carpeta del proyecto:

```bash
./start.sh
```

Esto hace tres cosas:

1. Levanta el server web local en `http://127.0.0.1:8000/` usando `kiosk_http_server.py`, con soporte para video MP4 y requests parciales.
2. Levanta el bridge WebSocket en `ws://127.0.0.1:8765`.
3. Abre Chromium en kiosk/fullscreen apuntando al juego con el bridge conectado.

Chromium se abre con `--autoplay-policy=no-user-gesture-required` para que el audio funcione tambien cuando el input inicial viene desde los botones fisicos por WebSocket. Tambien se fuerza idioma `es-PY`, se desactiva la traduccion automatica y se evita el keyring del sistema para bloquear popups en modo kiosk. El cursor del mouse se oculta por CSS y, en Raspberry, `start.sh` intenta reforzarlo con `unclutter`.

## Arranque automatico con systemd

El repo incluye `game-omo-paraguay-albiroja.service` para levantar el juego automaticamente al iniciar la Raspberry. Esta configurado como servicio de usuario porque Chromium necesita correr dentro de la sesion grafica del usuario que esta logueado.

Supuestos del archivo incluido:

- Usuario de Raspberry: `admin`.
- Carpeta del proyecto: `/home/admin/game-omo-paraguay-albirroja`.
- Raspberry OS con autologin grafico habilitado para ese usuario.
- Performance del juego: `EFFECTS_SCALE=0.55`.

Si la carpeta final cambia, editar `WorkingDirectory` y `ExecStart` dentro del `.service` antes de instalarlo.

### Instalar el servicio

Desde la carpeta del proyecto en la Raspberry:

```bash
chmod +x start.sh gpio_ws_bridge.py kiosk_http_server.py test.py
mkdir -p ~/.config/systemd/user
cp game-omo-paraguay-albiroja.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable game-omo-paraguay-albiroja.service
systemctl --user start game-omo-paraguay-albiroja.service
```

Para que arranque al prender la Raspberry, habilitar autologin grafico desde `sudo raspi-config`:

```text
System Options -> Boot / Auto Login -> Desktop Autologin
```

No hace falta usar `loginctl enable-linger` para este kiosk. Chromium necesita una sesion grafica activa; con Desktop Autologin el servicio de usuario se levanta al entrar esa sesion.

Si se instala y se inicia en una sesion ya abierta, importar el entorno grafico antes de arrancar puede ayudar:

```bash
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS
systemctl --user restart game-omo-paraguay-albiroja.service
```

### Ver estado y logs

```bash
systemctl --user status game-omo-paraguay-albiroja.service
journalctl --user -u game-omo-paraguay-albiroja.service -f
```

### Reiniciar despues de cambios

```bash
systemctl --user restart game-omo-paraguay-albiroja.service
```

### Detener o deshabilitar

```bash
systemctl --user stop game-omo-paraguay-albiroja.service
systemctl --user disable game-omo-paraguay-albiroja.service
```

### Ajustar variables del kiosk

El `.service` deja `EFFECTS_SCALE=0.55`, que fue el valor que funciono fluido en el Pi 5. Para cambiar pines, puertos, debug o flags de Chromium, editar las lineas `Environment=` del servicio. Ejemplo:

```ini
Environment=DISPLAY=:0
Environment=XDG_RUNTIME_DIR=/run/user/%U
Environment=GPIO_LEFT_PIN=17
Environment=GPIO_RIGHT_PIN=27
Environment=EFFECTS_SCALE=0.55
Environment=CHROMIUM_EXTRA_FLAGS=--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist
```

Luego aplicar:

```bash
cp game-omo-paraguay-albiroja.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user restart game-omo-paraguay-albiroja.service
```

## GPIO

Defaults:

- Boton izquierdo: BCM `17`.
- Boton derecho: BCM `27`.
- Pulso esperado: HIGH al presionar.
- Pull interno: pull-down (`GPIO_PULL_UP=0`).
- Debounce: `0.16` segundos.

Conexion sugerida con defaults:

- Un terminal del boton a `3.3V`.
- El otro terminal al pin GPIO BCM correspondiente.
- Usar pull-down interno por software.
- No enviar 5V a los GPIO.

Para cambiar pines:

```bash
GPIO_LEFT_PIN=5 GPIO_RIGHT_PIN=6 ./start.sh
```

Si el cableado usa pull-up y el boton lleva a GND, activar:

```bash
GPIO_PULL_UP=1 ./start.sh
```

## Variables de configuracion

`start.sh` acepta estas variables de entorno:

```bash
HTTP_PORT=8000              # Puerto del servidor web
GPIO_WS_HOST=127.0.0.1      # Host del WebSocket
GPIO_WS_PORT=8765           # Puerto del WebSocket
GPIO_LEFT_PIN=17            # Pin BCM para izquierda
GPIO_RIGHT_PIN=27           # Pin BCM para derecha
GPIO_DEBOUNCE=0.16          # Antirrebote en segundos
GPIO_PULL_UP=0              # 0 pull-down, 1 pull-up
GPIO_STDIN_SIM=0            # 1 habilita simulacion por teclado en consola del bridge
GPIO_DEBUG=0                # 1 muestra logs detallados de cada GPIO/evento
CHROMIUM_BIN=chromium       # Override manual del binario de Chromium
CHROMIUM_USER_DATA_DIR=/tmp/omo-chromium-profile  # Perfil limpio para kiosk
CHROMIUM_EXTRA_FLAGS=""      # Flags extra para pruebas
EFFECTS_SCALE=0.7             # Escala visual de particulas/efectos para Raspberry
HIDE_MOUSE=1                 # 1 intenta ocultar cursor con unclutter
```

Ejemplo:

```bash
HTTP_PORT=8080 GPIO_WS_PORT=9876 GPIO_LEFT_PIN=23 GPIO_RIGHT_PIN=24 ./start.sh
```

Para bajar carga grafica en Raspberry Pi 5 sin cambiar codigo:

```bash
EFFECTS_SCALE=0.55 ./start.sh
```

Para probar flags GPU de Chromium sin editar el launcher:

```bash
CHROMIUM_EXTRA_FLAGS="--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist" ./start.sh
```

## Version Windows + Google Chrome

Esta variante esta pensada para correr el mismo juego en Windows 10/11 usando Google Chrome. No necesita Raspberry ni GPIO: usa teclado, click/touch o botones arcade USB que Windows detecte como teclas.

Requisitos:

- Windows 10/11.
- Google Chrome instalado.
- Python 3 instalado y disponible como `py`, `python` o en `PYTHON_BIN`.

Arranque rapido desde la carpeta del proyecto:

```bat
start-windows.bat
```

Tambien se puede ejecutar directamente desde PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
```

El launcher de Windows:

1. Levanta el servidor local en `http://127.0.0.1:8000/` usando `kiosk_http_server.py`.
2. Si `START_ARDUINO_BRIDGE=1`, levanta `arduino_serial_ws_bridge.py` y conecta el juego por WebSocket.
3. Abre Google Chrome en kiosk/fullscreen con un perfil limpio en `%TEMP%\omo-chrome-profile`.
4. Pasa al juego las teclas configuradas para boton izquierdo/derecho como fallback de teclado.
5. Agrega flags para autoplay de audio, idioma `es-PY` y traduccion deshabilitada.
6. Cierra los procesos locales automaticamente cuando se cierra Chrome.

En Windows no se ejecuta `gpio_ws_bridge.py`. Para Arduino Nano clasico se usa `arduino_serial_ws_bridge.py`, porque el Nano lee botones por Serial y Python los reexpone por WebSocket. El teclado sigue funcionando como fallback.

El launcher espera a que el servidor local responda antes de abrir Chrome. Si el servidor no queda disponible, no abre Chrome y muestra los logs generados en `logs/windows-http-*.log`.

Windows usa `EFFECTS_SCALE=1.2` por defecto para correr con graficas completas: mas particulas, burbujas y efectos visuales que el preset normal.

Para salir del kiosk en Windows, usar `Alt+F4`. Durante pruebas puede ser mas comodo abrir sin kiosk:

```bat
set "KIOSK=0"
start-windows.bat
```

Variables utiles en Windows:

```bat
set "HTTP_PORT=8080"
set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_USER_DATA_DIR=%TEMP%\omo-chrome-profile"
set "LEFT_BUTTON_KEY=z"
set "RIGHT_BUTTON_KEY=x"
set "EFFECTS_SCALE=1.2"
set "KIOSK=1"
set "START_ARDUINO_BRIDGE=1"
set "ARDUINO_SERIAL_PORT=COM3"
set "ARDUINO_SERIAL_BAUD=115200"
set "CHROME_EXTRA_FLAGS=--disable-gpu-vsync"
start-windows.bat
```

Los defaults del launcher son:

```bat
LEFT_BUTTON_KEY=z
RIGHT_BUTTON_KEY=x
```

Si el teclado modificado termina enviando `x` para izquierda y `z` para derecha, invertirlos:

```bat
set "LEFT_BUTTON_KEY=x"
set "RIGHT_BUTTON_KEY=z"
start-windows.bat
```

Tambien se pueden pasar codigos fisicos como `KeyZ`/`KeyX` si hiciera falta independizarse del layout de teclado:

```bat
set "LEFT_BUTTON_KEY=KeyZ"
set "RIGHT_BUTTON_KEY=KeyX"
start-windows.bat
```

## Arduino Nano como botones

El Arduino Nano clasico no puede emular teclado USB con `Keyboard.h`, pero si sirve perfecto como lector de botones por Serial. El flujo queda:

```text
Botones -> Arduino Nano -> USB Serial -> arduino_serial_ws_bridge.py -> WebSocket -> juego
```

### Cargar sketch

Abrir en Arduino IDE:

```text
arduino/nano_button_serial/nano_button_serial.ino
```

Seleccionar:

- Board: `Arduino Nano`.
- Processor: `ATmega328P`; si no sube, probar `ATmega328P (Old Bootloader)`.
- Port: el puerto del Nano.

Cableado con el sketch incluido:

- Boton izquierdo: pin `D4` a `GND`.
- Boton derecho: pin `D5` a `GND`.
- Usa `INPUT_PULLUP`, no hace falta resistencia externa.

El sketch envia eventos como:

```json
{"type":"button","side":"left","pressed":true,"source":"arduino","ms":1234}
{"type":"button","side":"left","pressed":false,"source":"arduino","ms":1300}
```

### Instalar dependencia Python

En Windows:

```bat
py -m pip install pyserial
```

### Probar bridge Arduino

Con el Nano conectado:

```bat
set "START_ARDUINO_BRIDGE=1"
set "ARDUINO_SERIAL_PORT=COM3"
start-windows.bat
```

Si no se define `ARDUINO_SERIAL_PORT`, el bridge intenta detectar automaticamente un puerto tipo Arduino/CH340/USB Serial.

Variables del bridge Arduino:

```bat
set "START_ARDUINO_BRIDGE=1"
set "ARDUINO_SERIAL_PORT=COM3"
set "ARDUINO_SERIAL_BAUD=115200"
set "ARDUINO_WS_HOST=127.0.0.1"
set "ARDUINO_WS_PORT=8765"
set "ARDUINO_DEBUG=1"
```

El juego recibe press/release por WebSocket, asi que tambien funciona la regla de penalizacion por apretar los dos botones a la vez.

## Arranque automatico en Windows

El repo incluye scripts para instalar una tarea programada de Windows que abre el juego al iniciar sesion del usuario actual. Esto es equivalente al servicio de usuario en Raspberry: Chrome necesita una sesion grafica abierta, por eso la tarea se dispara en login, no como servicio de sistema antes de login.

Antes de instalar, revisar o editar `start-windows-autostart.bat` si la maquina final necesita otras teclas, puerto o delay:

```bat
set "STARTUP_DELAY_SECONDS=10"
set "HTTP_PORT=8000"
set "LEFT_BUTTON_KEY=z"
set "RIGHT_BUTTON_KEY=x"
set "EFFECTS_SCALE=1.2"
set "KIOSK=1"
set "START_ARDUINO_BRIDGE=1"
set "ARDUINO_SERIAL_PORT=COM3"
set "ARDUINO_SERIAL_BAUD=115200"
```

Instalar la tarea programada:

```bat
install-windows-autostart.bat
```

Instalar y arrancar inmediatamente para probar:

```bat
install-windows-autostart.bat -StartNow
```

La tarea instalada se llama:

```text
OMO Paraguay Albirroja Kiosk
```

Para que el juego se levante al prender la PC sin tocar nada, Windows debe entrar automaticamente a ese usuario. Si no hay autologin, la tarea va a correr recien despues de iniciar sesion manualmente.

Ver estado desde CMD:

```bat
schtasks /Query /TN "OMO Paraguay Albirroja Kiosk" /V /FO LIST
```

Ejecutar manualmente la tarea:

```bat
schtasks /Run /TN "OMO Paraguay Albirroja Kiosk"
```

Detener la tarea:

```bat
schtasks /End /TN "OMO Paraguay Albirroja Kiosk"
```

Eliminar el arranque automatico:

```bat
uninstall-windows-autostart.bat
```

## Configuracion del juego

En `game.js`, `GAME_CONFIG` concentra los valores principales:

```js
roundSeconds: 35,
idleSeconds: 18,
instructionsSeconds: 10,
resultSeconds: 8,
difficulty: 1,
attractVideoSrc: "",
inputBridgeUrl: "",
keyBindings: {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  fullscreen: ["f"],
},
```

Tambien se pueden pisar algunos valores por query string:

```text
?seconds=30&difficulty=1.2&idle=20&result=8
```

Teclas de botones:

```text
?leftKey=z&rightKey=x
```

Para reemplazar toda la lista de teclas aceptadas:

```text
?leftKeys=ArrowLeft,a,z&rightKeys=ArrowRight,d,x
```

Tambien acepta codigos como `KeyZ` y `KeyX`.

Video protector futuro:

```text
?video=./assets/intro.mp4
```

Bridge manual:

```text
?bridge=ws://127.0.0.1:8765
```

Desactivar audio:

```text
?audio=0
```

## Audio

Hay dos loops de musica:

- Menu/resultado: `assets/audio/music/menu.ogg`.
- Gameplay: `assets/audio/music/game.ogg`.

Hay efectos para click, inicio, spray, limpieza, impacto de suciedad y premio. Volumenes y rutas estan en `GAME_CONFIG.audio`.

Las fuentes/licencias estan documentadas en `assets/audio/README.md`.

## Bridge WebSocket

`gpio_ws_bridge.py` envia eventos JSON asi:

```json
{"type":"button","side":"left","source":"gpio","timestamp":1777693622.04}
```

`side` puede ser:

- `left`
- `right`

El cliente del juego tambien acepta mensajes simples como `left`, `right`, `l`, `r`, `izquierda` o `derecha`, ademas de JSON.

Para correr solo el bridge:

```bash
python3 gpio_ws_bridge.py
```

Para debug sin GPIO, habilitar simulacion por stdin:

```bash
GPIO_STDIN_SIM=1 python3 gpio_ws_bridge.py
```

Luego escribir `l` o `r` y Enter en esa consola.

## Desarrollo local

Para correr solo el juego sin Raspberry:

```bash
python3 -m http.server 8000
```

Abrir:

```text
http://localhost:8000/
```

Controles disponibles:

- Flecha izquierda o `A`: boton izquierdo.
- Flecha derecha o `D`: boton derecho.
- Las teclas configuradas por query string o por `LEFT_BUTTON_KEY`/`RIGHT_BUTTON_KEY` en Windows.
- Click/touch lado izquierdo o derecho del canvas.
- `F`: fullscreen.

## Troubleshooting

### Chromium no abre

Verificar binario:

```bash
which chromium-browser
which chromium
```

Si esta en otra ruta:

```bash
CHROMIUM_BIN=/ruta/a/chromium ./start.sh
```

En Windows, si Chrome esta en otra ruta:

```bat
set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
start-windows.bat
```

### Windows no encuentra Python

Instalar Python 3 desde `python.org` y marcar la opcion `Add python.exe to PATH`, o definir la ruta manualmente:

```bat
set "PYTHON_BIN=C:\Users\TU_USUARIO\AppData\Local\Programs\Python\Python312\python.exe"
start-windows.bat
```

### Chrome muestra ERR_CONNECTION_REFUSED en Windows

Eso significa que Chrome abrio, pero no habia servidor escuchando en `127.0.0.1` en ese puerto. Volver a correr:

```bat
start-windows.bat
```

El launcher debe mostrar algo como:

```text
Starting HTTP server: http://127.0.0.1:8000/
HTTP server ready: http://127.0.0.1:8000/
Opening Chrome: http://127.0.0.1:8000/?effects=1.2&leftKey=z&rightKey=x
```

Si no llega a `HTTP server ready`, revisar el error que imprime la consola y los archivos `logs/windows-http-*.err.log`. Causas comunes:

- Python no esta instalado o `py` apunta a una instalacion invalida.
- El puerto `8000` ya esta ocupado.
- Antivirus/firewall bloquea Python en localhost.

Para probar otro puerto:

```bat
set "HTTP_PORT=8080"
start-windows.bat
```

### Los botones no responden

En Windows, confirmar primero que el teclado modificado envia las teclas esperadas. Probar ambas orientaciones:

```bat
set "LEFT_BUTTON_KEY=z"
set "RIGHT_BUTTON_KEY=x"
start-windows.bat
```

o:

```bat
set "LEFT_BUTTON_KEY=x"
set "RIGHT_BUTTON_KEY=z"
start-windows.bat
```

Si Windows envia codigos fisicos en vez de caracteres, probar `KeyZ`/`KeyX`.

En Raspberry, verificar que el bridge haya iniciado y muestre algo como:

```text
GPIO ready. left=BCM17, right=BCM27
WebSocket bridge listening on ws://127.0.0.1:8765
```

Si aparece que `gpiozero` no esta disponible, instalarlo:

```bash
sudo apt install -y python3-gpiozero unclutter
```

Probar simulacion:

```bash
GPIO_STDIN_SIM=1 python3 gpio_ws_bridge.py
```

### El juego abre pero no conecta al bridge

Confirmar que la URL incluya:

```text
?bridge=ws://127.0.0.1:8765
```

`start.sh` ya lo hace automaticamente.

### El cursor del mouse se sigue viendo

La app usa `cursor: none`, pero en Raspberry OS el cursor puede quedar dibujado por X11/compositor. `start.sh` intenta arrancar `unclutter` automaticamente si esta instalado. Instalarlo con:

```bash
sudo apt update
sudo apt install -y unclutter
```

Luego reiniciar el servicio:

```bash
systemctl --user restart game-omo-paraguay-albiroja.service
```

Para desactivar este comportamiento durante debug:

```bash
HIDE_MOUSE=0 ./start.sh
```

### Aparece popup de Unlock Keyring

`start.sh` abre Chromium con:

```text
--password-store=basic
--use-mock-keychain
```

Esto evita que Chromium intente usar el `Default Keyring` del escritorio y pida password en modo kiosk. Despues de actualizar, reiniciar el servicio:

```bash
systemctl --user restart game-omo-paraguay-albiroja.service
```

Si el popup persiste por estado viejo del perfil Chromium, limpiar el perfil temporal:

```bash
systemctl --user stop game-omo-paraguay-albiroja.service
rm -rf /tmp/omo-chromium-profile
systemctl --user start game-omo-paraguay-albiroja.service
```

Como ultimo recurso de sistema, abrir `Passwords and Keys` / `seahorse` en Raspberry OS y poner el `Default Keyring` con password vacio, o eliminarlo y recrearlo vacio. Para kiosk offline/local esto suele ser aceptable, pero el flag de Chromium deberia evitarlo sin tocar el keyring del usuario.

### Aparece popup de traducir pagina

`start.sh` bloquea esto por tres vias: marca el HTML como `notranslate`, escribe preferencias internas del perfil Chromium con `translate.enabled=false`, e incluye estos flags para bloquear traduccion y primeros dialogos de Chromium:

```text
--no-first-run
--no-default-browser-check
--disable-translate
--disable-features=Translate,TranslateUI,TranslateSubFrames
--lang=es-419
--accept-lang=es-PY,es-419,es,en-US,en
```

Ademas, antes de abrir Chromium, `start.sh` escribe:

```text
/tmp/omo-chromium-profile/Default/Preferences
/tmp/omo-chromium-profile/Local State
```

con traduccion deshabilitada e idioma español.

Despues de actualizar `start.sh`, reiniciar el servicio:

```bash
systemctl --user restart game-omo-paraguay-albiroja.service
```

Si Chromium quedo con preferencias viejas en el perfil kiosk, limpiar el perfil y reiniciar:

```bash
systemctl --user stop game-omo-paraguay-albiroja.service
rm -rf /tmp/omo-chromium-profile
systemctl --user start game-omo-paraguay-albiroja.service
```

Si aun asi Chromium insiste con el popup `Spanish / English`, instalar la policy administrada incluida en el repo. Esto fuerza la traduccion apagada a nivel sistema:

```bash
sudo mkdir -p /etc/chromium/policies/managed
sudo cp omo-kiosk-chromium-policy.json /etc/chromium/policies/managed/omo-kiosk.json
systemctl --user restart game-omo-paraguay-albiroja.service
```

Verificacion opcional: abrir `chrome://policy` en Chromium y revisar que aparezca `TranslateEnabled: false`.

### Audio no suena

En kiosk debe usarse `start.sh`, porque agrega:

```text
--autoplay-policy=no-user-gesture-required
```

Tambien revisar que no se haya abierto con `?audio=0`.

## Tipografia

La tipografia del juego esta bundleada en `assets/fonts` como Barlow Condensed, licenciada bajo SIL Open Font License 1.1. Esto evita que Raspberry Pi OS caiga en una fuente distinta o fea cuando no tiene las mismas fuentes que macOS.

## Optimizacion en Raspberry Pi 5

El juego renderiza internamente a 720x1280 y Chromium lo escala a pantalla completa. En una TV 4K, el Pi trabaja mucho mas escalando y componiendo, asi que para maxima fluidez conviene probar en este orden:

- Usar `EFFECTS_SCALE=0.55 ./start.sh` si aparecen drops de FPS. El default del launcher es `0.7`.
- Si la activacion lo permite, configurar la salida del sistema a 1080x1920 portrait en lugar de 4K. Visualmente se ve bien para este canvas y reduce bastante la carga.
- Probar `CHROMIUM_EXTRA_FLAGS="--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist" ./start.sh`; si algun flag da problemas, quitarlo y volver al default.
- Revisar temperatura y throttling con `vcgencmd measure_temp` y `vcgencmd get_throttled`. Si hay throttling, usar fuente oficial/adecuada y cooling activo.
- Mantener Raspberry Pi OS actualizado con `sudo apt update && sudo apt full-upgrade -y`.
- En Raspberry Pi OS Bookworm, revisar `/boot/firmware/config.txt`; en versiones anteriores puede ser `/boot/config.txt`. Mantener KMS/V3D activo (`dtoverlay=vc4-kms-v3d`) y evitar 4K si no es imprescindible para el totem.
- Desactivar apps abiertas, notificaciones, blanking y efectos del escritorio antes de correr el kiosk.
- Dejar `GPIO_DEBUG=0` durante la activacion; usar `GPIO_DEBUG=1` solo para diagnostico.

## Notas de operacion

- Para salir del kiosk en Raspberry, usar `Alt+F4` o cambiar de terminal/sesion segun configuracion del sistema.
- El juego esta pensado para portrait 9:16. En una TV 4K horizontal conviene configurar la salida/rotacion o montar el display en vertical segun el totem.
- El umbral de premio puede editarse en `PRIZE_THRESHOLD` dentro de `game.js`.
- Los tiempos y dificultad deben ajustarse despues de pruebas reales con publico.
