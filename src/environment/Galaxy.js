import * as THREE from 'three';

/**
 * Céu de galáxia procedural: esfera invertida que acompanha a câmera.
 * Tem conteúdo em 360° (sem vazio preto): gradiente, nebulosas fBm,
 * espiral de galáxia rodopiante e estrelas em 3 tamanhos.
 * `uIntensity` (0..1) esquenta a paleta (azul/roxo -> magenta/vermelho) e acelera a rotação.
 */
export class Galaxy {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.phase = 0;
    this.intensity = 0;

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uPhase: { value: 0 },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uDeep: { value: new THREE.Color(config.colorDeep) },
        uMid: { value: new THREE.Color(config.colorMid) },
        uGlow: { value: new THREE.Color(config.colorGlow) },
        uHot: { value: new THREE.Color(config.colorHot) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uPhase;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uGlow;
        uniform vec3 uHot;
        varying vec3 vDir;

        float hash13(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float hash(vec3 p) { return hash13(p); }
        float noise3(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) {
          float a = 0.5; float s = 0.0;
          for (int i = 0; i < 4; i++) {
            s += a * noise3(p);
            p = p * 2.03 + vec3(1.7, 9.2, 3.1);
            a *= 0.5;
          }
          return s;
        }

        // Estrelas: uma por célula 3D, em posição aleatória dentro da célula.
        float stars(vec3 dir, float scale, float density, float size, float t) {
          vec3 p = dir * scale;
          vec3 cell = floor(p);
          vec3 f = fract(p) - 0.5;
          float h = hash(cell);
          if (h < density) return 0.0;
          vec3 off = vec3(hash(cell + 7.1), hash(cell + 13.3), hash(cell + 21.7)) - 0.5;
          float d = length(f - off * 0.6);
          float tw = 0.65 + 0.35 * sin(t * (1.0 + h * 3.0) + h * 80.0);
          return smoothstep(size, 0.0, d) * tw * (0.5 + h);
        }

        void main() {
          vec3 dir = normalize(vDir);
          float heat = uIntensity;

          // Gradiente base: o que a câmera vê está "abaixo do horizonte".
          float g = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uDeep, uMid, smoothstep(0.1, 0.5, g));
          col = mix(col, uGlow, smoothstep(0.3, 0.5, g) * 0.55);
          col = mix(col, uDeep, smoothstep(0.55, 1.0, g) * 0.7);

          // Rotação lenta do campo todo.
          float c = cos(uPhase * 0.05), s = sin(uPhase * 0.05);
          vec3 rd = vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);

          // Nebulosas em duas camadas.
          float n1 = fbm(rd * 2.2 + vec3(0.0, uPhase * 0.01, 0.0));
          float n2 = fbm(rd * 3.6 + vec3(5.0, 1.0, uPhase * 0.015) + n1 * 0.8);
          vec3 coolNeb = mix(uMid * 1.6, vec3(0.15, 0.35, 1.0), 0.55);
          vec3 warmNeb = mix(uGlow * 1.5, uHot, heat * 0.85);
          col += coolNeb * smoothstep(0.42, 0.78, n1) * 0.55;
          col += warmNeb * smoothstep(0.48, 0.82, n2) * (0.45 + heat * 0.3);

          // Espiral de galáxia atrás do fundo da quadra.
          vec3 cdir = normalize(vec3(0.12, -0.2, -1.0));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cdir));
          vec3 up = cross(cdir, right);
          float w = dot(dir, cdir);
          if (w > 0.05) {
            vec2 q = vec2(dot(dir, right), dot(dir, up)) / w * 1.7;
            float r = length(q);
            float a = atan(q.y, q.x);
            float arms = sin(a * 2.0 - log(r + 0.02) * 4.5 + uPhase * 0.18);
            float arm = pow(0.5 + 0.5 * arms, 2.5) * exp(-r * 1.5);
            arm *= 0.6 + 0.8 * fbm(vec3(q * 4.0, 1.0));
            float core = exp(-r * r * 22.0);
            vec3 armCol = mix(vec3(0.4, 0.5, 1.0), uHot * 1.2, heat * 0.7 + smoothstep(0.1, 0.5, r) * 0.35);
            col += armCol * arm * 0.75;
            col += vec3(1.0, 0.8, 0.95) * core * 0.9;
            col += uGlow * exp(-r * 2.2) * 0.3;
          }

          // Estrelas em 3 tamanhos.
          float st = stars(rd, 70.0, 0.9, 0.22, uTime)
                   + stars(rd, 36.0, 0.93, 0.2, uTime) * 1.2
                   + stars(rd, 16.0, 0.95, 0.16, uTime) * 1.6;
          col += vec3(0.85, 0.9, 1.0) * st * 0.9;

          // Leve aquecimento geral conforme a bola acelera.
          col *= 0.9 + heat * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(config.radius ?? 500, 32, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.group.add(this.mesh);
  }

  update(dt, time, intensity) {
    this.intensity += (intensity - this.intensity) * (1 - Math.exp(-dt * 2.5));
    this.phase += dt * (1 + this.intensity * 3.0);
    this.material.uniforms.uPhase.value = this.phase;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uIntensity.value = this.intensity;
  }
}
