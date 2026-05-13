Original prompt: vamos a crear un juego para web, podemos usar pixijs ya que solo es 2d aunque tambien podemos usar threejs si va quedar mejor que parezca 3d, tiene que ser portrait, en este juego tenemos una pantalla de inicio, con un boton de iniciar, al iniciar vamos a la pantalla principal del juego, ahi tenemos una remera de paraguay, donde la suciedad intenta ensuciar la remera, pero nosotros tenemos dos botones, que disparan agua con jabon y la limpian de vuelta. fijate en la carpeta de assets tenemos la remera, el fondo, etc..

tambien hay un ejemplo.png


Mecánica de la app.
inicialmente va mostrar un video de como se mezclan las fibras para obtener los tejidos,y aparece una camiseta de paraguay,en eso se activa eljuego, sacando el primer slide del juego *PROTEJE TU CAMISETA AHORA* en eso van apareciendo los objetos de manchas , pasto,barro, etc. 
El jugador debe evitar que esas suciedades queden en la camiseta,  utilizando como comando dos botones que tienes  que desarrollarlo. boton derecha izquierda.
debe tener una escala de medidas,contabilizando la cantidad de objetos esquivados.  (4 niveles) para asi poder entregar los premios

Notes:
- Proyecto inicial vacío salvo assets (`fondo.png`, `remera.png`) y `ejemplo.png`.
- Decisión: implementar en canvas puro para evitar dependencias externas y acelerar la entrega.
- Objetivo de esta iteración: flujo completo portrait con intro animada, start screen, gameplay, 4 niveles, score y hooks de prueba.
- Se agregó una SPA estática con `index.html`, `styles.css` y `game.js`.
- El gameplay final usa dos botones laterales (izquierda/derecha) para disparar agua con jabón hacia la camiseta.
- La progresión quedó basada en objetos limpiados/esquivados con 4 hitos: `4`, `9`, `15`, `22`.
- Se dibujó HUD dentro del canvas para que la experiencia y las pruebas visuales muestren marcador, nivel, escala de protección y botones.
- Se expusieron `window.render_game_to_text` y `window.advanceTime(ms)` para pruebas determinísticas.
- Dependencias agregadas para validación visual: `playwright` en `package.json`.

Test runs:
- `output/web-game-intro/shot-0.png`: intro/cinemática visible.
- `output/web-game-start/shot-0.png`: slide "PROTEJE TU CAMISETA AHORA" validado.
- `output/web-game-spray/shot-0.png`: disparo de agua+jabón visible y `state-0.json` con spray activo.
- `output/web-game-balance/`: gameplay estable con progreso hasta nivel 3.
- `output/web-game-victory/shot-7.png`: victoria validada con `score=22`, `level=4`, `mode=result`.

Suggestions:
- Si después queremos parecer más "premium", el siguiente paso natural es reemplazar la intro dibujada por un video real o una secuencia de sprites.
- También se puede sumar una pantalla de premios específica por cada hito, ahora mismo resuelta como una escala de 4 niveles y un cierre victorioso.
- Ajuste de flujo para activación: la pantalla inicial ya no es overlay sobre el juego; muestra un placeholder de video, luego instrucciones, luego gameplay.
- El inicio del flujo ahora usa solo izquierda/derecha. Desde la pantalla inicial, cualquiera de esos botones muestra instrucciones; las instrucciones avanzan solas al juego.
- Al terminar, la pantalla de resultado muestra score/protección y vuelve automáticamente al inicio.
- Capturas de verificación del nuevo flujo: `output/web-game-flow-start`, `output/web-game-flow-instructions`, `output/web-game-flow-playing`.

