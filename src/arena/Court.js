import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, fbm3 } from "../utils/noise.js";
import { makeCanvas } from "../utils/textures.js";

const PX = 64; // pixels de textura por unidade de mundo

/** Textura de lajotas de pedra azulada cobrindo a laje inteira. */
function createStoneTexture(totalW, totalL, margin) {
  const w = Math.round(totalW * PX);
  const h = Math.round(totalL * PX);
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = mulberry32(1337);
  const tile = 2 * PX;

  ctx.fillStyle = "#2c4676";
  ctx.fillRect(0, 0, w, h);

  const ox = ((w / 2) % tile) - tile;
  const oy = ((h / 2) % tile) - tile;
  for (let y = oy; y < h; y += tile) {
    for (let x = ox; x < w; x += tile) {
      ctx.fillStyle = `hsl(${214 + (rand() - 0.5) * 10}, ${36 + rand() * 12}%, ${25 + rand() * 9}%)`;
      ctx.fillRect(x, y, tile, tile);
      ctx.fillStyle = "rgba(170,200,255,0.16)";
      ctx.fillRect(x, y, tile, 3);
      ctx.fillRect(x, y, 3, tile);
      ctx.fillStyle = "rgba(4,8,28,0.4)";
      ctx.fillRect(x, y + tile - 4, tile, 4);
      ctx.fillRect(x + tile - 4, y, 4, tile);
    }
  }

  // Granulado
  for (let i = 0; i < 22000; i += 1) {
    const light = rand() > 0.5;
    ctx.fillStyle = light
      ? `rgba(190,210,255,${rand() * 0.07})`
      : `rgba(5,10,35,${rand() * 0.12})`;
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  // Manchas suaves (variação de tom)
  for (let i = 0; i < 70; i += 1) {
    const x = rand() * w,
      y = rand() * h,
      r = 40 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rand() > 0.5 ? "120,150,255" : "10,15,50";
    g.addColorStop(0, `rgba(${c},0.07)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rachaduras sutis
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i += 1) {
    let x = rand() * w,
      y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = rand() * Math.PI * 2;
    for (let j = 0; j < 9; j += 1) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * (10 + rand() * 18);
      y += Math.sin(a) * (10 + rand() * 18);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(6,10,30,${0.3 + rand() * 0.3})`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.stroke();
  }
  // Juntas das lajotas
  ctx.strokeStyle = "#0a1330";
  ctx.lineWidth = 3;
  for (let x = ox; x < w; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = oy; y < h; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Faixa externa mais escura para a área de jogo se destacar
  const m = margin * PX;
  ctx.fillStyle = "rgba(6,10,40,0.38)";
  ctx.fillRect(0, 0, w, m);
  ctx.fillRect(0, h - m, w, m);
  ctx.fillRect(0, m, m, h - 2 * m);
  ctx.fillRect(w - m, m, m, h - 2 * m);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createRockTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry32(99);
  ctx.fillStyle = "#34406f";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i += 1) {
    ctx.fillStyle =
      rand() > 0.5
        ? `rgba(180,190,255,${rand() * 0.1})`
        : `rgba(5,5,30,${rand() * 0.18})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 4, 1 + rand() * 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Atlas de 8 runas desenhadas à mão (traços), usado nas bordas da quadra. */
function createRuneAtlas() {
  const [canvas, ctx] = makeCanvas(1024, 512);
  const rand = mulberry32(2024);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 14;
  for (let i = 0; i < 8; i += 1) {
    const cx = (i % 4) * 256 + 128;
    const cy = Math.floor(i / 4) * 256 + 128;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 80);
    ctx.lineTo(cx, cy + 80);
    for (let k = 0; k < 3; k += 1) {
      const y0 = cy - 70 + rand() * 140;
      const dir = rand() > 0.5 ? 1 : -1;
      ctx.moveTo(cx, y0);
      ctx.lineTo(cx + dir * (30 + rand() * 40), y0 + (rand() - 0.3) * 70);
    }
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, 95, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.lineWidth = 12;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Círculo mágico grande e discreto, gravado no centro de cada metade. */
function createMagicCircleTexture() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.translate(512, 512);
  ctx.strokeStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 10;
  [
    [470, 8],
    [430, 3],
    [300, 5],
    [210, 3],
  ].forEach(([r, lw]) => {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.lineWidth = 4;
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 430, Math.sin(a) * 430);
    ctx.lineTo(
      Math.cos(a) * (long ? 380 : 400),
      Math.sin(a) * (long ? 380 : 400),
    );
    ctx.stroke();
  }
  // Estrela de 8 pontas
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const r1 = 300,
      r2 = 130;
    const a2 = a + Math.PI / 8;
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
  }
  ctx.closePath();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Forma da rocha flutuante, usada tanto na malha quanto no posicionamento dos cristais. */
function rockPoint(ux, uy, uz, halfW, halfL, depth, out) {
  const t = Math.min(1, Math.max(0, -uy));
  const rho = Math.hypot(ux, uz);
  const cx = rho > 1e-5 ? ux / rho : 0;
  const cz = rho > 1e-5 ? uz / rho : 0;
  const sq =
    Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(cz), 4), 0.25) || 1;
  const n = fbm3(ux * 2.4 + 3, uy * 2.4, uz * 2.4, 3, 5);
  const radial =
    Math.pow(1 - t, 0.6) * (1 + 0.28 * (n - 0.5) * 2 * Math.min(1, t * 4));
  out.set(
    (cx / sq) * halfW * radial,
    -1.15 - depth * Math.pow(t, 0.9) + (n - 0.5) * 1.4 * t,
    (cz / sq) * halfL * radial,
  );
  return out;
}

export class Court {
  constructor(config) {
    this.config = config;
    this.group = new THREE.Group();
    this.rand = mulberry32(7);

    const W = config.width,
      L = config.length,
      M = config.margin;
    const totalW = W + 2 * M,
      totalL = L + 2 * M;
    this.totalW = totalW;
    this.totalL = totalL;

    this.bounds = { minX: -W / 2, maxX: W / 2, minZ: -L / 2, maxZ: L / 2 };

    this.buildSlab(totalW, totalL, M);
    this.buildGoldLines(config);
    this.buildRunes(config);
    this.buildUnderside(totalW, totalL);
  }

  buildSlab(totalW, totalL, M) {
    const topMat = new THREE.MeshStandardMaterial({
      map: createStoneTexture(totalW, totalL, M),
      roughness: 0.62,
      metalness: 0.08,
    });
    topMat.bumpMap = topMat.map;
    topMat.bumpScale = 1.2;

    const rockTex = createRockTexture();
    rockTex.repeat.set(6, 1);
    const sideMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: "#8a95c8",
      roughness: 0.85,
    });
    const lowMat = new THREE.MeshStandardMaterial({
      color: "#2a3568",
      roughness: 0.9,
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(totalW, 0.5, totalL), [
      sideMat,
      sideMat,
      topMat,
      sideMat,
      sideMat,
      sideMat,
    ]);
    top.position.y = -0.25;
    top.receiveShadow = true;
    this.group.add(top);

    const mid = new THREE.Mesh(
      new THREE.BoxGeometry(totalW - 0.9, 0.7, totalL - 0.9),
      lowMat,
    );
    mid.position.y = -0.85;
    this.group.add(mid);

    // Moldura de pedra clara com friso dourado
    const rimMat = new THREE.MeshStandardMaterial({
      color: "#7f97cc",
      roughness: 0.5,
      metalness: 0.12,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: this.config.gold,
      emissive: this.config.gold,
      emissiveIntensity: 0.85,
      metalness: 0.6,
      roughness: 0.3,
    });
    this.goldMat = goldMat;
    const addBox = (mat, sx, sy, sz, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.group.add(m);
    };
    const rimT = 0.4,
      rimH = 0.2;
    addBox(rimMat, rimT, rimH, totalL, -(totalW / 2 - rimT / 2), rimH / 2, 0);
    addBox(rimMat, rimT, rimH, totalL, totalW / 2 - rimT / 2, rimH / 2, 0);
    addBox(
      rimMat,
      totalW - 2 * rimT,
      rimH,
      rimT,
      0,
      rimH / 2,
      -(totalL / 2 - rimT / 2),
    );
    addBox(
      rimMat,
      totalW - 2 * rimT,
      rimH,
      rimT,
      0,
      rimH / 2,
      totalL / 2 - rimT / 2,
    );
    const inW = totalW / 2 - rimT - 0.03,
      inL = totalL / 2 - rimT - 0.03;
    addBox(goldMat, 0.06, 0.24, totalL - 2 * rimT, -inW, 0.12, 0, false);
    addBox(goldMat, 0.06, 0.24, totalL - 2 * rimT, inW, 0.12, 0, false);
    addBox(goldMat, totalW - 2 * rimT, 0.24, 0.06, 0, 0.12, -inL, false);
    addBox(goldMat, totalW - 2 * rimT, 0.24, 0.06, 0, 0.12, inL, false);

    // Pinos dourados nos cantos
    const studGeo = new THREE.OctahedronGeometry(0.3, 0);
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sz) => {
        const s = new THREE.Mesh(studGeo, goldMat);
        s.scale.set(1, 1.5, 1);
        s.position.set(sx * (totalW / 2 - 0.2), 0.45, sz * (totalL / 2 - 0.2));
        this.group.add(s);
      }),
    );
  }

  buildGoldLines(c) {
    const W = c.width,
      L = c.length;
    const hx = W / 2,
      hz = L / 2;
    const single = hx - 1.5,
      service = c.serviceLine ?? 6.2;
    const sw = c.showSinglesLines ? single : hx; // largura das caixas de saque

    // Linhas que DEFINEM dentro/fora (bem fortes, brilham no bloom) e linhas internas (mais discretas).
    const boundary = [],
      inner = [],
      glow = [];
    const addTo = (list, cx, cz, sx, sz, h, glowPad) => {
      const g = new THREE.BoxGeometry(sx, h, sz);
      g.translate(cx, h / 2, cz);
      list.push(g);
      const gg = new THREE.BoxGeometry(
        sx + (sx > sz ? 0 : glowPad),
        0.01,
        sz + (sz > sx ? 0 : glowPad),
      );
      gg.translate(cx, 0.008, cz);
      glow.push(gg);
    };
    const bw = 0.2; // espessura das linhas de limite
    const iw = 0.14;
    addTo(boundary, 0, -hz, W + bw, bw, 0.05, 0.6); // linhas de fundo
    addTo(boundary, 0, hz, W + bw, bw, 0.05, 0.6);
    addTo(boundary, -hx, 0, bw, L, 0.05, 0.6); // laterais
    addTo(boundary, hx, 0, bw, L, 0.05, 0.6);
    if (c.showSinglesLines) {
      addTo(inner, -single, 0, iw, L, 0.04, 0.4);
      addTo(inner, single, 0, iw, L, 0.04, 0.4);
    }
    addTo(inner, 0, -service, sw * 2, iw, 0.04, 0.4); // linhas de saque
    addTo(inner, 0, service, sw * 2, iw, 0.04, 0.4);
    addTo(inner, 0, 0, iw, service * 2, 0.04, 0.4); // saque central
    addTo(inner, 0, -hz + 0.35, iw, 0.7, 0.04, 0.4); // marcas centrais
    addTo(inner, 0, hz - 0.35, iw, 0.7, 0.04, 0.4);
    addTo(inner, 0, 0, W + iw, 0.22, 0.04, 0.4); // linha da rede (no chão)

    const boundaryMat = new THREE.MeshStandardMaterial({
      color: this.config.gold,
      emissive: new THREE.Color(this.config.gold),
      emissiveIntensity: c.lineBrightness ?? 0.8,
      metalness: 0.5,
      roughness: 0.3,
    });
    this.boundaryMat = boundaryMat;
    const lines = new THREE.Mesh(mergeGeometries(boundary), boundaryMat);
    lines.receiveShadow = true;
    this.group.add(lines);
    const innerMat = new THREE.MeshStandardMaterial({
      color: this.config.gold,
      emissive: new THREE.Color(this.config.gold),
      emissiveIntensity: c.lineInnerBrightness ?? 0.35,
      metalness: 0.4,
      roughness: 0.4,
    });
    const inLines = new THREE.Mesh(mergeGeometries(inner), innerMat);
    inLines.receiveShadow = true;
    this.group.add(inLines);

    const glowMat = new THREE.MeshBasicMaterial({
      color: this.config.gold,
      transparent: true,
      opacity: c.lineGlow ?? 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.Mesh(mergeGeometries(glow), glowMat));
  }

  buildRunes(c) {
    const atlas = createRuneAtlas();
    this.runeMats = [0, 1, 2].map(() => {
      const m = new THREE.MeshBasicMaterial({
        map: atlas,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.7,
      });
      m.color.setRGB(...c.runeColor);
      return m;
    });
    const geos = [];
    for (let i = 0; i < 8; i += 1) {
      const g = new THREE.PlaneGeometry(0.7, 0.7);
      const uv = g.attributes.uv;
      const u0 = (i % 4) / 4,
        v0 = 0.5 - Math.floor(i / 4) * 0.5;
      for (let k = 0; k < uv.count; k += 1)
        uv.setXY(k, u0 + uv.getX(k) * 0.25, v0 + uv.getY(k) * 0.5);
      g.rotateX(-Math.PI / 2);
      geos.push(g);
    }
    let n = 0;
    const put = (x, z) => {
      const m = new THREE.Mesh(geos[n % 8], this.runeMats[n % 3]);
      m.position.set(x, 0.02, z);
      m.rotation.y = ((n * 7) % 4) * 0.0;
      this.group.add(m);
      n += 1;
    };
    const sx = c.width / 2 + 0.65;
    for (let z = -10.8; z <= 10.9; z += 2.4) {
      put(-sx, z);
      put(sx, z);
    }
    const sz = c.length / 2 + 0.7;
    for (let x = -4.8; x <= 4.9; x += 2.4) {
      put(x, -sz);
      put(x, sz);
    }

    const circleTex = createMagicCircleTexture();
    this.circleMat = new THREE.MeshBasicMaterial({
      map: circleTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.22,
    });
    this.circleMat.color.setRGB(0.25, 0.7, 1.4);
    this.circles = [-1, 1].map((s) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(8.4, 8.4).rotateX(-Math.PI / 2),
        this.circleMat,
      );
      m.position.set(0, 0.015, s * 7.8);
      this.group.add(m);
      return m;
    });
  }

  buildUnderside(totalW, totalL) {
    const halfW = ((totalW - 0.9) / 2) * 0.98;
    const halfL = ((totalL - 0.9) / 2) * 0.98;
    const depth = 7.5;
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    const top = new THREE.Color("#4a5f9c"),
      mid = new THREE.Color("#36417c"),
      low = new THREE.Color("#2a1f58");
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const ux = pos.getX(i);
      const uy = Math.min(pos.getY(i), 0);
      const uz = pos.getZ(i);
      rockPoint(ux, uy, uz, halfW, halfL, depth, v);
      if (pos.getY(i) > 0) v.y = -1.15;
      pos.setXYZ(i, v.x, v.y, v.z);
      const t = -uy;
      const n = fbm3(ux * 5, uy * 5, uz * 5, 2, 9);
      col
        .copy(top)
        .lerp(mid, Math.min(1, t * 2))
        .lerp(low, Math.max(0, t * 2 - 1));
      col.multiplyScalar(0.8 + n * 0.5);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.9,
      }),
    );
    this.group.add(rock);

    // Cristais luminosos crescendo da rocha
    const cyanMat = new THREE.MeshStandardMaterial({
      color: "#0b2a40",
      emissive: "#2fd0ff",
      emissiveIntensity: 2,
      roughness: 0.3,
      flatShading: true,
    });
    const magMat = new THREE.MeshStandardMaterial({
      color: "#40103a",
      emissive: "#ff3fd0",
      emissiveIntensity: 2,
      roughness: 0.3,
      flatShading: true,
    });
    this.crystalMats = [cyanMat, magMat];
    const crystalGeo = new THREE.ConeGeometry(0.22, 1.5, 5);
    crystalGeo.translate(0, 0.75, 0);
    const meshes = [
      new THREE.InstancedMesh(crystalGeo, cyanMat, 14),
      new THREE.InstancedMesh(crystalGeo, magMat, 14),
    ];
    const q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      nrm = new THREE.Vector3(),
      m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    meshes.forEach((mesh, mi) => {
      for (let i = 0; i < 14; i += 1) {
        const a = this.rand() * Math.PI * 2;
        const t = 0.12 + this.rand() * 0.65;
        const uy = -t;
        const r = Math.sqrt(1 - uy * uy);
        rockPoint(Math.cos(a) * r, uy, Math.sin(a) * r, halfW, halfL, depth, p);
        nrm.set(Math.cos(a), -0.35, Math.sin(a)).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
        const k = 0.5 + this.rand() * 0.9;
        s.set(k, k, k);
        m4.compose(p.addScaledVector(nrm, -0.1), q, s);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    });

    // Pedaços de rocha soltos orbitando devagar
    const debrisMat = new THREE.MeshStandardMaterial({
      color: "#3b4682",
      flatShading: true,
      roughness: 0.9,
    });
    this.debris = [];
    for (let i = 0; i < 10; i += 1) {
      const d = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.25 + this.rand() * 0.5, 0),
        debrisMat,
      );
      d.userData = {
        a: this.rand() * Math.PI * 2,
        rx: halfW + 1 + this.rand() * 3,
        rz: halfL * 0.5 + 2 + this.rand() * 4,
        y: -2 - this.rand() * 7,
        speed: 0.05 + this.rand() * 0.07,
        phase: this.rand() * 6,
      };
      this.group.add(d);
      this.debris.push(d);
    }
  }

  update(time) {
    this.runeMats.forEach((m, i) => {
      m.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 0.9 + i * 2.1));
    });
    this.circleMat.opacity = 0.16 + 0.1 * Math.sin(time * 0.7);
    this.circles.forEach((c, i) => {
      c.rotation.y = time * 0.08 * (i ? 1 : -1);
    });
    this.crystalMats.forEach((m, i) => {
      m.emissiveIntensity = 1.9 + 0.5 * Math.sin(time * 1.3 + i * 2);
    });
    this.debris.forEach((d) => {
      const u = d.userData;
      const a = u.a + time * u.speed;
      d.position.set(
        Math.cos(a) * u.rx,
        u.y + Math.sin(time * 0.6 + u.phase) * 0.35,
        Math.sin(a) * u.rz,
      );
      d.rotation.set(time * 0.2 + u.phase, time * 0.15, 0);
    });
  }
}
