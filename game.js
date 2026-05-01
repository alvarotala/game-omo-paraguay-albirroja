const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const CENTER_X = W / 2;

const GAME_CONFIG = {
  roundSeconds: 35,
  idleSeconds: 18,
  instructionsSeconds: 3.2,
  resultSeconds: 8,
  difficulty: 1,
  attractVideoSrc: "",
  inputBridgeUrl: "",
  score: {
    cleanBeforeHit: 5,
    cleanAfterHit: 1,
    shirtPenalty: 7,
    max: 100,
  },
};

applyRuntimeOverrides();
window.OMO_GAME_CONFIG = GAME_CONFIG;

const SHIRT_AREA = { x: CENTER_X, y: H * 0.52, w: 455, h: 530 };

const PRIZE_LEVELS = [
  { threshold: 25, label: "Nivel 1", prize: "Premio Nivel 1", color: "#70d7ff" },
  { threshold: 50, label: "Nivel 2", prize: "Premio Nivel 2", color: "#8dffca" },
  { threshold: 75, label: "Nivel 3", prize: "Premio Nivel 3", color: "#ffe16f" },
  { threshold: 100, label: "Nivel 4", prize: "Premio Final", color: "#ff5a66" },
];

const DIRT_TYPES = [
  {
    kind: "barro",
    label: "Barro",
    palette: ["#6b4129", "#8d5a37", "#3f2518", "#c18a58"],
    speed: [132, 178],
    radius: [24, 38],
    score: 5,
    penalty: 7,
  },
  {
    kind: "pasto",
    label: "Pasto",
    palette: ["#2f6d2e", "#5ba93f", "#183c1d", "#a6d36c"],
    speed: [144, 192],
    radius: [23, 36],
    score: 5,
    penalty: 6,
  },
  {
    kind: "tierra",
    label: "Tierra",
    palette: ["#b89562", "#7b5d3f", "#d7c199", "#5a4530"],
    speed: [150, 205],
    radius: [22, 35],
    score: 4,
    penalty: 5,
  },
  {
    kind: "tinta",
    label: "Tinta",
    palette: ["#34356d", "#5d5ca7", "#171a43", "#8f8bdc"],
    speed: [136, 186],
    radius: [24, 37],
    score: 6,
    penalty: 8,
  },
];

const SPRAY_CONFIG = {
  left: {
    originX: W * 0.14,
    originY: H * 0.91,
    targetX: W * 0.4,
    targetY: H * 0.34,
    direction: 1,
    color: "#58d9ff",
    accent: "#0a8fea",
    label: "IZQUIERDA",
  },
  right: {
    originX: W * 0.86,
    originY: H * 0.91,
    targetX: W * 0.6,
    targetY: H * 0.34,
    direction: -1,
    color: "#70ffc1",
    accent: "#12a06a",
    label: "DERECHA",
  },
};

const SPRAY_COLLISION_LANES = [-0.48, 0, 0.48];
const SPRAY_VISUAL_LANES = [-1.12, -0.62, 0, 0.62, 1.12];
const SHIRT_DEFENSE_MARGIN = 62;

const images = {
  background: loadImage("./assets/fondo.png"),
  shirt: loadImage("./assets/remera.png"),
  omo: loadImage("./assets/omo.png"),
};

const attractVideo = createAttractVideo();

const shirtMask = {
  canvas: document.createElement("canvas"),
  ctx: null,
  data: null,
  width: 512,
  height: 512,
  ready: false,
};
shirtMask.canvas.width = shirtMask.width;
shirtMask.canvas.height = shirtMask.height;
shirtMask.ctx = shirtMask.canvas.getContext("2d");
images.shirt.addEventListener("load", prepareShirtMask);

const state = {
  mode: attractVideo ? "attract" : "start",
  time: 0,
  screenTimer: 0,
  idleTimer: 0,
  roundElapsed: 0,
  timeLeft: GAME_CONFIG.roundSeconds,
  score: 0,
  prizeLevel: 0,
  spawnTimer: 0,
  spawnInterval: 1,
  dirt: [],
  splashes: [],
  bubbles: [],
  stainsOnShirt: [],
  feedback: [],
  flashMessage: "PROTEGE TU CAMISETA",
  impactBurst: 0,
  activeSide: null,
  activeSideTime: 0,
  result: null,
  finalScore: 0,
  finalPrizeLevel: 0,
  finalPrizeLabel: "Sin premio",
};

let rafId = 0;
let lastTimestamp = 0;

function applyRuntimeOverrides() {
  const params = new URLSearchParams(window.location.search);
  const numericOverrides = [
    ["seconds", "roundSeconds"],
    ["idle", "idleSeconds"],
    ["difficulty", "difficulty"],
    ["result", "resultSeconds"],
  ];

  for (const [queryKey, configKey] of numericOverrides) {
    const value = Number(params.get(queryKey));
    if (Number.isFinite(value) && value > 0) {
      GAME_CONFIG[configKey] = value;
    }
  }

  const video = params.get("video");
  if (video) {
    GAME_CONFIG.attractVideoSrc = video;
  }
}

function createAttractVideo() {
  if (!GAME_CONFIG.attractVideoSrc) {
    return null;
  }

  const video = document.createElement("video");
  video.src = GAME_CONFIG.attractVideoSrc;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.play().catch(() => {});
  return video;
}

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getPrizeLevel(score) {
  return PRIZE_LEVELS.reduce(
    (level, prize, index) => (score >= prize.threshold ? index + 1 : level),
    0,
  );
}

function getPrizeLabel(level) {
  if (level <= 0) {
    return "Sin premio";
  }
  return PRIZE_LEVELS[level - 1].prize;
}

function getSprayPoint(config, t, lane = 0) {
  const fan = 1 - (1 - t) * (1 - t);
  const originX = config.originX + lane * 10;
  const targetX = config.targetX + lane * 92;
  const targetY = config.targetY + Math.abs(lane) * 46;
  const controlX = CENTER_X + lane * 64 * fan;
  const controlY = H * 0.56 - Math.abs(lane) * 18;
  const inv = 1 - t;
  return {
    x: inv * inv * originX + 2 * inv * t * controlX + t * t * targetX,
    y: inv * inv * config.originY + 2 * inv * t * controlY + t * t * targetY,
  };
}