Update 2026-05-01:
- Nuevo flujo orientado a totem/TV: `attract` (protector visual/video futuro) -> `start` -> `instructions` -> `playing` -> `result` -> `attract`.
- `GAME_CONFIG` quedó arriba de `game.js` para ajustar `roundSeconds`, `idleSeconds`, `instructionsSeconds`, `resultSeconds`, `difficulty`, `attractVideoSrc` y scoring.
- Tambien se pueden probar overrides por query string: `?seconds=30&difficulty=1.2&idle=20&video=./assets/intro.mp4`.
- La partida ahora es por tiempo configurable y el puntaje final va de 0 a 100%.
- Premios por umbrales de 25/50/75/100%; si el resultado final queda debajo de 25%, muestra "Sin premio".
- La suciedad ahora suma puntos si se limpia antes de tocar la camiseta y resta si impacta la remera.
- Se agrando la camiseta, se redisenio el HUD para score/tiempo/premio, y se agregaron burbujas + rayos de jabon mas visibles.
- La suciedad ya no es una elipse plana: se generan sprites procedurales con textura para barro, pasto, tierra y tinta.
- CSS ajustado para TV fullscreen: el canvas ocupa el alto disponible manteniendo 9:16, sin el limite anterior de 520px.
- Validaciones realizadas:
  - `node --check game.js`
  - `output/omo-attract`: protector visual.
  - `output/omo-flow` y `output/omo-flow-after`: start/instrucciones/gameplay/resultado corto.
  - `output/omo-idle`: retorno por inactividad al protector.
  - Browser interno contra `http://localhost:8000/`, sin errores de consola.
- Pendientes naturales:
  - Reemplazar fallback de `attract` por el video real cuando este disponible usando `GAME_CONFIG.attractVideoSrc`.
  - Conectar input local GPIO/serial via bridge Python y consumirlo desde JS.
  - Definir nombres reales de los premios de Nivel 1-4.
  - Ajustar `roundSeconds` y `difficulty` en pruebas reales con publico.

Update 2026-05-01 follow-up:
- Sin `attractVideoSrc`, el juego ya no muestra protector fallback: arranca y vuelve a `start`.
- La colision suciedad/camiseta ahora usa una mascara alfa generada desde `assets/remera.png`, en vez de rectangulo.
- Las manchas se colocan en el punto real de contacto con la camiseta.
- La deteccion del spray ahora sigue la curva visual del rayo, no una linea recta invisible.
- Ajustado el target del spray para llegar mejor al torso alto y hombros.
- El track de premios del HUD quedo insetado para alinear Nivel 1-4 con sus marcadores.
- Validaciones: `node --check game.js`, `output/omo-no-video-start`, `output/omo-collision-hud`, y browser interno sin errores de consola.

Update 2026-05-01 result lock:
- Durante `result`, teclado y click quedan bloqueados; las flechas no pueden saltar la pantalla final.
- El resultado ahora vuelve siempre a `start` despues de `GAME_CONFIG.resultSeconds`.
- Texto final ajustado a "Volviendo al inicio".
- `render_game_to_text` expone `inputLocked` para validar este estado.
- Validaciones:
  - `node --check game.js`
  - `output/omo-result-input-lock`: flechas durante resultado no cambian de pantalla.
  - `output/omo-result-timeout-start`: al terminar el timer configurable vuelve a inicio.

Update 2026-05-01 wider spray:
- El spray ahora abre como abanico usando varias trayectorias paralelas (`SPRAY_COLLISION_LANES` y `SPRAY_VISUAL_LANES`).
- Los targets del spray subieron hasta la zona alta de camiseta/cuello para poder limpiar suciedad que entra desde arriba.
- Se aumento el ancho de colision y el margen del lado correcto para que manchas ya metidas cerca del torso no queden imposibles.
- Las burbujas/espuma se distribuyen por todo el abanico, no solo en el rayo central.
- Validaciones:
  - `node --check game.js`
  - `output/omo-wider-spray`: gameplay con spray mas alto/ancho; en corrida corta llego a 27% y desbloqueo Nivel 1.

Update 2026-05-01 HUD thresholds:
- Reajustado el HUD de scoring para que los marcadores representen exactamente 25/50/75/100.
- Los circulos ahora estan sobre la barra y los labels quedan dentro del panel, no por debajo.
- Nivel 4 queda contenido visualmente aunque represente 100%.
- Validaciones:
  - `node --check game.js`
  - `output/omo-hud-thresholds`
  - Browser interno refrescado contra `http://localhost:8000/`, sin errores de consola.

Update 2026-05-01 spray rebalance:
- Reducido el abanico del spray despues de quedar demasiado facil.
- Lanes de colision bajaron de 5 a 3 y el ancho efectivo se redujo.
- El spray mantiene alcance alto hacia hombros/cuello, pero tiene menos apertura lateral.
- Agregada zona efectiva: una suciedad debe entrar aproximadamente 14% desde el borde antes de poder limpiarse.
- Reducida cantidad/tamano de espuma para que el rayo no limpie desde casi todo el borde.
- Validaciones:
  - `node --check game.js`
  - `output/omo-spray-rebalanced`
  - `output/omo-spray-edge-gated`
  - Browser interno refrescado contra `http://localhost:8000/`, sin errores de consola.

