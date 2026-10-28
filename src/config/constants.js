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
    radius: 0.6,
    baseSpeed: 6,
    maxSpeed: 26,
    gravity: 22,
    bounceApex: 2.2,    // altura do quique
    hitMultiplier: 1.14,
    autoRally: true,    // vai e volta sozinho para testar o mapa
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