function distanceToSprayPath(px, py, config) {
  let closest = Infinity;

  for (const lane of SPRAY_COLLISION_LANES) {
    let previous = getSprayPoint(config, 0, lane);

    for (let index = 1; index <= 18; index += 1) {
      const current = getSprayPoint(config, index / 18, lane);
      closest = Math.min(
        closest,
        distanceToSegment(px, py, previous.x, previous.y, current.x, current.y),
      );
      previous = current;
    }
  }

  return closest;
}

function drawSprayCurve(config, lane) {
  ctx.beginPath();
  const start = getSprayPoint(config, 0, lane);
  ctx.moveTo(start.x, start.y);

  for (let index = 1; index <= 18; index += 1) {
    const point = getSprayPoint(config, index / 18, lane);
    ctx.lineTo(point.x, point.y);
  }
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function getShirtTransform() {
  return {
    x: SHIRT_AREA.x,
    y: SHIRT_AREA.y + Math.sin(state.time * 1.35) * 8,
    scale: 1 + Math.sin(state.time * 1.1) * 0.01,
  };
}

function prepareShirtMask() {
  if (shirtMask.ready || !images.shirt.complete || !images.shirt.naturalWidth) {
    return;
  }

  shirtMask.ctx.clearRect(0, 0, shirtMask.width, shirtMask.height);
  shirtMask.ctx.drawImage(images.shirt, 0, 0, shirtMask.width, shirtMask.height);
  shirtMask.data = shirtMask.ctx.getImageData(0, 0, shirtMask.width, shirtMask.height).data;
  shirtMask.ready = true;
}

function worldToShirtMaskPoint(x, y) {
  prepareShirtMask();

  if (!shirtMask.ready) {
    return null;
  }

  const transform = getShirtTransform();
  const localX = (x - transform.x) / transform.scale + SHIRT_AREA.w / 2;
  const localY = (y - transform.y) / transform.scale + SHIRT_AREA.h / 2;

  if (localX < 0 || localX >= SHIRT_AREA.w || localY < 0 || localY >= SHIRT_AREA.h) {
    return null;
  }

  return {
    x: Math.floor((localX / SHIRT_AREA.w) * shirtMask.width),
    y: Math.floor((localY / SHIRT_AREA.h) * shirtMask.height),
  };
}

function shirtAlphaAtWorld(x, y) {
  const point = worldToShirtMaskPoint(x, y);
  if (!point) {
    return 0;
  }

  const index = (point.y * shirtMask.width + point.x) * 4 + 3;
  return shirtMask.data[index] || 0;
}

function resetSceneObjects() {
  state.dirt = [];
  state.splashes = [];
  state.bubbles = [];
  state.stainsOnShirt = [];
  state.feedback = [];
  state.activeSide = null;
  state.activeSideTime = 0;
  state.impactBurst = 0;
}

function resetRun() {
  state.roundElapsed = 0;
  state.timeLeft = GAME_CONFIG.roundSeconds;
  state.score = 0;
  state.prizeLevel = 0;
  state.spawnTimer = 0.58;
  state.spawnInterval = 1;
  state.result = null;
  resetSceneObjects();
}

function showAttractScreen() {
  if (!attractVideo) {
    showStartScreen();
    return;
  }

  state.mode = "attract";
  state.screenTimer = 0;
  state.idleTimer = 0;
  state.flashMessage = "PROTEGE TU CAMISETA";
  resetSceneObjects();
  if (attractVideo) {
    attractVideo.play().catch(() => {});
  }
  syncHud();
}

function showStartScreen() {
  state.mode = "start";
  state.screenTimer = 0;
  state.idleTimer = 0;
  state.flashMessage = "PROTEGE TU CAMISETA";
  resetSceneObjects();
  if (attractVideo) {
    attractVideo.pause();
  }
  syncHud();
}

function showInstructions() {
  state.mode = "instructions";
  state.screenTimer = 0;
  state.idleTimer = 0;
  state.flashMessage = "Instrucciones";
  resetSceneObjects();
  syncHud();
}

function startGame() {
  state.mode = "playing";
  state.screenTimer = 0;
  state.idleTimer = 0;
  resetRun();
  state.flashMessage = "Evita que la suciedad toque la camiseta";
  syncHud();
}

function finishGame() {
  state.mode = "result";
  state.screenTimer = 0;
  state.result = "complete";
  state.finalScore = Math.round(state.score);
  state.finalPrizeLevel = getPrizeLevel(state.finalScore);
  state.finalPrizeLabel = getPrizeLabel(state.finalPrizeLevel);
  state.flashMessage =
    state.finalPrizeLevel > 0
      ? `${state.finalPrizeLabel} desbloqueado`
      : "Sin premio esta vez";
  state.activeSide = null;
  state.activeSideTime = 0;
  syncHud();
}

function handleAction(side) {
  if (state.mode === "result") {
    return;
  }

  state.idleTimer = 0;

  if (state.mode === "attract") {
    showStartScreen();
    return;
  }

  if (state.mode === "start") {
    showInstructions();
    return;
  }

  if (state.mode === "instructions") {
    startGame();
    return;
  }

  if (state.mode === "playing") {
    shoot(side);
    return;
  }
}

function shoot(side) {
  const config = SPRAY_CONFIG[side];
  const spread = 62;
  state.activeSide = side;
  state.activeSideTime = 0.18;

  state.splashes.push({
    side,
    age: 0,
    maxAge: 0.5,
    width: 104,
    foam: Array.from({ length: 46 }, () => {
      const t = randomBetween(0, 0.68);
      const lane = randomBetween(-1.05, 1.05);
      const point = getSprayPoint(config, t, lane);
      return {
        x: point.x + randomBetween(-18, 18),
        y: point.y + randomBetween(-18, 18),
        vx:
          config.direction * randomBetween(230, 330) +
          lane * randomBetween(28, 76) +
          randomBetween(-spread, spread),
        vy: -randomBetween(310, 510),
        radius: randomBetween(5, 12),
        life: randomBetween(0.28, 0.56),
        maxLife: 0.6,
      };
    }),
  });

  spawnBubbleStream(side, 36);
}

function spawnBubbleStream(side, amount) {
  const config = SPRAY_CONFIG[side];
  for (let index = 0; index < amount; index += 1) {
    const t = randomBetween(0.08, 0.92);
    const lane = randomBetween(-1.05, 1.05);
    const point = getSprayPoint(config, t, lane);
    const drift = config.direction * randomBetween(18, 90);
    state.bubbles.push({
      x: point.x + randomBetween(-28, 28),
      y: point.y + randomBetween(-30, 30),
      vx: drift + lane * randomBetween(18, 58) + randomBetween(-42, 42),
      vy: -randomBetween(45, 135),
      radius: randomBetween(5, 18),
      age: 0,
      maxAge: randomBetween(0.75, 1.35),
      color: side === "left" ? "rgba(88,217,255," : "rgba(112,255,193,",
    });
  }
}

function spawnCleanBurst(x, y) {
  for (let index = 0; index < 18; index += 1) {
    state.bubbles.push({
      x: x + randomBetween(-18, 18),
      y: y + randomBetween(-16, 16),
      vx: randomBetween(-90, 90),
      vy: -randomBetween(70, 190),
      radius: randomBetween(6, 20),
      age: 0,
      maxAge: randomBetween(0.65, 1.15),
      color: "rgba(255,255,255,",
    });
  }
}

function update(dt) {
  state.time += dt;
  state.screenTimer += dt;

  if (state.mode === "start" || state.mode === "instructions") {
    state.idleTimer += dt;
    if (state.idleTimer >= GAME_CONFIG.idleSeconds) {
      showAttractScreen();
      syncHud();
      return;
    }
  }

  if (state.mode === "instructions") {
    updateBubbles(dt);
    if (state.screenTimer >= GAME_CONFIG.instructionsSeconds) {
      startGame();
    }
  } else if (state.mode === "result") {
    updateDirt(dt, false);
    updateBubbles(dt);
    if (state.screenTimer >= GAME_CONFIG.resultSeconds) {
      showStartScreen();
    }
  } else if (state.mode === "playing") {
    state.roundElapsed += dt;
    state.timeLeft = Math.max(0, GAME_CONFIG.roundSeconds - state.roundElapsed);
    state.spawnTimer -= dt;

    if (state.spawnTimer <= 0) {
      spawnDirt();
      const ramp = 1 + (state.roundElapsed / GAME_CONFIG.roundSeconds) * 0.28;
      const prizePressure = 1 + state.prizeLevel * 0.07;
      const difficulty = Math.max(0.45, GAME_CONFIG.difficulty * ramp * prizePressure);
      state.spawnInterval = clamp(randomBetween(0.86, 1.24) / difficulty, 0.42, 1.5);
      state.spawnTimer = state.spawnInterval;
    }

    updateDirt(dt, true);
    updateSplashes(dt);
    updateBubbles(dt);
    handleSprayCollisions();

    state.dirt = state.dirt.filter((dirt) => {
      const outOfBounds = dirt.y > H + 90 || dirt.x < -105 || dirt.x > W + 105;
      const staleStain = dirt.hitShirt && dirt.stuckTime > 8;
      return !outOfBounds && !dirt.cleaned && !staleStain;
    });

    if (state.impactBurst > 0) {
      state.impactBurst = Math.max(0, state.impactBurst - dt);
    }

    if (state.activeSideTime > 0) {
      state.activeSideTime = Math.max(0, state.activeSideTime - dt);
      if (state.activeSideTime === 0) {
        state.activeSide = null;
      }
    }

    updateFeedback(dt);
    updatePrizeLevel();
    updateMessage();

    if (state.timeLeft <= 0) {
      finishGame();
    }
  } else {
    updateBubbles(dt);
    updateFeedback(dt);
  }

  syncHud();
}

function spawnDirt() {
  const source = Math.random() < 0.5 ? "left" : "right";
  const config = SPRAY_CONFIG[source];
  const dirtConfig = DIRT_TYPES[Math.floor(Math.random() * DIRT_TYPES.length)];
  const startX = source === "left" ? -44 : W + 44;
  const startY = randomBetween(H * 0.28, H * 0.68);
  const targetX =
    SHIRT_AREA.x +
    randomBetween(-SHIRT_AREA.w * 0.19, SHIRT_AREA.w * 0.19) +
    (source === "left" ? -42 : 42);
  const targetY = SHIRT_AREA.y + randomBetween(-SHIRT_AREA.h * 0.2, SHIRT_AREA.h * 0.22);
  const angle = Math.atan2(targetY - startY, targetX - startX);
  const progressRamp = 1 + (state.roundElapsed / GAME_CONFIG.roundSeconds) * 0.22;
  const levelRamp = 1 + state.prizeLevel * 0.08;
  const speed =
    randomBetween(dirtConfig.speed[0], dirtConfig.speed[1]) *
    GAME_CONFIG.difficulty *
    progressRamp *
    levelRamp;
  const radius = randomBetween(dirtConfig.radius[0], dirtConfig.radius[1]);

  state.dirt.push({
    kind: dirtConfig.kind,
    label: dirtConfig.label,
    x: startX,
    y: startY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    sprite: createDirtSprite(dirtConfig),
    score: dirtConfig.score,
    penalty: dirtConfig.penalty,
    rotation: randomBetween(0, Math.PI * 2),
    spin: randomBetween(-1.35, 1.35),
    hitShirt: false,
    stuckTime: 0,
    cleaned: false,
    source,
    sourceX: config.originX,
  });
}

function createDirtSprite(dirtConfig) {
  const size = 128;
  const texture = document.createElement("canvas");
  texture.width = size;
  texture.height = size;
  const tctx = texture.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const palette = dirtConfig.palette;

  tctx.save();
  tctx.translate(cx, cy);
  tctx.rotate(randomBetween(-0.5, 0.5));

  const points = 18;
  tctx.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const rx = randomBetween(39, 54);
    const ry = randomBetween(29, 46);
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    if (index === 0) {
      tctx.moveTo(x, y);
    } else {
      tctx.lineTo(x, y);
    }
  }
  tctx.closePath();

  const gradient = tctx.createRadialGradient(-16, -18, 10, 5, 8, 62);
  gradient.addColorStop(0, palette[2]);
  gradient.addColorStop(0.42, palette[0]);
  gradient.addColorStop(1, palette[1]);
  tctx.fillStyle = gradient;
  tctx.fill();

  tctx.globalAlpha = 0.55;
  for (let index = 0; index < 46; index += 1) {
    tctx.fillStyle = palette[index % palette.length];
    tctx.beginPath();
    tctx.arc(
      randomBetween(-45, 45),
      randomBetween(-36, 36),
      randomBetween(1.2, 4.8),
      0,
      Math.PI * 2,
    );
    tctx.fill();
  }

  if (dirtConfig.kind === "pasto") {
    tctx.globalAlpha = 0.82;
    tctx.lineWidth = 3;
    for (let index = 0; index < 24; index += 1) {
      const x = randomBetween(-42, 42);
      const y = randomBetween(-30, 34);
      tctx.strokeStyle = index % 2 ? "#a6d36c" : "#214f25";
      tctx.beginPath();
      tctx.moveTo(x, y + randomBetween(6, 15));
      tctx.quadraticCurveTo(
        x + randomBetween(-12, 12),
        y - randomBetween(8, 18),
        x + randomBetween(-4, 4),
        y - randomBetween(18, 28),
      );
      tctx.stroke();
    }
  } else if (dirtConfig.kind === "barro") {
    tctx.globalAlpha = 0.42;
    tctx.fillStyle = "#f3c288";
    for (let index = 0; index < 10; index += 1) {
      tctx.beginPath();
      tctx.ellipse(
        randomBetween(-34, 34),
        randomBetween(-28, 28),
        randomBetween(6, 14),
        randomBetween(2, 5),
        randomBetween(0, Math.PI),
        0,
        Math.PI * 2,
      );
      tctx.fill();
    }
  } else if (dirtConfig.kind === "tinta") {
    tctx.globalAlpha = 0.78;
    tctx.fillStyle = "#171a43";
    for (let index = 0; index < 7; index += 1) {
      tctx.beginPath();
      tctx.arc(randomBetween(-44, 44), randomBetween(-42, 42), randomBetween(5, 13), 0, Math.PI * 2);
      tctx.fill();
    }
  } else {
    tctx.globalAlpha = 0.5;
    tctx.fillStyle = "#efe0bd";
    for (let index = 0; index < 18; index += 1) {
      tctx.beginPath();
      tctx.arc(randomBetween(-48, 48), randomBetween(-38, 38), randomBetween(2, 6), 0, Math.PI * 2);
      tctx.fill();
    }
  }

  tctx.restore();
  return texture;
}