Update 2026-05-01 shirt defense collision:
- Separada la regla de gameplay de la animacion del rayo: el spray ahora es principalmente visual.
- La limpieza se calcula con una zona defensiva alrededor de la mascara alfa real de la camiseta (`SHIRT_DEFENSE_MARGIN`).
- Si la suciedad del lado correcto entra en el borde real de la remera + margen, el disparo la limpia aunque el rayo visual no pase exactamente por encima.
- Esto vuelve alcanzables las mangas sin permitir limpiar suciedad apenas aparece en el borde de pantalla.
- La animacion del spray se abrio un poco de nuevo para recuperar el look mas disperso anterior.
- Validaciones:
  - `node --check game.js`
  - `output/omo-shirt-defense-zone`
  - Browser interno refrescado contra `http://localhost:8000/`, sin errores de consola.

Update 2026-05-01 visual wider rays:
- Ampliada solo la animacion visual de los rayos hacia los costados de la remera.
- `SPRAY_VISUAL_LANES` ahora abre mas, y espuma/burbujas usan un rango visual un poco mayor.
- No se cambio la regla de colision/scoring basada en zona defensiva de camiseta.
- Validaciones:
  - `node --check game.js`
  - `output/omo-visual-wider-rays`
  - Browser interno refrescado contra `http://localhost:8000/`, sin errores de consola.

Update 2026-05-01 HUD metrics:
- Quitado `PREMIO 0/4` del HUD principal durante gameplay.
- `PUNTAJE` queda alineado al inicio de la barra de niveles.
- `TIEMPO` queda alineado al final de la barra de niveles.
- La barra y labels de niveles se mantienen iguales.
- Validaciones:
  - `node --check game.js`
  - `output/omo-hud-two-metrics`

Update 2026-05-01 arcade impacts:
- Impactos de suciedad contra camiseta ahora disparan un evento visual completo.
- Agregado screen shake sobre el mundo de juego, manteniendo el HUD estable.
- Agregado flash rojo mas dramatico con borde doble.
- Agregada onda expansiva circular en el punto de impacto.
- Agregadas particulas de suciedad con fisica simple.
- Feedback de impacto ahora muestra `MANCHA!` grande con contorno, ademas del puntaje negativo.
- Validaciones:
  - `node --check game.js`
  - `output/omo-arcade-impacts`: capturas con impactos multiples visibles y sin errores.

Update 2026-05-02 arcade audio:
- Agregada capa de audio configurable en `GAME_CONFIG.audio` con volumen master, volumen de musica de menu/gameplay y volumen de SFX.
- La musica se desbloquea con el primer input del usuario por restricciones de autoplay de Chromium.
- Menus/resultado usan `assets/audio/music/menu.ogg`; gameplay usa `assets/audio/music/game.ogg`.
- Eventos con SFX: click de boton, inicio de partida, disparo de jabon/rayo, limpieza, impacto de suciedad y desbloqueo de premio.
- Query rapida para pruebas/montaje: `?audio=0` desactiva todo el audio.
- Assets libres/CC0 descargados de Kenney y OpenGameArt; fuentes documentadas en `assets/audio/README.md`.
- Validacion realizada sin browser por pedido del usuario: `node --check game.js` y verificacion de formatos con `file`.

