import * as THREE from "three";

// ===================== TUNING: OS VALORES MAIS AJUSTADOS =====================
// Balanceamento rápido. O resto das configurações abaixo deriva destes valores.
export const TUNING = {
  CHARACTER_HEIGHT: 2.6, // altura de referência do mago (sem a ponta do chapéu)
  NET_HEIGHT: 0.55, // altura da rede como proporção da altura do mago (0.50 a 0.60)
  BALL_RADIUS: 0.38, // raio do orbe (antes 0.6; -37%)
  ARENA_MARGIN: 3.0, // borda de pedra além das linhas (antes 1.5): é o espaço "fora"
  PERFECT_PARRY_WINDOW: 0.08, // s: tolerância do Parry perfeito em volta do instante secreto
  MAX_AIM_DEVIATION: 25, // graus: desvio máximo (timing ruim + mira extrema)
  AIM_RISK_CURVE: 2, // expoente da curva de risco por extremidade (1 = linear, 3 = só nas bordas)
  AIM_RISK_BASE: 0.08, // risco mínimo mesmo mirando no centro
  AIM_TIMING_ERROR_MAX: 0.2, // s: erro de timing que gera 100% do desvio
  SERVE_TIMEOUT: 3, // s: tempo máximo do saque antes do saque automático fraco
  SERVE_ALTERNATE_EVERY: 1, // alterna o sacador a cada N pontos (1 ou 2)
  SERVE_ATTEMPTS: 2, // saques por ponto (falta no 1º = 2º saque; falta no 2º = dupla falta)
  SERVE_TIMING_MIN: 0.45, // s: faixa ampla para variar o ritmo do minigame
  SERVE_TIMING_MAX: 1.85,
  LINE_BRIGHTNESS: 0.8, // brilho das linhas de limite da quadra (>1 faz brilhar no bloom)
  LINE_INNER_BRIGHTNESS: 0.35, // brilho das linhas internas (saque, centro)
  LINE_GLOW: 0.05, // halo aditivo em volta das linhas
};
export const NET_HEIGHT_UNITS = TUNING.NET_HEIGHT * TUNING.CHARACTER_HEIGHT;

// Court and camera dimensions are selected as a complete mode profile. Keeping
// these values together lets the renderer and simulation consume one source.
export const MODES = {
  "1v1": {
    teamSize: 1,
    court: { width: 12, length: 24, margin: 3, serviceLine: 6.2 },
    barrier: { width: 12.8, pillarX: 6.85 },
    camera: { fov: 50, elevationDeg: 33 },
    singlesLines: false,
  },
  "2v2": {
    teamSize: 2,
    court: { width: 18, length: 28, margin: 3.5, serviceLine: 7.2 },
    barrier: { width: 18.8, pillarX: 9.85 },
    camera: { fov: 54, elevationDeg: 36 },
    singlesLines: false,
  },
};

export const TWO_V_TWO = {
  TEAMMATE_MIN_DISTANCE: 1.6,
  TEAMMATE_YIELD_RADIUS: 2.5,
  BALL_BASE_SPEED_SCALE: 1.1,
  FRIENDLY_FIRE: false,
  AI_USE_ABILITIES: true,
  AI_ABILITY_CHANCE_PER_SECOND: 0.08,
  AI_ULTIMATE_CHANCE_PER_SECOND: 0.015,
  AI_STRONG_SHOT_CHANCE: 0.12,
  TEAM_HOME_X_FRACTION: 0.32,
  TEAMMATE_YIELD_SPEED_SCALE: 0.8,
  AI_ABILITY_RANGE: 9,
};

export function getModeConfig(mode = "1v1") {
  const profile = MODES[mode] || MODES["1v1"];
  const arena = structuredClone(arenaConfig);
  const game = structuredClone(gameConfig);
  Object.assign(arena.court, profile.court, {
    showSinglesLines: profile.singlesLines,
  });
  Object.assign(arena.barrier, profile.barrier);
  Object.assign(arena.camera, profile.camera);
  Object.assign(game.court, profile.court);
  if (mode === "2v2") {
    game.ball.baseSpeed *= TWO_V_TWO.BALL_BASE_SPEED_SCALE;
    game.mode = mode;
    game.teamSize = profile.teamSize;
    game.twoVTwo = { ...TWO_V_TWO };
  } else {
    game.mode = "1v1";
    game.teamSize = profile.teamSize;
  }
  return { arena, game };
}