function updateDirt(dt, applyHits) {
  for (const dirt of state.dirt) {
    dirt.x += dirt.vx * dt;
    dirt.y += dirt.vy * dt;
    dirt.rotation += dirt.spin * dt;

    const shirtHit = applyHits && !dirt.hitShirt ? getDirtShirtHit(dirt) : null;
    if (shirtHit) {
      dirt.hitShirt = true;
      dirt.stuckTime = 0;
      dirt.vx *= 0.08;
      dirt.vy *= 0.08;
      dirt.spin *= 0.2;
      addScore(-dirt.penalty, shirtHit.x, shirtHit.y, "TOCO LA CAMISETA", "#ff6f7d");
      state.impactBurst = 0.35;
      state.stainsOnShirt.push({
        x: shirtHit.x,
        y: shirtHit.y,
        radius: dirt.radius * 1.22,
        sprite: dirt.sprite,
        alpha: 0.62,
        rotation: dirt.rotation,
      });
    }

    if (dirt.hitShirt) {
      dirt.stuckTime += dt;
    }
  }
}

function updateSplashes(dt) {
  state.splashes = state.splashes.filter((splash) => {
    splash.age += dt;
    for (const particle of splash.foam) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 535 * dt;
      particle.life -= dt;
    }
    splash.foam = splash.foam.filter((particle) => particle.life > 0);
    return splash.age < splash.maxAge || splash.foam.length > 0;
  });
}