Update 2026-05-02 Raspberry kiosk GPIO bridge:
- Agregado `start.sh` para Raspberry OS: levanta `python3 -m http.server`, levanta `gpio_ws_bridge.py` y abre Chromium en kiosk/fullscreen.
- `start.sh` pasa `?bridge=ws://127.0.0.1:8765` al juego y usa `--autoplay-policy=no-user-gesture-required` para que audio funcione con botones fisicos via WebSocket.
- Pines configurables por variables: `GPIO_LEFT_PIN` default BCM17, `GPIO_RIGHT_PIN` default BCM27, `GPIO_DEBOUNCE`, `GPIO_PULL_UP`, `HTTP_PORT`, `GPIO_WS_PORT`, `CHROMIUM_BIN`.
- Agregado `gpio_ws_bridge.py`: WebSocket stdlib sin dependencias de servidor; usa `gpiozero.Button` si esta disponible y envia JSON `{type, side, source, timestamp}`.
- El juego ahora acepta `?bridge=...`, se conecta por WebSocket, reconecta si cae, normaliza `left/right/l/r/izquierda/derecha` y llama a la misma accion que teclado/click.
- `render_game_to_text` expone estado del bridge (`enabled`, `connected`, `lastSide`, `reconnects`).
- Validaciones sin browser: `node --check game.js`, `bash -n start.sh`, compilacion sintactica de `gpio_ws_bridge.py`, arranque/cierre breve del bridge y prueba local previa de entrega de evento por WebSocket.

Update 2026-05-02 soap bottle animation restored:
- Reagregada solo la animacion visual del jabon OMO al disparar: escala, lift, tilt lateral, glow y aro de energia.
- No se reintrodujo la regla de input exclusivo; izquierda y derecha vuelven a funcionar normalmente aunque se presionen cerca en el tiempo.
- Validacion: `node --check game.js`.

Update 2026-05-05 attract video cleanup:
- En modo video/protector ya no se dibuja el texto `PRESIONA UN BOTON` ni las flechas sobre el video.
- El video de attract ahora queda `muted = false` y volumen 1 para reproducir su audio.
- La musica del juego/menu se pausa mientras esta activo el video para no mezclarse con el audio propio del video.
- Validacion: `node --check game.js`.

Update 2026-05-05 attract video autoplay fallback:
- El video de attract intenta iniciar con sonido, pero si Chromium bloquea autoplay con audio hace fallback automatico a muted autoplay para que no quede pausado en el primer frame.
- Despues de una interaccion real de pointer/teclado, `videoAudioUnlocked` permite reintentar el video con audio al volver al attract.
- Se mantiene el modo attract sin texto ni flechas sobre el video, y la musica del juego se pausa durante attract con video.
- Validacion: `node --check game.js`.

Update 2026-05-05 start screen branding:
- Pantalla de inicio actualizada para usar `assets/logo-omo.png` en lugar del titulo textual `PROTEGE TU CAMISETA`.
- Copy de inicio cambiado a tres lineas: `Mantené a la albirroja`, `impecable con OMO Ultra`, `Power y ganá!`.
- La imagen central de inicio ahora usa `assets/omo.png` en vez de la camiseta.
- Validacion: `node --check game.js`.

Update 2026-05-05 single prize threshold:
- Eliminados los 4 niveles de premio del juego y del HUD principal.
- Nueva regla: el jugador gana premio solo si termina con 75% o mas; por debajo de 75% queda sin premio.
- Donde estaba el marcador de Nivel 3/75% ahora se muestra un unico marcador `Premio` en la barra de puntaje.
- Pantalla final cambiada a `GANASTE PREMIO` / `SIN PREMIO ESTA VEZ`, con barra de objetivo 75%.
- README actualizado para documentar `PRIZE_THRESHOLD`.

Update 2026-05-05 gameplay HUD score/time redesign:
- HUD superior simplificado: se quitaron los labels separados `PUNTAJE` y `TIEMPO`.
- Arriba queda solo la barra de puntaje con texto `Puntos X`.
- El tiempo se movio al centro inferior, entre los dos envases OMO, como dial circular con borde decreciente y texto interno `TIEMPO` + segundos restantes.
- Validacion: `node --check game.js`.

Update 2026-05-05 final screens redesign:
- Pantalla final ya no usa overlay/card sobre el gameplay; ahora es una pantalla completa con fondo de marca y logo OMO arriba.
- Si gana, muestra camiseta limpia centrada con glow y burbujas, texto `GANASTE` y `SOLICITA TU PREMIO`.
- Si pierde, muestra reloj rojo pulsante y texto `TE QUEDASTE SIN TIEMPO`.
- Se mantiene contador de retorno al inicio.
- Validacion: `node --check game.js`.

