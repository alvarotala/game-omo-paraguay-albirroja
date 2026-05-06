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
- `start.sh`: script de arranque para Raspberry OS.
- `kiosk_http_server.py`: servidor HTTP local para kiosk, con soporte Range para video y logs menos ruidosos.
- `progress.md`: historial tecnico de cambios.

## Requisitos en Raspberry OS

- Raspberry Pi 5 con Raspberry OS.
- Python 3.
- Chromium (`chromium-browser` o `chromium`).
- `gpiozero` para leer GPIO.

En Raspberry OS normalmente `gpiozero` ya viene instalado. Si no esta:

```bash
sudo apt update
sudo apt install -y python3-gpiozero
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

Chromium se abre con `--autoplay-policy=no-user-gesture-required` para que el audio funcione tambien cuando el input inicial viene desde los botones fisicos por WebSocket.

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
```

Tambien se pueden pisar algunos valores por query string:

```text
?seconds=30&difficulty=1.2&idle=20&result=8
```

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

### Los botones no responden

Verificar que el bridge haya iniciado y muestre algo como:

```text
GPIO ready. left=BCM17, right=BCM27
WebSocket bridge listening on ws://127.0.0.1:8765
```

Si aparece que `gpiozero` no esta disponible, instalarlo:

```bash
sudo apt install -y python3-gpiozero
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