function updateBubbles(dt) {
  state.bubbles = state.bubbles.filter((bubble) => {
    bubble.age += dt;
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.vy -= 8 * dt;
    bubble.vx *= 1 - Math.min(0.85, dt * 0.75);
    return bubble.age < bubble.maxAge;
  });
}

function updateFeedback(dt) {
  state.feedback = state.feedback.filter((item) => {
    item.age += dt;
    item.y += item.vy * dt;
    return item.age < item.maxAge;
  });
}

function handleSprayCollisions() {
  for (const splash of state.splashes) {
    for (const dirt of state.dirt) {
      if (dirt.cleaned) {
        continue;
      }

      if (isDirtInShirtDefenseZone(dirt, splash.side)) {
        cleanDirt(dirt);
      }
    }
  }
}

function isDirtInEffectiveSprayZone(dirt, side) {
  const enteredHorizontally = side === "left" ? dirt.x > W * 0.14 : dirt.x < W * 0.86;
  const insideVerticalBand = dirt.y > H * 0.22 && dirt.y < H * 0.76;
  return enteredHorizontally && insideVerticalBand;
}

function isDirtInShirtDefenseZone(dirt, side) {
  if (!isDirtInEffectiveSprayZone(dirt, side)) {
    return false;
  }

  if (dirt.source !== side) {
    return false;
  }

  const sideGate = side === "left" ? dirt.x <= CENTER_X + 126 : dirt.x >= CENTER_X - 126;
  if (!sideGate) {
    return false;
  }

  const sampleRadii = [
    0,
    dirt.radius * 0.65,
    dirt.radius + 14,
    dirt.radius + 36,
    dirt.radius + SHIRT_DEFENSE_MARGIN,
  ];

  for (const radius of sampleRadii) {
    const steps = radius === 0 ? 1 : 16;
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const sampleX = dirt.x + Math.cos(angle) * radius;
      const sampleY = dirt.y + Math.sin(angle) * radius;

      if (shirtAlphaAtWorld(sampleX, sampleY) > 36) {
        return true;
      }
    }
  }

  return false;
}