// ===================== CONFIGURAÇÃO CENTRAL DA ARENA =====================
// Tudo que é "ajuste fino" (cores, luzes, bloom, câmera) fica aqui.
export const arenaConfig = {
  court: {
    width: 12, // largura jogável (eixo X)
    length: 24, // comprimento jogável (eixo Z)
    margin: TUNING.ARENA_MARGIN, // borda de pedra além das linhas
    serviceLine: 6.2, // distância da linha de saque até a rede
    lineBrightness: TUNING.LINE_BRIGHTNESS,
    lineInnerBrightness: TUNING.LINE_INNER_BRIGHTNESS,
    lineGlow: TUNING.LINE_GLOW,
    showSinglesLines: false, // linhas internas de simples (ligar quando houver 2v2)
    floatAmplitude: 0.1,
    floatSpeed: 0.8,
    gold: "#ffc94d",
    runeColor: [0.35, 1.1, 1.6], // cor HDR (>1 brilha no bloom)
  },
  barrier: {
    width: 12.8, // entre os obeliscos
    height: NET_HEIGHT_UNITS, // altura da rede (visual e regra)
    pillarHeight: 3.6, // altura dos obeliscos (independente da rede)
    pillarX: 6.85,
    colorA: "#35d4ff", // base
    colorB: "#c04bff", // topo
    proximityRadius: 3.0,
  },
  galaxy: {
    colorDeep: "#0a0a3c",
    colorMid: "#3a1c8f",
    colorGlow: "#9a2fd0",
    colorHot: "#ff3a5e",
  },
  orb: {
    // Só o visual do orbe. A física e as regras ficam em gameConfig (abaixo).
    radius: TUNING.BALL_RADIUS,
    baseSpeed: 13, // velocidade de saque (razão 0 da cor)
    maxSpeed: 30, // velocidade máxima do rali (razão 1 da cor)
    colorStops: [
      { t: 0.0, color: "#3da5ff" },
      { t: 0.35, color: "#9b5cff" },
      { t: 0.7, color: "#ff3df0" },
      { t: 1.0, color: "#ff2a2a" },
    ],
  },
  camera: {
    fov: 50,
    near: 0.5,
    far: 1200,
    elevationDeg: 33, // ângulo da câmera em relação ao chão
    target: [0, 0, 0.5],
    fitMargin: 0.9, // 0.9 = a quadra ocupa até 90% da tela
    parallax: 0.3,
  },
  environment: {
    shadowMapEnabled: true,
    bloomEnabled: true,
    bloomStrength: 0.45,
    bloomRadius: 0.5,
    bloomThreshold: 1.0,
    exposure: 0.95,
    hemiIntensity: 0.85,
    directionalIntensity: 2.3,
    rimMagenta: 2.0,
    rimCyan: 1.5,
    orbPointIntensity: 14,
    orbDistance: 14,
    orbDecay: 2,
    fogColor: "#2a1466",
    fogDensity: 0.0055,
  },
  debug: { debugKeys: true },
};

