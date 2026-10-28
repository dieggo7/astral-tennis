import * as THREE from 'three';

// ===================== CONFIGURAÇÃO CENTRAL DA ARENA =====================
// Tudo que é "ajuste fino" (cores, luzes, bloom, câmera) fica aqui.
export const arenaConfig = {
  court: {
    width: 12,          // largura jogável (eixo X)
    length: 24,         // comprimento jogável (eixo Z)
    margin: 1.5,        // borda de pedra além das linhas
    floatAmplitude: 0.1,
    floatSpeed: 0.8,
    gold: '#ffc94d',
    runeColor: [0.35, 1.1, 1.6], // cor HDR (>1 brilha no bloom)
  },
  barrier: {
    width: 12.8,        // entre os obeliscos
    height: 3.6,
    pillarX: 6.85,
    colorA: '#35d4ff',  // base
    colorB: '#c04bff',  // topo
    proximityRadius: 3.0,
  },
  galaxy: {
    colorDeep: '#0a0a3c',
    colorMid: '#3a1c8f',
    colorGlow: '#9a2fd0',
    colorHot: '#ff3a5e',
  },
  orb: {
    // Só o visual do orbe. A física e as regras ficam em gameConfig (abaixo).
    radius: 0.6,
    baseSpeed: 13,      // velocidade de saque (razão 0 da cor)
    maxSpeed: 30,       // velocidade máxima do rali (razão 1 da cor)
    colorStops: [
      { t: 0.0, color: '#3da5ff' },
      { t: 0.35, color: '#9b5cff' },
      { t: 0.7, color: '#ff3df0' },
      { t: 1.0, color: '#ff2a2a' },
    ],
  },
  camera: {
    fov: 50,
    near: 0.5,
    far: 1200,
    elevationDeg: 33,   // ângulo da câmera em relação ao chão
    target: [0, 0, 0.5],
    fitMargin: 0.9,     // 0.9 = a quadra ocupa até 90% da tela
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
    fogColor: '#2a1466',
    fogDensity: 0.0055,
  },
  debug: { debugKeys: true },
};

// ===================== CONFIGURAÇÃO DE GAMEPLAY =====================
// Tudo que é "feeling" (timing do Parry, bot, velocidades) fica aqui para ajuste rápido.
export const gameConfig = {
  winScore: 15,            // 15 ou 25 pontos
  netHeight: 1.0,          // altura mínima (borda inferior do orbe) para passar pela barreira
  pointPause: 1.8,         // pausa depois de cada ponto (s)
  serveDelayBot: 1.1,      // tempo até o bot sacar (s)
  court: { width: 12, length: 24, margin: 1.5, tolerance: 0.3 }, // tolerance: linha vale como dentro
  ball: {
    radius: arenaConfig.orb.radius,
    baseSpeed: arenaConfig.orb.baseSpeed,
    maxSpeed: arenaConfig.orb.maxSpeed,
    hitMultiplier: 1.04,   // rebatida normal acelera o rali
    perfectMultiplier: 2.0,// Parry perfeito: dobro da velocidade (limitado a maxSpeed)
    gravity: 18,
    restitution: 0.72,     // quanto da velocidade vertical sobra no quique
    minBounceSpeed: 4.5,
    groundFriction: 0.9,   // perda de velocidade horizontal a cada quique
  },
  parry: {
    duration: 0.34,        // duração da animação/janela ativa do escudo (s)
    sweetTime: 0.12,       // instante "secreto" ideal do contato, contado a partir do clique (s)
    perfectWindow: 0.07,   // tolerância em volta do sweetTime para Parry perfeito (s)
    cooldownMiss: 0.45,    // recarga quando erra (evita spam de cliques)
    cooldownHit: 0.18,     // recarga quando acerta
    reach: 2.1,            // raio de alcance do escudo (unidades)
    swingMoveFactor: 0.5,  // velocidade de movimento durante o golpe
    bufferTime: 0.12,      // clique guardado se vier um pouco antes de poder golpear (s)
    scatterNormal: 1.1,    // imprecisão da rebatida normal (raio em unidades)
    scatterPerfect: 0.15,
    scatterServe: 0.6,
    hitStop: 0.07,         // congelada rápida no Parry perfeito (s)
  },
  player: { speed: 9.5, accel: 55, minZ: 1.2, home: [0, 9.5] },
  bot: {
    speed: 6.8,
    reaction: 0.24,        // atraso antes de reagir a uma bola nova (s)
    missChance: 0.08,      // chance de nem tentar rebater uma bola
    timingJitter: 0.06,    // erro de timing do clique (s)
    positionError: 0.7,    // erro ao escolher o ponto de interceptação
    scatter: 1.7,          // imprecisão da mira
    aimSpread: 4.5,
    aimMargin: 1.0,        // distância mínima das linhas ao mirar
    perfectChance: 0.08,   // chance de converter um Parry perfeito em perfeito de verdade
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
    const a = stops[i], b = stops[i + 1];
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
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
    pts.push(new THREE.Vector3(sx * hw, -0.9, sz * hl));
    pts.push(new THREE.Vector3(sx * (hw - 0.4), 4.6, sz * (hl - 0.4))); // topo dos estandartes de canto
    pts.push(new THREE.Vector3(sx * c.width / 2, 3.2, sz * c.length / 2)); // altura do orbe nos cantos
  }));
  pts.push(new THREE.Vector3(-b.pillarX, 5.6, 0), new THREE.Vector3(b.pillarX, 5.6, 0));
  return pts;
}