function cleanDirt(dirt) {
  dirt.cleaned = true;
  const points = dirt.hitShirt ? GAME_CONFIG.score.cleanAfterHit : dirt.score;
  addScore(points, dirt.x, dirt.y, dirt.hitShirt ? "LIMPIEZA" : `+${points}%`, "#84ffb3");
  clearNearbyStains(dirt);
  spawnCleanBurst(dirt.x, dirt.y);
}

function clearNearbyStains(dirt) {
  state.stainsOnShirt = state.stainsOnShirt
    .map((stain) => {
      const dx = stain.x - dirt.x;
      const dy = stain.y - dirt.y;
      if (Math.hypot(dx, dy) < dirt.radius * 2.1) {
        return {
          ...stain,
          alpha: stain.alpha - 0.48,
          radius: Math.max(10, stain.radius - 9),
        };
      }
      return stain;
    })
    .filter((stain) => stain.alpha > 0.12);
}

function addScore(delta, x, y, label, color) {
  const previousLevel = state.prizeLevel;
  state.score = clamp(state.score + delta, 0, GAME_CONFIG.score.max);
  state.prizeLevel = getPrizeLevel(state.score);

  state.feedback.push({
    text: label,
    x,
    y,
    vy: -45,
    age: 0,
    maxAge: 0.92,
    color,
  });

  if (state.prizeLevel > previousLevel) {
    const prize = PRIZE_LEVELS[state.prizeLevel - 1];
    state.flashMessage = `${prize.label} desbloqueado`;
    state.feedback.push({
      text: prize.prize.toUpperCase(),
      x: CENTER_X,
      y: H * 0.26,
      vy: -18,
      age: 0,
      maxAge: 1.25,
      color: prize.color,
    });
  } else if (state.prizeLevel < previousLevel) {
    state.flashMessage = "Recupera el premio con mas limpieza";
  }
}

function updatePrizeLevel() {
  state.prizeLevel = getPrizeLevel(state.score);
}

function updateMessage() {
  if (state.timeLeft <= 5) {
    state.flashMessage = "Ultimos segundos";
  } else if (state.score >= 100) {
    state.flashMessage = "Premio final asegurado";
  } else if (state.prizeLevel > 0) {
    state.flashMessage = `${getPrizeLabel(state.prizeLevel)} activo`;
  } else {
    state.flashMessage = "Limpia para llegar al primer premio";
  }
}

function getDirtShirtHit(dirt) {
  const samples = [
    { x: dirt.x, y: dirt.y },
    { x: dirt.x + dirt.radius * 0.58, y: dirt.y },
    { x: dirt.x - dirt.radius * 0.58, y: dirt.y },
    { x: dirt.x, y: dirt.y + dirt.radius * 0.58 },
    { x: dirt.x, y: dirt.y - dirt.radius * 0.58 },
    { x: dirt.x + dirt.radius * 0.42, y: dirt.y + dirt.radius * 0.42 },
    { x: dirt.x - dirt.radius * 0.42, y: dirt.y + dirt.radius * 0.42 },
    { x: dirt.x + dirt.radius * 0.42, y: dirt.y - dirt.radius * 0.42 },
    { x: dirt.x - dirt.radius * 0.42, y: dirt.y - dirt.radius * 0.42 },
  ];

  for (const sample of samples) {
    if (shirtAlphaAtWorld(sample.x, sample.y) > 36) {
      return sample;
    }
  }

  return null;
}

function syncHud() {
  canvas.style.cursor = state.mode === "playing" ? "crosshair" : "pointer";
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state.mode === "attract") {
    drawAttractScreen();
    return;
  }

  if (state.mode === "start") {
    drawStartScreen();
    return;
  }

  if (state.mode === "instructions") {
    drawInstructionsScreen();
    return;
  }

  if (state.mode === "result") {
    drawResultScreen();
    return;
  }

  drawBackground();
  drawStageGlow();
  drawShirt();
  drawStains();
  drawDirt();
  drawSplashes();
  drawBubbles();
  drawCanvasHud();
  drawSoapControls();
  drawFeedback();
  drawImpactFlash();
}