// ===================== CONFIGURAÇÃO DE GAMEPLAY =====================
// Tudo que é "feeling" (timing do Parry, bot, velocidades) fica aqui para ajuste rápido.
export const gameConfig = {
  winScore: 15, // 15 ou 25 pontos
  netHeight: NET_HEIGHT_UNITS, // borda inferior do orbe precisa passar acima disto
  pointPause: 1.8, // pausa depois de cada ponto (s)
  serveDelayBot: 1.1, // tempo até o bot sacar (s)
  court: {
    width: arenaConfig.court.width,
    length: arenaConfig.court.length,
    margin: arenaConfig.court.margin,
    serviceLine: arenaConfig.court.serviceLine,
    tolerance: 0.25, // linha conta como dentro
  },
  aim: {
    maxDeviation: TUNING.MAX_AIM_DEVIATION,
    maxDepthDeviation: 0.15, // erro de profundidade máximo (fração da distância) com timing/mira piores
    riskCurve: TUNING.AIM_RISK_CURVE,
    riskBase: TUNING.AIM_RISK_BASE,
    timingErrorMax: TUNING.AIM_TIMING_ERROR_MAX,
  },
  serve: {
    startDelay: 0.7, // antes do anel aparecer (o receptor se posiciona)
    perfectAtRange: [TUNING.SERVE_TIMING_MIN, TUNING.SERVE_TIMING_MAX], // instante ideal sorteado a cada saque (s desde o início do anel)
    afterPerfect: 0.5, // quanto o anel ainda contrai depois do instante ideal (fica "atrasado")
    perfectWindow: 0.09,
    goodWindow: 0.38,
    timeout: TUNING.SERVE_TIMEOUT, // total desde o início do saque; estourou = saque automático fraco
    attempts: TUNING.SERVE_ATTEMPTS,
    alternateEvery: TUNING.SERVE_ALTERNATE_EVERY,
    speedMult: { perfect: 1.5, good: 1.0, bad: 0.62 }, // perfeito também acelera o rali
    deviation: { perfect: 0, good: 0.35, bad: 1.0 }, // fração do timing-error máximo
    standX: 3.0,
    standZ: 11.2, // onde o sacador fica (x alterna entre os lados)
    receiverX: 2.6, // onde o receptor espera (no lado da caixa de saque)
  },
  ball: {
    radius: arenaConfig.orb.radius,
    baseSpeed: arenaConfig.orb.baseSpeed,
    maxSpeed: arenaConfig.orb.maxSpeed,
    hitMultiplier: 1.04, // rebatida normal acelera o rali
    perfectMultiplier: 2.0, // Parry perfeito: dobro da velocidade (limitado a maxSpeed)
    gravity: 18,
    restitution: 0.72, // quanto da velocidade vertical sobra no quique
    minBounceSpeed: 4.5,
    groundFriction: 0.9, // perda de velocidade horizontal a cada quique
  },
  parry: {
    duration: 0.34, // duração da animação/janela ativa do escudo (s)
    sweetTime: 0.12, // instante "secreto" ideal do contato, contado a partir do clique (s)
    perfectWindow: TUNING.PERFECT_PARRY_WINDOW, // tolerância em volta do sweetTime (s)
    cooldownMiss: 0.45, // recarga quando erra (evita spam de cliques)
    cooldownHit: 0.18, // recarga quando acerta
    reach: 2.1, // raio de alcance do escudo (unidades)
    swingMoveFactor: 0.5, // velocidade de movimento durante o golpe
    bufferTime: 0.12, // clique guardado se vier um pouco antes de poder golpear (s)
    hitStop: 0.07, // congelada rápida no Parry perfeito (s)
  },
  smash: {
    speedMultiplier: 2.25,
    imperfectOutChance: 0.7,
    perfectAimError: 0.2, // desvio máximo como fração da meia quadra (20%)
  },
  ignis: {
    passive: { bonusPerStack: 0.22, maxStacks: 4 },
    dash: {
      cooldown: 20,
      duration: 0.2,
      speed: 22,
      maxDistance: 4.2,
      curveWindow: 1.0,
      curveDuration: 0.28,
      curveAcceleration: 38,
    },
    meteor: {
      cooldown: 90,
      launchSpeed: 18,
      fallGravity: 34,
      impactRadius: 1.8,
      centerTolerance: 0.32,
    },
  },
  characters: {
    ignis: {
      speed: 9.5,
      perfectWindow: 0.08,
      abilityCooldown: 20,
      ultimateCooldown: 90,
    },
    glacia: {
      speed: 9.5,
      perfectWindow: 0.12,
      abilityCooldown: 20,
      ultimateCooldown: 90,
    },
    zephyr: {
      speed: 12,
      perfectWindow: 0.08,
      abilityCooldown: 20,
      ultimateCooldown: 90,
    },
    volta: {
      speed: 9.5,
      perfectWindow: 0.08,
      abilityCooldown: 20,
      ultimateCooldown: 90,
    },
  },
  glacia: { wallDuration: 5, wallZ: 6, iceDuration: 10 },
  zephyr: { gustImpulse: 10, tornadoDuration: 2, tornadoSpeed: 42 },
  volta: {
    stopDuration: 0.5,
    zigzagDuration: 0.72,
    zigzagAcceleration: 68,
    zigzagInterval: 0.09,
  },
  player: { speed: 9.5, accel: 55, minZ: 1.2, home: [0, 9.5] },
  bot: {
    speed: 6.8,
    reaction: 0.24, // atraso antes de reagir a uma bola nova (s)
    missChance: 0.08, // chance de nem tentar rebater uma bola
    timingJitter: 0.06, // erro de timing do clique (s)
    positionError: 0.7, // erro ao escolher o ponto de interceptação
    aimDeviationMult: 0.9, // multiplicador do desvio de mira do rival
    serveQuality: { perfect: 0.2, good: 0.6 }, // resto = saque ruim
    aimSpread: 4.5,
    aimMargin: 1.0, // distância mínima das linhas ao mirar
    perfectChance: 0.08, // chance de converter um Parry perfeito em perfeito de verdade
    home: [0, -9.5],
  },
};

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Cor do orbe (THREE.Color) para uma razão de velocidade 0..1. */
export function orbColor(ratio, orbConfig, target = new THREE.Color()) {
  const stops = orbConfig.colorStops;
  const r = clamp(ratio, 0, 1);
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i],
      b = stops[i + 1];
    if (r >= a.t && r <= b.t) {
      const t = (r - a.t) / (b.t - a.t);
      return target.set(a.color).lerp(new THREE.Color(b.color), t);
    }
  }
  return target.set(stops[stops.length - 1].color);
}

/** Pontos que devem sempre caber na tela (usados para enquadrar a câmera). */
export function getFitPoints(c, b) {
  const hw = c.width / 2 + c.margin;
  const hl = c.length / 2 + c.margin;
  const pts = [];
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      pts.push(new THREE.Vector3(sx * hw, -0.9, sz * hl));
      pts.push(new THREE.Vector3(sx * (hw - 0.4), 4.6, sz * (hl - 0.4))); // topo dos estandartes de canto
      pts.push(new THREE.Vector3((sx * c.width) / 2, 3.2, (sz * c.length) / 2)); // altura do orbe nos cantos
    }),
  );
  pts.push(
    new THREE.Vector3(-b.pillarX, 5.6, 0),
    new THREE.Vector3(b.pillarX, 5.6, 0),
  );
  return pts;
}
