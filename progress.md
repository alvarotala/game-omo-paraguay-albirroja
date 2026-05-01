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