function drawBackground() {
  if (images.background.complete) {
    ctx.drawImage(images.background, 0, 0, W, H);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#145fac");
    gradient.addColorStop(0.45, "#0d4074");
    gradient.addColorStop(1, "#061934");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  const vignette = ctx.createRadialGradient(CENTER_X, H * 0.4, 80, CENTER_X, H * 0.55, H * 0.75);
  vignette.addColorStop(0, "rgba(255,255,255,0.14)");
  vignette.addColorStop(0.55, "rgba(7,46,92,0.12)");
  vignette.addColorStop(1, "rgba(2,8,18,0.54)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawAttractScreen() {
  if (!attractVideo) {
    drawStartScreen();
    return;
  }

  if (attractVideo && attractVideo.readyState >= 2) {
    drawCoverVideo(attractVideo);
  } else {
    drawBackground();
    drawFabricMotion();
    drawAttractProductScene();
  }

  ctx.save();
  const fade = 0.68 + Math.sin(state.time * 3.2) * 0.18;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 28px Trebuchet MS";
  ctx.fillText("PRESIONA UN BOTON", CENTER_X, H - 178);
  ctx.globalAlpha = fade;
  drawStartPill(CENTER_X - 145, H - 132, "←", SPRAY_CONFIG.left.color);
  drawStartPill(CENTER_X + 145, H - 132, "→", SPRAY_CONFIG.right.color);
  ctx.restore();
}

function drawCoverVideo(video) {
  const videoRatio = video.videoWidth / video.videoHeight || 9 / 16;
  const canvasRatio = W / H;
  let drawW = W;
  let drawH = H;
  let x = 0;
  let y = 0;

  if (videoRatio > canvasRatio) {
    drawH = H;
    drawW = H * videoRatio;
    x = (W - drawW) / 2;
  } else {
    drawW = W;
    drawH = W / videoRatio;
    y = (H - drawH) / 2;
  }

  ctx.drawImage(video, x, y, drawW, drawH);
  ctx.fillStyle = "rgba(2,8,18,0.24)";
  ctx.fillRect(0, 0, W, H);
}

function drawFabricMotion() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < 18; index += 1) {
    const offset = ((state.time * 38 + index * 58) % (W + 260)) - 130;
    const alpha = 0.035 + (index % 4) * 0.012;
    ctx.strokeStyle = `rgba(106,216,255,${alpha})`;
    ctx.lineWidth = 6 + (index % 3) * 2;
    ctx.beginPath();
    ctx.moveTo(offset, -40);
    ctx.bezierCurveTo(offset + 120, H * 0.32, offset - 80, H * 0.58, offset + 150, H + 50);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAttractProductScene() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 31px Trebuchet MS";
  ctx.fillText("OMO ULTRAPOWER", CENTER_X, 132);

  ctx.font = "700 60px Trebuchet MS";
  wrapTextCentered("PROTEGE TU CAMISETA", CENTER_X, 215, 610, 64);

  ctx.globalAlpha = 0.92;
  drawMiniShirt(CENTER_X, 580, 1.55);
  drawSoapBottle(CENTER_X, 1034, 0, false, 142);
  ctx.restore();
}

function drawStartScreen() {
  drawBackground();
  drawScreenShade(0.42);
  drawFabricMotion();

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 62px Trebuchet MS";
  wrapTextCentered("PROTEGE TU CAMISETA", CENTER_X, 185, 610, 68);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "600 29px Trebuchet MS";
  wrapTextCentered("Defende la camiseta de Paraguay de tierra, pasto y manchas.", CENTER_X, 350, 580, 38);

  drawMiniShirt(CENTER_X, 670, 1.5);

  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.font = "700 27px Trebuchet MS";
  ctx.fillText("Presiona izquierda o derecha para jugar", CENTER_X, 1016);
  drawStartPill(CENTER_X - 150, 1088, "←", SPRAY_CONFIG.left.color);
  drawStartPill(CENTER_X + 150, 1088, "→", SPRAY_CONFIG.right.color);
  ctx.restore();
}

function drawInstructionsScreen() {
  drawBackground();
  drawScreenShade(0.48);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 50px Trebuchet MS";
  ctx.fillText("COMO JUGAR", CENTER_X, 174);

  drawInstructionDiagram();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 30px Trebuchet MS";
  wrapTextCentered("Usa el boton del lado donde aparece la suciedad.", CENTER_X, 902, 585, 40);
  wrapTextCentered("Cada limpieza suma porcentaje. Si toca la camiseta, resta.", CENTER_X, 1002, 585, 40);

  const remaining = Math.max(1, Math.ceil(GAME_CONFIG.instructionsSeconds - state.screenTimer));
  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.font = "700 28px Trebuchet MS";
  ctx.fillText(`Empieza en ${remaining}`, CENTER_X, 1162);
  ctx.restore();
}

function drawResultScreen() {
  drawBackground();
  drawStageGlow();
  drawShirt();
  drawStains();
  drawDirt();
  drawBubbles();
  drawScreenShade(0.62);

  const level = state.finalPrizeLevel;
  const hasPrize = level > 0;
  const title = hasPrize ? `PREMIO NIVEL ${level}` : "SIN PREMIO ESTA VEZ";
  const accent = hasPrize ? PRIZE_LEVELS[level - 1].color : "#ffb486";

  ctx.save();
  const cardX = 60;
  const cardY = 242;
  const cardW = W - 120;
  const cardH = 590;

  ctx.fillStyle = "rgba(4, 18, 43, 0.82)";
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 34);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(cardX + 34, cardY + 34, 122, 10, 999);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 52px Trebuchet MS";
  wrapTextCentered(title, CENTER_X, cardY + 112, cardW - 70, 58);

  ctx.font = "700 98px Trebuchet MS";
  ctx.fillText(`${state.finalScore}%`, CENTER_X, cardY + 282);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "600 30px Trebuchet MS";
  wrapTextCentered(
    hasPrize ? state.finalPrizeLabel : "Necesita 25% para desbloquear el primer premio.",
    CENTER_X,
    cardY + 350,
    cardW - 80,
    40,
  );

  drawPrizeGrid(cardX + 34, cardY + 438, cardW - 68, level);

  const remaining = Math.max(1, Math.ceil(GAME_CONFIG.resultSeconds - state.screenTimer));
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 26px Trebuchet MS";
  ctx.fillText(`Volviendo al inicio en ${remaining}`, CENTER_X, 1110);
  ctx.restore();
}

function drawStageGlow() {
  ctx.save();
  const glow = ctx.createRadialGradient(CENTER_X, H * 0.51, 55, CENTER_X, H * 0.51, 370);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(0.45, "rgba(106,216,255,0.08)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawShirt() {
  const transform = getShirtTransform();

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);
  ctx.shadowColor = "rgba(4, 16, 43, 0.42)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 20;

  if (images.shirt.complete) {
    ctx.drawImage(
      images.shirt,
      -SHIRT_AREA.w / 2,
      -SHIRT_AREA.h / 2,
      SHIRT_AREA.w,
      SHIRT_AREA.h,
    );
  } else {
    ctx.fillStyle = "#f2f6fb";
    ctx.beginPath();
    ctx.roundRect(-175, -212, 350, 424, 42);
    ctx.fill();
  }

  ctx.restore();
}

