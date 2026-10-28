import * as THREE from 'three';
import { createSoftPoints } from '../utils/softPoints.js';

/**
 * Barreira de luz no lugar da rede. Tudo (a barreira e o orbe) está no mesmo
 * espaço local da arena, então `pulse(pos)` recebe a posição do orbe diretamente.
 */
export class LightBarrier {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.hitAge = 99;
    this.hitStrength = 0;
    this.hitUv = new THREE.Vector2(0.5, 0.5);
    this.orbUv = new THREE.Vector2(0.5, 0.2);
    this.prox = 0;

    const { width: W, height: H } = config;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(W, H) },
        uColA: { value: new THREE.Color(config.colorA) },
        uColB: { value: new THREE.Color(config.colorB) },
        uTint: { value: new THREE.Color('#ffffff') },
        uHitUv: { value: this.hitUv },
        uHitAge: { value: 99 },
        uHitStrength: { value: 0 },
        uOrbUv: { value: this.orbUv },
        uProx: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin(position.x * 1.7 + uTime * 1.6) * 0.05 * (0.3 + uv.y);
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorldPos = w.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uSize;
        uniform vec3 uColA;
        uniform vec3 uColB;
        uniform vec3 uTint;
        uniform vec2 uHitUv;
        uniform float uHitAge;
        uniform float uHitStrength;
        uniform vec2 uOrbUv;
        uniform float uProx;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float hexDist(vec2 p) {
          p = abs(p);
          return max(dot(p, normalize(vec2(1.0, 1.73))), p.x);
        }
        vec4 hexCoords(vec2 uv) {
          vec2 r = vec2(1.0, 1.73);
          vec2 h = r * 0.5;
          vec2 a = mod(uv, r) - h;
          vec2 b = mod(uv - h, r) - h;
          vec2 gv = dot(a, a) < dot(b, b) ? a : b;
          return vec4(gv, uv - gv);
        }

        void main() {
          vec2 world = vUv * uSize;          // em unidades de mundo
          float h = vUv.y;                   // 0 = base, 1 = topo

          // Faixa vertical: forte embaixo, quase transparente no topo
          float vert = pow(1.0 - h, 1.5) * 0.7 + 0.06;

          // Linhas de energia verticais subindo
          float flow = sin(world.x * 7.0 + sin(world.y * 1.5 + uTime * 0.8) * 1.2);
          float streak = pow(abs(flow), 18.0);
          float rise = 0.5 + 0.5 * sin(world.y * 3.0 - uTime * 2.4 + world.x * 2.0);
          float lines = streak * (0.35 + 0.65 * rise);

          // Grade hexagonal tênue com cintilação por célula
          vec4 hc = hexCoords(world * 1.1 + vec2(0.0, uTime * 0.15));
          float edge = smoothstep(0.40, 0.5, hexDist(hc.xy));
          float cellPhase = hash21(hc.zw);
          float hexGlow = edge * (0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * 1.4 + cellPhase * 6.28)));

          // Bordas: base e topo brilhantes, laterais com fade limpo
          float bottom = smoothstep(0.07, 0.0, h);
          float topEdge = smoothstep(0.93, 1.0, h);
          float side = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);

          // Fresnel
          vec3 V = normalize(cameraPosition - vWorldPos);
          float fres = pow(1.0 - abs(dot(normalize(vWorldNormal), V)), 2.0);

          // Impacto: ondas circulares a partir do ponto de acerto
          vec2 hd = (vUv - uHitUv) * uSize;
          float hdist = length(hd);
          float ripple = sin(hdist * 5.0 - uHitAge * 12.0) * exp(-hdist * 0.7) * exp(-uHitAge * 1.8) * uHitStrength;
          float hitGlow = exp(-hdist * hdist * 0.5) * exp(-uHitAge * 3.0) * uHitStrength;

          // Proximidade do orbe: brilho suave onde ele passa
          vec2 od = (vUv - uOrbUv) * uSize;
          float orbGlow = exp(-dot(od, od) * 0.35) * uProx;

          float energy = vert * 0.55 + lines * 0.5 * (0.4 + vert) + hexGlow * 0.35 * (0.3 + vert)
                       + ripple * 0.5 + hitGlow * 1.4 + orbGlow * 1.2 + bottom * 1.1 + topEdge * 0.6 + fres * 0.25;
          float alpha = clamp(energy * 0.75, 0.0, 0.85) * side;

          vec3 col = mix(uColA, uColB, smoothstep(0.05, 0.95, h));
          col = mix(col, uTint, 0.25 + orbGlow * 0.4);
          col += vec3(0.6, 0.8, 1.0) * (lines * 0.4 + hitGlow * 0.8 + bottom * 0.3);
          gl_FragColor = vec4(col * (0.4 + energy * 0.5), alpha);
        }
      `,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 32, 8), this.material);
    plane.position.y = H / 2;
    plane.renderOrder = 5;
    this.group.add(plane);

    // Faíscas subindo ao longo da barreira
    const n = 90;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const ca = new THREE.Color('#7ee8ff'), cb = new THREE.Color('#ff7be8');
    for (let i = 0; i < n; i += 1) {
      positions.set([(Math.random() - 0.5) * W, (Math.random() - 0.5) * H, (Math.random() - 0.5) * 0.3], i * 3);
      const c = i % 2 ? ca : cb;
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.08 + Math.random() * 0.12;
    }
    const sparks = createSoftPoints({ positions, colors, sizes, drift: [0, 0.6, 0], wrap: [0, H, 0], twinkle: 0.7, sway: 0.08 });
    sparks.points.position.y = H / 2;
    this.group.add(sparks.points);
  }

  /** Dispara a ondulação localizada (posição no espaço local da arena). */
  pulse(pos, strength = 1) {
    const { width: W, height: H } = this.config;
    this.hitUv.set(THREE.MathUtils.clamp(pos.x / W + 0.5, 0, 1), THREE.MathUtils.clamp(pos.y / H, 0, 1));
    this.hitAge = 0;
    this.hitStrength = strength;
  }

  setTint(color) {
    this.material.uniforms.uTint.value.copy(color);
  }

  update(time, dt, orbPos) {
    const { width: W, height: H, proximityRadius } = this.config;
    this.hitAge += dt;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uHitAge.value = this.hitAge;
    u.uHitStrength.value = this.hitStrength;
    this.orbUv.set(THREE.MathUtils.clamp(orbPos.x / W + 0.5, 0, 1), THREE.MathUtils.clamp(orbPos.y / H, 0, 1));
    this.prox = Math.max(0, 1 - Math.abs(orbPos.z) / proximityRadius);
    u.uProx.value = this.prox * this.prox;
  }
}