Update 2026-05-05 Raspberry runtime hardening:
- Reemplazado `python3 -m http.server` por `kiosk_http_server.py`, un server local con soporte Range para MP4, favicon 204 y supresion de BrokenPipe/ConnectionReset cuando Chromium corta requests de video.
- `start.sh` ahora prefiere `chromium` sobre `chromium-browser`, usa perfil limpio `CHROMIUM_USER_DATA_DIR=/tmp/omo-chromium-profile` y agrega flags para reducir ruido de background networking, sync, component update y crashpad.
- Se agrego `CHROMIUM_EXTRA_FLAGS` para poder probar flags adicionales sin editar el script.
- Validaciones: `bash -n start.sh` y compilacion sintactica de `kiosk_http_server.py`.

Update 2026-05-05 GPIO bridge debug/polling:
- Como `test.py` leia correctamente BCM17/27 pero el juego no respondia, el bridge cambio de `gpiozero.Button.when_pressed` a polling con `DigitalInputDevice`, igual que el test.
- El bridge ahora loguea estados iniciales, cambios HIGH/LOW y eventos enviados a clientes WebSocket.
- El cliente JS ahora loguea conexion, cierre/error y mensajes de botones recibidos para debug en Chromium.
- Validaciones: compilacion sintactica de `gpio_ws_bridge.py` y `node --check game.js`.

Update 2026-05-12 Windows Chrome launcher:
- Agregado `start-windows.ps1` para levantar `kiosk_http_server.py`, abrir Google Chrome en Windows con perfil limpio, flags de kiosk/audio/idioma y cerrar el server al salir de Chrome.
- Agregado `start-windows.bat` como wrapper para ejecutar el launcher con doble click o desde CMD.
- `gpio_ws_bridge.py` ahora tolera Windows, donde `asyncio.add_signal_handler` no esta implementado.
- README actualizado con requisitos, arranque rapido, variables y troubleshooting para Windows + Chrome.

Update 2026-05-05 Raspberry performance pass:
- Agregado `GAME_CONFIG.performance` y query `?effects=` para escalar particulas, burbujas y efectos pesados sin tocar codigo.
- `start.sh` ahora usa `EFFECTS_SCALE=0.7` por defecto y lo pasa al juego; se puede bajar a `0.55` para Pi 5 si aparecen drops.
- Cacheadas capas estaticas de fondo y glow del escenario para no recalcular gradientes e imagen base en cada frame.
- README actualizado con recomendaciones de optimizacion Raspberry/Chromium/config.txt.
- Logs detallados del cliente WebSocket y del polling GPIO quedan apagados por defecto; pueden activarse con `?debugInput=1` y `GPIO_DEBUG=1`.

Update 2026-05-05 Raspberry typography:
- Agregada fuente local Barlow Condensed Bold/ExtraBold en `assets/fonts` con licencia OFL.
- `styles.css` define `@font-face` para `OMO Display` y usa fallbacks Linux-friendly.
- `game.js` centraliza el font canvas en `gameFont()` y reemplaza Trebuchet MS por la familia local.
- `kiosk_http_server.py` ahora declara MIME para fuentes (`.ttf`, `.otf`, `.woff`, `.woff2`).

Update 2026-05-05 systemd packaging:
- Agregado `game-omo-paraguay-albiroja.service` como servicio systemd de usuario para Raspberry OS.
- Servicio apunta a `%h/game-omo-paraguay-albirroja/start.sh`, reinicia automaticamente y usa `EFFECTS_SCALE=0.55`.
- README actualizado con instalacion, enable/start, logs, restart, disable y ajuste de variables.
- Servicio ajustado para kiosk grafico: usa `DISPLAY=:0`, `XDG_RUNTIME_DIR=/run/user/%U`, delay inicial de 8s y README prioriza Desktop Autologin sobre `loginctl enable-linger`.

Update 2026-05-05 kiosk translate popup:
- `start.sh` ahora desactiva traduccion de Chromium con `--disable-translate` y `--disable-features=Translate,TranslateUI`.
- Agregados `--no-first-run`, `--no-default-browser-check`, `--lang=es-PY` y `--accept-lang=es-PY,es,en-US,en` para evitar popups/dialogos en kiosk.
- README actualizado con troubleshooting para limpiar `/tmp/omo-chromium-profile` si quedaron preferencias viejas.