function drawStains() {
  ctx.save();
  for (const stain of state.stainsOnShirt) {
    ctx.globalAlpha = stain.alpha;
    ctx.translate(stain.x, stain.y);
    ctx.rotate(stain.rotation);
    ctx.drawImage(stain.sprite, -stain.radius, -stain.radius, stain.radius * 2, stain.radius * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

function drawDirt() {
  for (const dirt of state.dirt) {
    ctx.save();
    ctx.translate(dirt.x, dirt.y);
    ctx.rotate(dirt.rotation);
    ctx.shadowColor = dirt.hitShirt ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.28)";
    ctx.shadowBlur = dirt.hitShirt ? 5 : 15;
    ctx.shadowOffsetY = dirt.hitShirt ? 2 : 9;
    ctx.globalAlpha = dirt.hitShirt ? 0.78 : 1;
    const size = dirt.radius * 2.75;
    ctx.drawImage(dirt.sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

function drawSplashes() {
  for (const splash of state.splashes) {
    const spray = SPRAY_CONFIG[splash.side];
    const alpha = Math.max(0, 1 - splash.age / splash.maxAge);
    const width = splash.width * (0.45 + alpha * 0.3);

    for (const lane of SPRAY_VISUAL_LANES) {
      const laneFalloff = 1 - Math.abs(lane) * 0.34;

      ctx.save();
      ctx.globalAlpha = (0.13 + alpha * 0.24) * laneFalloff;
      ctx.strokeStyle = spray.color;
      ctx.lineWidth = width * (0.38 + laneFalloff * 0.28);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawSprayCurve(spray, lane);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = (0.34 + alpha * 0.32) * laneFalloff;
      ctx.strokeStyle = "rgba(255,255,255,0.86)";
      ctx.lineWidth = 5 + laneFalloff * 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawSprayCurve(spray, lane * 0.72);
      ctx.stroke();
      ctx.restore();
    }

    for (const particle of splash.foam) {
      const particleAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = `rgba(255,255,255,${particleAlpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(139,232,255,${particleAlpha * 0.66})`;
      ctx.beginPath();
      ctx.arc(particle.x + 2, particle.y - 2, particle.radius * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBubbles() {
  ctx.save();
  for (const bubble of state.bubbles) {
    const alpha = Math.max(0, 1 - bubble.age / bubble.maxAge);
    ctx.lineWidth = Math.max(1.4, bubble.radius * 0.14);
    ctx.strokeStyle = `${bubble.color}${0.18 + alpha * 0.55})`;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + alpha * 0.14})`;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.62})`;
    ctx.beginPath();
    ctx.arc(bubble.x - bubble.radius * 0.28, bubble.y - bubble.radius * 0.32, bubble.radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCanvasHud() {
  drawScorePanel();
}

function drawScorePanel() {
  const x = 32;
  const y = 26;
  const width = W - 64;
  const height = 150;

  ctx.save();
  ctx.fillStyle = "rgba(3, 16, 39, 0.68)";
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "700 17px Trebuchet MS";
  ctx.fillText("PUNTAJE", x + 24, y + 34);
  ctx.fillText("TIEMPO", x + 248, y + 34);
  ctx.fillText("PREMIO", x + 480, y + 34);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Trebuchet MS";
  ctx.fillText(`${Math.round(state.score)}%`, x + 24, y + 72);
  ctx.fillText(`${Math.ceil(state.timeLeft)}s`, x + 248, y + 72);
  ctx.fillText(`${state.prizeLevel}/4`, x + 480, y + 72);

  drawProgressTrack(x + 68, y + 96, width - 136, 18, state.score, state.prizeLevel);
  ctx.restore();
}

function drawProgressTrack(x, y, width, height, score, prizeLevel) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 999);
  ctx.fill();

  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#58d9ff");
  gradient.addColorStop(0.34, "#70ffc1");
  gradient.addColorStop(0.67, "#ffe16f");
  gradient.addColorStop(1, "#ff5a66");

  const fillWidth = clamp(width * (score / 100), 0, width);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, fillWidth, height, 999);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  const markerY = y + height / 2;
  const labelY = y + 44;

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  for (let index = 0; index < PRIZE_LEVELS.length - 1; index += 1) {
    const dividerX = x + width * (PRIZE_LEVELS[index].threshold / 100);
    ctx.beginPath();
    ctx.moveTo(dividerX, y + 3);
    ctx.lineTo(dividerX, y + height - 3);
    ctx.stroke();
  }
  ctx.restore();

  ctx.font = "700 14px Trebuchet MS";
  ctx.textAlign = "center";
  for (let index = 0; index < PRIZE_LEVELS.length; index += 1) {
    const prize = PRIZE_LEVELS[index];
    const cx = x + width * (prize.threshold / 100);
    const labelX = clamp(cx, x + 34, x + width - 34);
    const unlocked = index < prizeLevel;

    ctx.fillStyle = "rgba(2, 12, 30, 0.48)";
    ctx.beginPath();
    ctx.arc(cx, markerY, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = unlocked ? prize.color : "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(cx, markerY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = unlocked ? "#ffffff" : "rgba(255,255,255,0.6)";
    ctx.fillText(prize.label, labelX, labelY);
  }
  ctx.textAlign = "left";
}

function drawPrizeGrid(x, y, width, level) {
  const gap = 10;
  const itemW = (width - gap * 3) / 4;
  const itemH = 86;

  for (let index = 0; index < PRIZE_LEVELS.length; index += 1) {
    const prize = PRIZE_LEVELS[index];
    const itemX = x + index * (itemW + gap);
    const unlocked = index < level;

    ctx.fillStyle = unlocked ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)";
    ctx.strokeStyle = unlocked ? prize.color : "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(itemX, y, itemW, itemH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = unlocked ? prize.color : "rgba(255,255,255,0.45)";
    ctx.font = "700 23px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(`${prize.threshold}%`, itemX + itemW / 2, y + 34);

    ctx.fillStyle = unlocked ? "#ffffff" : "rgba(255,255,255,0.56)";
    ctx.font = "700 15px Trebuchet MS";
    ctx.fillText(prize.label, itemX + itemW / 2, y + 62);
  }
}

function drawSoapControls() {
  drawSoapBottle(
    SPRAY_CONFIG.left.originX,
    SPRAY_CONFIG.left.originY + 18,
    -0.34,
    state.activeSide === "left",
    106,
  );
  drawSoapBottle(
    SPRAY_CONFIG.right.originX,
    SPRAY_CONFIG.right.originY + 18,
    0.34,
    state.activeSide === "right",
    106,
  );
}

function drawSoapBottle(x, y, rotation, active, width = 96) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  if (active) {
    ctx.shadowColor = "rgba(139, 232, 255, 0.9)";
    ctx.shadowBlur = 30;
  } else {
    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = 18;
  }
  ctx.shadowOffsetY = 10;

  if (images.omo.complete) {
    const height = width * (images.omo.naturalHeight / images.omo.naturalWidth);
    ctx.drawImage(images.omo, -width / 2, -height + 56, width, height);
  } else {
    ctx.fillStyle = "#e91f2f";
    ctx.beginPath();
    ctx.roundRect(-28, -128, 56, 148, 18);
    ctx.fill();
  }

  ctx.restore();
}

function drawInstructionDiagram() {
  ctx.save();
  drawMiniShirt(CENTER_X, 510, 1.05);
  drawSoapBottle(W * 0.18, 730, -0.24, true, 96);
  drawSoapBottle(W * 0.82, 730, 0.24, true, 96);

  ctx.strokeStyle = SPRAY_CONFIG.left.color;
  ctx.lineWidth = 28;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, 665);
  ctx.quadraticCurveTo(W * 0.34, 560, CENTER_X - 118, 520);
  ctx.stroke();

  ctx.strokeStyle = SPRAY_CONFIG.right.color;
  ctx.beginPath();
  ctx.moveTo(W * 0.8, 665);
  ctx.quadraticCurveTo(W * 0.66, 560, CENTER_X + 118, 520);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 76px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("←", W * 0.31, 760);
  ctx.fillText("→", W * 0.69, 760);
  ctx.restore();
}

function drawMiniShirt(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 18;
  if (images.shirt.complete) {
    const size = 270 * scale;
    ctx.drawImage(images.shirt, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = "#f7f7f7";
    ctx.beginPath();
    ctx.roundRect(-70 * scale, -90 * scale, 140 * scale, 180 * scale, 24 * scale);
    ctx.fill();
  }
  ctx.restore();
}

function drawStartPill(x, y, icon, color) {
  ctx.save();
  ctx.fillStyle = "rgba(5, 18, 42, 0.68)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 76, y - 42, 152, 84, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 52px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(icon, x, y + 18);
  ctx.restore();
}

function drawFeedback() {
  ctx.save();
  ctx.textAlign = "center";
  for (const item of state.feedback) {
    const alpha = Math.max(0, 1 - item.age / item.maxAge);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = item.color;
    ctx.font = "700 26px Trebuchet MS";
    ctx.fillText(item.text, item.x, item.y);
  }
  ctx.restore();
}

function drawImpactFlash() {
  if (state.impactBurst <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = state.impactBurst / 0.35;
  ctx.strokeStyle = "rgba(255, 83, 92, 0.7)";
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, W - 22, H - 22);
  ctx.restore();
}

function drawScreenShade(alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(3, 13, 29, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function wrapTextCentered(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function frame(timestamp) {
  const dt = Math.min(0.033, (timestamp - lastTimestamp) / 1000 || 0.016);
  lastTimestamp = timestamp;
  update(dt);
  draw();
  rafId = window.requestAnimationFrame(frame);
}

function init() {
  prepareShirtMask();
  syncHud();
  draw();
  rafId = window.requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", (event) => {
  if (state.mode === "result") {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  handleAction(x < CENTER_X ? "left" : "right");
});

window.addEventListener("keydown", (event) => {
  if (state.mode === "result") {
    return;
  }

  if (event.key.toLowerCase() === "f") {
    toggleFullscreen();
    return;
  }

  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    handleAction("left");
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    handleAction("right");
  }
});

window.setGameConfig = (updates = {}) => {
  const { score, ...rest } = updates;
  Object.assign(GAME_CONFIG, rest);
  if (typeof score === "object") {
    Object.assign(GAME_CONFIG.score, score);
  }
  if (state.mode === "playing") {
    state.timeLeft = Math.max(0, GAME_CONFIG.roundSeconds - state.roundElapsed);
  }
};

window.render_game_to_text = () =>
  JSON.stringify({
    coordinateSystem: "origin top-left, x to the right, y downward",
    mode: state.mode,
    inputLocked: state.mode === "result",
    scorePercent: Math.round(state.score),
    prizeLevel: state.prizeLevel,
    finalScore: state.finalScore,
    finalPrizeLevel: state.finalPrizeLevel,
    finalPrizeLabel: state.finalPrizeLabel,
    timeLeft: Number(state.timeLeft.toFixed(1)),
    roundSeconds: GAME_CONFIG.roundSeconds,
    difficulty: GAME_CONFIG.difficulty,
    idleSeconds: GAME_CONFIG.idleSeconds,
    screenTimer: Number(state.screenTimer.toFixed(2)),
    activeDirt: state.dirt.map((dirt) => ({
      kind: dirt.kind,
      side: dirt.source,
      x: Math.round(dirt.x),
      y: Math.round(dirt.y),
      stuck: dirt.hitShirt,
    })),
    stainsOnShirt: state.stainsOnShirt.length,
    sprays: state.splashes.map((splash) => ({
      side: splash.side,
      age: Number(splash.age.toFixed(2)),
      foam: splash.foam.length,
    })),
    bubbles: state.bubbles.length,
  });

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  const stepSize = ms / steps / 1000;
  for (let index = 0; index < steps; index += 1) {
    update(stepSize);
  }
  draw();
};

window.addEventListener("beforeunload", () => {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
});

init();
