import * as THREE from "three";
import { mulberry32, noise3, fbm3 } from "../utils/noise.js";
import { createSoftPoints } from "../utils/softPoints.js";

// Posição na tela (NDC), distância da câmera e tamanho. Calculado para uma tela 16:9.
const LAYOUT = [
  { ndc: [-0.74, 0.6], dist: 95, radius: 9, seed: 11 },
  { ndc: [0.72, 0.5], dist: 115, radius: 11, seed: 23 },
  { ndc: [0.0, 0.8], dist: 190, radius: 17, seed: 37 },
  { ndc: [-0.93, 0.0], dist: 70, radius: 7, seed: 41 },
  { ndc: [0.93, -0.05], dist: 78, radius: 8, seed: 53 },
  { ndc: [-0.38, 0.88], dist: 150, radius: 10, seed: 67 },
  { ndc: [0.42, 0.9], dist: 210, radius: 14, seed: 71 },
];

let shared = null;
function getShared() {
  if (shared) return shared;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  shared = {
    island: std({ vertexColors: true, flatShading: true, roughness: 0.95 }),
    stone: std({ color: "#c3b5ee", roughness: 0.7, flatShading: true }),
    roofBlue: std({ color: "#3b55d9", roughness: 0.6, flatShading: true }),
    roofPink: std({ color: "#c0489f", roughness: 0.6, flatShading: true }),
    gold: std({
      color: "#ffd25e",
      emissive: "#ffa820",
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.3,
    }),
    trunk: std({ color: "#5a3d4a", roughness: 0.9 }),
    leaf: std({ color: "#ffffff", roughness: 0.8, flatShading: true }),
    window: new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 1.8, 0.7),
      fog: false,
    }),
    cyan: std({
      color: "#0b2a40",
      emissive: "#2fd0ff",
      emissiveIntensity: 2,
      flatShading: true,
    }),
    magenta: std({
      color: "#40103a",
      emissive: "#ff3fd0",
      emissiveIntensity: 2,
      flatShading: true,
    }),
    fall: new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float x = vUv.x, y = vUv.y;
          float edge = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
          float flow = y * 7.0 + uTime * 2.0;
          float streak = 0.55 + 0.45 * sin(x * 36.0 + sin(flow * 1.3 + x * 9.0) * 1.6);
          float band = 0.5 + 0.5 * sin(flow * 2.4 + x * 5.0);
          float fadeBot = smoothstep(0.0, 0.6, y);
          float alpha = edge * (0.45 + 0.55 * streak) * (0.6 + 0.4 * band) * fadeBot * 0.9;
          vec3 col = mix(vec3(0.2, 0.75, 1.0), vec3(0.9, 1.0, 1.0), streak * band * y);
          gl_FragColor = vec4(col * 1.2, alpha);
        }
      `,
    }),
  };
  return shared;
}

function buildBody(R, seed) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const D = R * 1.05,
    H = R * 0.14;
  const gA = new THREE.Color("#62c46c"),
    gB = new THREE.Color("#2f9a78"),
    soil = new THREE.Color("#6b4a4a");
  const rTop = new THREE.Color("#6d5d98"),
    rMid = new THREE.Color("#42367a"),
    rLow = new THREE.Color("#251c52");
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const ux = pos.getX(i),
      uy = pos.getY(i),
      uz = pos.getZ(i);
    const rho = Math.hypot(ux, uz);
    const dx = rho > 1e-5 ? ux / rho : 0,
      dz = rho > 1e-5 ? uz / rho : 0;
    const ang = Math.atan2(uz, ux);
    const rim =
      1 +
      0.24 *
        (noise3(
          Math.cos(ang) * 1.7 + seed,
          Math.sin(ang) * 1.7,
          seed * 0.3,
          seed,
        ) -
          0.5);
    let x, y, z;
    if (uy >= 0) {
      const r = rho * R * rim;
      x = dx * r;
      z = dz * r;
      y = H * (1 - rho * rho);
      col.copy(gA).lerp(gB, noise3(ux * 4 + seed, uz * 4, 1, seed));
    } else {
      const t = -uy;
      const nn = fbm3(
        ux * 2.2 + seed,
        uy * 2.2,
        uz * 2.2 + seed * 0.5,
        3,
        seed,
      );
      const rad =
        R *
        rim *
        Math.pow(1 - t, 0.62) *
        (1 + 0.5 * (nn - 0.5) * Math.min(1, t * 4));
      x = dx * rad;
      z = dz * rad;
      y = -D * Math.pow(t, 0.92) + (nn - 0.5) * 0.25 * D * t;
      if (t < 0.05) col.copy(gB).lerp(soil, t / 0.05);
      else
        col
          .copy(rTop)
          .lerp(rMid, Math.min(1, t * 2))
          .lerp(rLow, Math.max(0, t * 2 - 1));
      col.multiplyScalar(0.8 + nn * 0.5);
    }
    pos.setXYZ(i, x, y, z);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return { geo, H, D };
}

function buildCastle(m) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, ry = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(3.2, 3.6, 3.2), m.stone, 0, 1.8, 0);
  add(new THREE.ConeGeometry(2.5, 1.9, 4), m.roofBlue, 0, 4.55, 0, Math.PI / 4);
  add(new THREE.CylinderGeometry(0.75, 0.85, 7.5, 10), m.stone, 0, 3.75, -1.3);
  add(new THREE.ConeGeometry(1.1, 2.8, 10), m.roofPink, 0, 8.9, -1.3);
  add(new THREE.SphereGeometry(0.16, 8, 6), m.gold, 0, 10.4, -1.3);
  add(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 4), m.gold, 0, 10.9, -1.3);
  const towerGeo = new THREE.CylinderGeometry(0.55, 0.62, 3.4, 8);
  const roofGeo = new THREE.ConeGeometry(0.85, 1.6, 8);
  [
    [-2.1, 2.1],
    [2.1, 2.1],
    [-2.1, -2.1],
    [2.1, -2.1],
  ].forEach(([x, z], i) => {
    add(towerGeo, m.stone, x, 1.7, z);
    add(roofGeo, i % 2 ? m.roofPink : m.roofBlue, x, 4.2, z);
  });
  // Muralhas
  const wallGeo = new THREE.BoxGeometry(3.7, 1.6, 0.4);
  add(wallGeo, m.stone, 0, 0.8, 2.1);
  add(wallGeo, m.stone, 0, 0.8, -2.1);
  add(wallGeo, m.stone, -2.1, 0.8, 0, Math.PI / 2);
  add(wallGeo, m.stone, 2.1, 0.8, 0, Math.PI / 2);

  // Janelas quentes (instanciadas)
  const spots = [];
  [-0.8, 0.8].forEach((x) =>
    [2.1, 3.0].forEach((y) => spots.push([x, y, 1.61, 0])),
  );
  [-0.8, 0.8].forEach((z) =>
    spots.push([1.61, 2.6, z, Math.PI / 2], [-1.61, 2.6, z, Math.PI / 2]),
  );
  [-2.1, 2.1].forEach((x) => spots.push([x, 2.4, 2.1 + 0.56, 0]));
  [2.6, 4.4, 6.2].forEach((y) => spots.push([0, y, -1.3 + 0.8, 0]));
  const win = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 0.46, 0.06),
    m.window,
    spots.length,
  );
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, y, z, ry], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    m4.compose(new THREE.Vector3(x, y, z), q, s);
    win.setMatrixAt(i, m4);
  });
  g.add(win);
  return g;
}

function buildTrees(R, H, seed, m) {
  const rand = mulberry32(seed * 7);
  const n = 26;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.15, 0.9, 5),
    m.trunk,
    n,
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.8, 2.1, 6).translate(0, 1.5, 0),
    m.leaf,
    n,
  );
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    c = new THREE.Color();
  const palette = ["#2fa56a", "#3cc27a", "#1f8a78", "#ff8ad8", "#8f6bff"];
  const s = R / 9;
  for (let i = 0; i < n; i += 1) {
    const rho = 0.42 + rand() * 0.45;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * rho * R,
      z = Math.sin(a) * rho * R;
    const y = H * (1 - rho * rho);
    const k = s * (0.8 + rand() * 0.7);
    m4.compose(
      new THREE.Vector3(x, y + 0.45 * k, z),
      q,
      new THREE.Vector3(k, k, k),
    );
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(k, k, k));
    leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, c.set(palette[Math.floor(rand() * palette.length)]));
  }
  const grp = new THREE.Group();
  grp.add(trunks, leaves);
  return grp;
}

function createIsland(R, seed) {
  const m = getShared();
  const island = new THREE.Group();
  const { geo, H, D } = buildBody(R, seed);
  island.add(new THREE.Mesh(geo, m.island));

  const castle = buildCastle(m);
  castle.scale.setScalar(R / 9);
  castle.position.y = H - 0.05;
  island.add(castle);
  island.add(buildTrees(R, H, seed, m));

  // Cachoeira caindo da borda voltada para a câmera (+z local)
  const fallLen = D * 1.7;
  const fall = new THREE.Group();
  const a = 0.35 * Math.sin(seed);
  fall.position.set(
    Math.sin(a) * R * 0.94,
    H * 0.15 - fallLen / 2,
    Math.cos(a) * R * 0.94,
  );
  fall.rotation.y = a;
  const planeA = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 0.2, fallLen),
    m.fall,
  );
  const planeB = planeA.clone();
  planeB.rotation.y = Math.PI / 2;
  planeB.scale.x = 0.6;
  fall.add(planeA, planeB);
  island.add(fall);

  // Névoa na base da cachoeira
  const n = 16;
  const positions = new Float32Array(n * 3),
    colors = new Float32Array(n * 3),
    sizes = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    positions.set(
      [
        fall.position.x + (Math.random() - 0.5) * R * 0.3,
        -fallLen + H * 0.15 + Math.random() * R * 0.2,
        fall.position.z + (Math.random() - 0.5) * R * 0.3,
      ],
      i * 3,
    );
    colors.set([0.55, 0.85, 1], i * 3);
    sizes[i] = R * (0.18 + Math.random() * 0.2);
  }
  island.add(
    createSoftPoints({
      positions,
      colors,
      sizes,
      drift: [0, 0.15, 0],
      twinkle: 0.4,
      opacity: 0.35,
      sway: R * 0.05,
    }).points,
  );

  // Cristais pendurados
  const crystalGeo = new THREE.ConeGeometry((0.25 * R) / 9, (2.2 * R) / 9, 5);
  crystalGeo.translate(0, (1.1 * R) / 9, 0);
  const rand = mulberry32(seed);
  for (let i = 0; i < 5; i += 1) {
    const ang = rand() * Math.PI * 2,
      t = 0.25 + rand() * 0.45;
    const rad = R * Math.pow(1 - t, 0.62) * 0.95;
    const c = new THREE.Mesh(crystalGeo, i % 2 ? m.cyan : m.magenta);
    c.position.set(
      Math.cos(ang) * rad,
      -D * Math.pow(t, 0.92),
      Math.sin(ang) * rad,
    );
    c.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.cos(ang), -0.8, Math.sin(ang)).normalize(),
    );
    island.add(c);
  }
  return island;
}

export class FloatingIslands {
  /** `pose` = { position, target, fov } de uma câmera 16:9, para posicionar as ilhas na composição. */
  constructor(pose) {
    this.group = new THREE.Group();
    const cam = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.5, 1200);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    this.islands = [];

    LAYOUT.forEach((l, i) => {
      const dir = new THREE.Vector3(l.ndc[0], l.ndc[1], 0.5)
        .unproject(cam)
        .sub(pose.position)
        .normalize();
      const island = createIsland(l.radius, l.seed);
      island.position.copy(pose.position).addScaledVector(dir, l.dist);
      // Mantém o lado da cachoeira/castelo voltado para a câmera
      const baseRot = Math.atan2(
        pose.position.x - island.position.x,
        pose.position.z - island.position.z,
      );
      island.userData = {
        baseY: island.position.y,
        baseRot,
        phase: i * 1.9,
        amp: l.radius * 0.07,
        speed: 0.35 + (i % 3) * 0.12,
      };
      island.rotation.y = baseRot;
      this.group.add(island);
      this.islands.push(island);
    });
  }

  update(time) {
    getShared().fall.uniforms.uTime.value = time;
    this.islands.forEach((is) => {
      const u = is.userData;
      is.position.y = u.baseY + Math.sin(time * u.speed + u.phase) * u.amp;
      is.rotation.y = u.baseRot + Math.sin(time * 0.12 + u.phase) * 0.07;
    });
  }
}