Update 2026-05-05 kiosk translate popup hardening:
- `index.html` ahora usa `lang=es-PY`, `translate=no`, clase `notranslate` y meta `google=notranslate`.
- `start.sh` ahora preconfigura `Default/Preferences` y `Local State` del perfil Chromium con `translate.enabled=false`, idioma español y notificaciones bloqueadas.
- Flags de Chromium actualizados a `Translate,TranslateUI,TranslateSubFrames`, `--lang=es-419` y accept-languages español.
- Agregado `omo-kiosk-chromium-policy.json` con `TranslateEnabled=false` para instalar como policy administrada si el popup Spanish/English persiste.

Update 2026-05-05 kiosk cursor:
- `styles.css` ahora usa `cursor: none` global y en el canvas para ocultar el mouse durante el kiosk.
- README actualizado indicando que el cursor se oculta desde la app.

Update 2026-05-05 kiosk keyring popup:
- `start.sh` ahora abre Chromium con `--password-store=basic` y `--use-mock-keychain` para evitar el popup `Unlock Keyring`.
- README actualizado con troubleshooting para reiniciar servicio, limpiar `/tmp/omo-chromium-profile` y opcion de keyring vacio como ultimo recurso.

Update 2026-05-05 kiosk cursor hardening:
- CSS ahora usa `cursor: none !important`.
- `start.sh` agrega `HIDE_MOUSE=1` y arranca `unclutter -idle 0.1 -root` si esta instalado, cerrandolo en cleanup.
- Servicio systemd exporta `HIDE_MOUSE=1`.
- README actualizado con instalacion de `unclutter` y troubleshooting del cursor.

Update 2026-05-12 Windows keyboard input:
- Windows ya no inicia `gpio_ws_bridge.py`; el launcher solo pasa teclas de boton por query string.
- `start-windows.ps1` acepta `LEFT_BUTTON_KEY`/`RIGHT_BUTTON_KEY` (`z`/`x` por defecto) y arma la URL con `?leftKey=...&rightKey=...`.
- `game.js` agrega `GAME_CONFIG.inputKeys`, overrides por `leftKey/rightKey` o `leftKeys/rightKeys`, y matching por `event.key` o `event.code`.
- Pantallas de inicio/instrucciones muestran las etiquetas configuradas de cada boton.
- README actualizado con configuracion Windows para teclados modificados y troubleshooting sin GPIO.

Update 2026-05-12 Windows HTTP readiness:
- `start-windows.ps1` ahora guarda stdout/stderr del servidor en `logs/windows-http-*.log`.
- El launcher espera a que `http://127.0.0.1:<HTTP_PORT>/` responda antes de abrir Chrome.
- Si el server termina o no responde, imprime el tail de los logs y no abre Chrome, para diagnosticar `ERR_CONNECTION_REFUSED`.
- `.gitignore` ahora ignora `/logs`.
- README actualizado con troubleshooting de `ERR_CONNECTION_REFUSED` en Windows.

Update 2026-05-12 visual input labels fixed:
- `game.js` mantiene el mapeo funcional configurable (`leftKey/rightKey`, `leftKeys/rightKeys`) para teclados modificados.
- Se revirtio la parte visual: inicio e instrucciones vuelven a mostrar siempre izquierda/derecha con flechas `←` y `→`, sin mostrar `x`, `z`, `KeyZ` u otras teclas configuradas.

Update 2026-05-12 Windows autostart:
- Agregado `start-windows-autostart.bat` con defaults editables para delay, puerto, teclas, efectos y kiosk.
- Agregado `install-windows-autostart.ps1` / `.bat` para registrar una tarea programada `OMO Paraguay Albirroja Kiosk` al iniciar sesion del usuario actual.
- Agregado `uninstall-windows-autostart.ps1` / `.bat` para eliminar la tarea.
- README actualizado con instalacion, prueba inmediata, `schtasks` para estado/run/end, desinstalacion y nota de autologin de Windows.

Update 2026-05-12 Windows full graphics:
- Windows ahora usa `EFFECTS_SCALE=1.2` por defecto en `start-windows.ps1` y `start-windows-autostart.bat`.
- README actualizado para documentar que Windows corre con graficas completas por defecto.

Update 2026-05-12 Windows autostart compatibility:
- `install-windows-autostart.ps1` cambio `-RunLevel LeastPrivilege` por `-RunLevel Limited`, que es el enum valido en Windows PowerShell para tarea programada sin elevacion.
