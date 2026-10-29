import * as THREE from "three";
import { createSoftPoints } from "../utils/softPoints.js";
import { makeCanvas } from "../utils/textures.js";

function makeLayer({
  count,
  box,
  center,
  palette,
  size,
  drift,
  twinkle,
  opacity,
  sway = 0.15,
  wrapY = true,
}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    positions.set(
      [
        (Math.random() - 0.5) * box[0],
        (Math.random() - 0.5) * box[1],
        (Math.random() - 0.5) * box[2],
      ],
      i * 3,
    );
    c.set(palette[i % palette.length]);
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = size[0] + Math.random() * (size[1] - size[0]);
  }
  const layer = createSoftPoints({
    positions,
    colors,
    sizes,
    drift,
    wrap: [box[0], wrapY ? box[1] : 0, box[2]],
    twinkle,
    opacity,
    sway,
  });
  layer.points.position.set(...center);
  return layer.points;
}

/** Poeira estelar em camadas, fagulhas de mana e raios de luz falsos. */
export class Particles {
  constructor() {
    this.group = new THREE.Group();

    // Poeira distante (dá profundidade ao fundo)
    this.group.add(
      makeLayer({
        count: 1100,
        box: [140, 70, 140],
        center: [0, 0, -15],
        palette: ["#b9a8ff", "#8fb8ff", "#ff9be8"],
        size: [0.3, 0.8],
        drift: [0.15, 0.04, 0.08],
        twinkle: 0.6,
        opacity: 0.55,
      }),
    );
    // Poeira estelar próxima à arena
    this.group.add(
      makeLayer({
        count: 260,
        box: [44, 16, 56],
        center: [0, 6, 0],
        palette: ["#dfe8ff", "#b8c8ff", "#ffd9fb"],
        size: [0.06, 0.14],
        drift: [0.05, 0.02, 0.03],
        twinkle: 0.5,
        opacity: 0.8,
      }),
    );
    // Fagulhas de mana subindo
    this.mana = makeLayer({
      count: 170,
      box: [30, 14, 40],
      center: [0, 6, 0],
      palette: ["#6fe0ff", "#ff7be8", "#ffd36a"],
      size: [0.1, 0.22],
      drift: [0, 0.7, 0],
      twinkle: 0.8,
      opacity: 0.95,
      sway: 0.3,
    });
    this.group.add(this.mana);

    // Raios de luz volumétricos falsos
    const [canvas, ctx] = makeCanvas(64, 256);
    const gv = ctx.createLinearGradient(0, 0, 0, 256);
    gv.addColorStop(0, "rgba(255,255,255,0.9)");
    gv.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, 64, 256);
    ctx.globalCompositeOperation = "destination-in";
    const gh = ctx.createLinearGradient(0, 0, 64, 0);
    gh.addColorStop(0, "rgba(0,0,0,0)");
    gh.addColorStop(0.5, "rgba(0,0,0,1)");
    gh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gh;
    ctx.fillRect(0, 0, 64, 256);
    const rayTex = new THREE.CanvasTexture(canvas);
    rayTex.colorSpace = THREE.SRGBColorSpace;

    this.rays = [];
    [
      { x: -42, y: 22, z: -90, w: 16, rot: 0.35, color: "#9a7bff", o: 0.12 },
      { x: 45, y: 22, z: -100, w: 20, rot: -0.3, color: "#ff6bd8", o: 0.1 },
      { x: 5, y: 30, z: -140, w: 26, rot: 0.1, color: "#6fb0ff", o: 0.09 },
      { x: -75, y: 18, z: -60, w: 12, rot: 0.5, color: "#6fe0ff", o: 0.08 },
    ].forEach((r, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(r.w, 110),
        new THREE.MeshBasicMaterial({
          map: rayTex,
          color: r.color,
          transparent: true,
          opacity: r.o,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      m.position.set(r.x, r.y, r.z);
      m.rotation.z = r.rot;
      m.userData = { base: r.o, phase: i * 1.7 };
      this.group.add(m);
      this.rays.push(m);
    });
  }

  update(time) {
    this.rays.forEach((m) => {
      m.material.opacity =
        m.userData.base *
        (0.75 + 0.25 * Math.sin(time * 0.4 + m.userData.phase));
    });
  }
}
