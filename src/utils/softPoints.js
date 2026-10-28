import * as THREE from 'three';

/** Uniforms compartilhados por todas as nuvens de pontos (tempo e escala de tela). */
export const pointUniforms = {
  uTime: { value: 0 },
  uScale: { value: 900 },
};

export function updatePointScale(renderer, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  pointUniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uTwinkle;
  uniform float uOpacity;
  uniform float uSway;
  uniform vec3 uDrift;
  uniform vec3 uWrap;
  attribute float aSize;
  attribute float aPhase;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position + uDrift * uTime;
    float fade = 1.0;
    if (uWrap.x > 0.0) p.x = mod(p.x + uWrap.x * 0.5, uWrap.x) - uWrap.x * 0.5;
    if (uWrap.z > 0.0) p.z = mod(p.z + uWrap.z * 0.5, uWrap.z) - uWrap.z * 0.5;
    if (uWrap.y > 0.0) {
      p.y = mod(p.y + uWrap.y * 0.5, uWrap.y) - uWrap.y * 0.5;
      float ny = p.y / uWrap.y + 0.5;
      fade = smoothstep(0.0, 0.15, ny) * smoothstep(1.0, 0.85, ny);
    }
    p.x += sin(uTime * 0.6 + aPhase * 6.2831) * uSway;
    p.z += cos(uTime * 0.5 + aPhase * 5.0) * uSway;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.001), 1.0, 48.0);

    float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.5 + aPhase * 2.5) + aPhase * 40.0));
    float nearFade = smoothstep(2.0, 8.0, -mv.z);
    vAlpha = tw * uOpacity * aAlpha * fade * nearFade;
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = 1.0 - d;
    a *= a;
    float core = smoothstep(0.4, 0.0, d);
    vec3 col = vColor * (0.7 + 1.3 * core);
    gl_FragColor = vec4(col, (a * 0.8 + core * 0.5) * vAlpha);
  }
`;

/**
 * Cria Points redondos e suaves (nunca quadrados), com brilho aditivo.
 * Movimento (deriva + repetição em caixa) acontece no vertex shader.
 */
export function createSoftPoints({
  positions, colors, sizes, opacity = 1, drift = [0, 0, 0], wrap = [0, 0, 0], twinkle = 0.5, sway = 0.15,
}) {
  const count = sizes.length;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i += 1) phase[i] = ((i * 0.6180339887) % 1);
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: pointUniforms.uTime,
      uScale: pointUniforms.uScale,
      uTwinkle: { value: twinkle },
      uOpacity: { value: opacity },
      uSway: { value: sway },
      uDrift: { value: new THREE.Vector3(...drift) },
      uWrap: { value: new THREE.Vector3(...wrap) },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material };
}
