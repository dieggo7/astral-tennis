import * as THREE from "three";

const flatRing = (inner, outer, seg = 48) =>
  new THREE.RingGeometry(inner, outer, seg).rotateX(-Math.PI / 2);
const addMat = (color, opacity = 0.85) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

/**
 * Marcadores desenhados sobre a quadra (espaço local da arena):
 *  - AimMarker: mira do jogador. A cor vai de claro (seguro) a vermelho (arriscado) conforme a
 *    extremidade da mira; o anel externo mostra o espalhamento típico de uma rebatida fora do
 *    timing perfeito; e a mira "treme" mais quanto maior o risco.
 *  - BounceMarks: anel que marca onde o orbe quicou (verde = dentro, vermelho = fora).
 *  - ServeBox: caixa de saque diagonal destacada.
 *  - ServeRing: anel de timing do saque (contrai até o círculo dourado).
 */
export class AimMarker {
  constructor() {
    this.group = new THREE.Group();
    this.mat = addMat("#ffffff", 0.9);
    this.spreadMat = addMat("#ffffff", 0.35);
    this.core = new THREE.Group();
    const ring = new THREE.Mesh(flatRing(0.5, 0.64, 40), this.mat);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2),
      this.mat,
    );
    const crossGeo = new THREE.PlaneGeometry(0.1, 1.5).rotateX(-Math.PI / 2);
    const c1 = new THREE.Mesh(crossGeo, this.mat);
    const c2 = new THREE.Mesh(crossGeo, this.mat);
    c2.rotation.y = Math.PI / 2;
    this.core.add(ring, dot, c1, c2);
    this.spread = new THREE.Mesh(flatRing(0.96, 1.0, 64), this.spreadMat);
    this.group.add(this.core, this.spread);
    this.group.renderOrder = 3;
    this.safe = new THREE.Color(1.5, 1.6, 1.7);
    this.mid = new THREE.Color(1.8, 1.5, 0.5);
    this.danger = new THREE.Color(1.9, 0.35, 0.3);
    this.tmp = new THREE.Color();
  }

  /** risk 0..1; spread = raio (unidades) do espalhamento típico; inside = mira dentro da área válida. */
  update(time, x, z, { inside, risk, spread, visible }) {
    this.group.visible = visible;
    if (!visible) return;
    const tremor = risk * risk * 0.22;
    this.group.position.set(
      x + (Math.random() - 0.5) * tremor,
      0.07,
      z + (Math.random() - 0.5) * tremor,
    );
    this.core.rotation.y = time * 0.8;
    this.core.scale.setScalar(1 + Math.sin(time * 5) * 0.06 + risk * 0.12);
    if (risk < 0.5) this.tmp.copy(this.safe).lerp(this.mid, risk / 0.5);
    else this.tmp.copy(this.mid).lerp(this.danger, (risk - 0.5) / 0.5);
    if (!inside) this.tmp.copy(this.danger);
    this.mat.color.copy(this.tmp);
    this.spreadMat.color.copy(this.tmp);
    this.spread.scale.setScalar(Math.max(spread, 0.001));
    this.spreadMat.opacity = spread < 0.25 ? 0 : 0.4;
  }
}

export class BounceMarks {
  constructor(count = 6) {
    this.group = new THREE.Group();
    this.marks = Array.from({ length: count }, () => {
      const mat = addMat("#7dffb0", 0);
      const mesh = new THREE.Mesh(flatRing(0.4, 0.55, 36), mat);
      mesh.position.y = 0.06;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      return { mesh, mat, age: 99 };
    });
    this.next = 0;
    this.inColor = new THREE.Color(0.5, 1.6, 0.8);
    this.outColor = new THREE.Color(1.8, 0.3, 0.3);
  }

  spawn(x, z, inside) {
    const m = this.marks[this.next];
    this.next = (this.next + 1) % this.marks.length;
    m.age = 0;
    m.mesh.position.set(x, 0.06, z);
    m.mat.color.copy(inside ? this.inColor : this.outColor);
  }

  update(dt) {
    this.marks.forEach((m) => {
      m.age += dt;
      const k = Math.min(1, m.age / 1.4);
      m.mat.opacity = k >= 1 ? 0 : (1 - k) * 0.9;
      m.mesh.scale.setScalar(1 + k * 1.4);
    });
  }
}

/** Ondas de choque rápidas para impactos de habilidade; sem pré-marcar o local de queda. */
export class ImpactWaves {
  constructor(count = 8) {
    this.group = new THREE.Group();
    this.waves = Array.from({ length: count }, () => {
      const mat = addMat(new THREE.Color(2, 0.8, 0.2), 0);
      const mesh = new THREE.Mesh(flatRing(0.82, 1, 64), mat);
      mesh.position.y = 0.09;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      return { mesh, mat, age: 99, color: new THREE.Color() };
    });
    this.next = 0;
  }

  spawn(x, z, color = "#ff9b35", startAge = 0) {
    const wave = this.waves[this.next];
    this.next = (this.next + 1) % this.waves.length;
    wave.age = startAge;
    wave.mesh.position.set(x, 0.09, z);
    wave.color.set(color);
    wave.mat.color.copy(wave.color);
  }

  update(dt) {
    for (const wave of this.waves) {
      if (wave.age > 0.8) {
        wave.mat.opacity = 0;
        continue;
      }
      wave.age += dt;
      const t = Math.min(1, wave.age / 0.8);
      wave.mesh.scale.setScalar(0.7 + t * 5.5);
      wave.mat.opacity = (1 - t) * 0.9;
    }
  }
}

/** Efeitos persistentes de gelo e vento controlados pelo estado da partida. */
export class AbilityFieldVisuals {
  constructor(court) {
    this.group = new THREE.Group();
    const wallMat = new THREE.MeshBasicMaterial({
      color: "#8beaff",
      transparent: true,
      opacity: 0.65,
      emissive: "#2bbbe8",
      emissiveIntensity: 0.8,
    });
    this.wall = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(court.width * 0.99, 5.5, 0.18),
      wallMat,
    );
    panel.position.y = 2.8;
    this.wall.add(panel);
    for (let i = 0; i < 7; i += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.8, 5),
        wallMat,
      );
      spike.position.set(
        -court.width * 0.46 + i * court.width * 0.153,
        5.75,
        0,
      );
      this.wall.add(spike);
    }
    this.wall.position.set(0, 0, 6);
    this.group.add(this.wall);

    const iceMat = new THREE.MeshBasicMaterial({
      color: "#8beaff",
      transparent: true,
      opacity: 0.17,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ice = new THREE.Mesh(
      new THREE.PlaneGeometry(court.width, court.length / 2),
      iceMat,
    );
    this.ice.rotation.x = -Math.PI / 2;
    this.ice.position.set(0, 0.075, -court.length / 4);
    this.group.add(this.ice);

    const tornadoMat = new THREE.MeshBasicMaterial({
      color: "#86fff1",
      transparent: true,
      opacity: 0.62,
      wireframe: true,
    });
    this.tornado = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 1.3, 4.8, 18, 6, true),
      tornadoMat,
    );
    this.tornado.position.y = 2.4;
    this.group.add(this.tornado);
  }

  update(effects, time) {
    this.wall.visible = effects.frostWall > 0;
    this.ice.visible = effects.iceRink > 0;
    this.tornado.visible = !!effects.tornado;
    this.tornado.rotation.y = time * 8;
    this.tornado.scale.setScalar(
      effects.tornado ? 1 + Math.sin(time * 18) * 0.08 : 1,
    );
    this.ice.material.opacity =
      effects.iceRink > 0 ? 0.15 + Math.sin(time * 7) * 0.035 : 0;
  }
}

export class ServeBox {
  constructor() {
    this.group = new THREE.Group();
    this.fillMat = addMat(new THREE.Color(0.25, 0.9, 1.1), 0.1);
    this.edgeMat = addMat(new THREE.Color(0.3, 1.0, 1.25), 0.6);
    const unit = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.fill = new THREE.Mesh(unit, this.fillMat);
    this.edges = Array.from(
      { length: 4 },
      () => new THREE.Mesh(unit, this.edgeMat),
    );
    this.group.add(this.fill, ...this.edges);
    this.group.position.y = 0.055;
    this.group.renderOrder = 2;
  }

  update(time, box, visible) {
    this.group.visible = visible && !!box;
    if (!this.group.visible) return;
    const w = box.xMax - box.xMin,
      d = box.zMax - box.zMin;
    const cx = (box.xMin + box.xMax) / 2,
      cz = (box.zMin + box.zMax) / 2;
    const t = 0.16;
    this.fill.position.set(cx, 0, cz);
    this.fill.scale.set(w, 1, d);
    const [top, bottom, left, right] = this.edges;
    top.position.set(cx, 0.005, box.zMin + t / 2);
    top.scale.set(w, 1, t);
    bottom.position.set(cx, 0.005, box.zMax - t / 2);
    bottom.scale.set(w, 1, t);
    left.position.set(box.xMin + t / 2, 0.005, cz);
    left.scale.set(t, 1, d);
    right.position.set(box.xMax - t / 2, 0.005, cz);
    right.scale.set(t, 1, d);
    const pulse = 0.75 + 0.25 * Math.sin(time * 4);
    this.fillMat.opacity = 0.07 + 0.05 * pulse;
    this.edgeMat.opacity = 0.35 + 0.25 * pulse;
  }
}

/** Anel de timing do saque: contrai e deve "encostar" no círculo dourado no instante certo. */
export class ServeRing {
  constructor() {
    this.group = new THREE.Group();
    this.targetMat = addMat(new THREE.Color(1.7, 1.3, 0.4), 0.9);
    this.ringMat = addMat(new THREE.Color(0.5, 1.4, 1.8), 0.95);
    const geo = new THREE.RingGeometry(0.93, 1, 64);
    this.target = new THREE.Mesh(geo, this.targetMat);
    this.target.scale.setScalar(0.8);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      this.ringMat,
    );
    this.group.add(this.target, this.ring);
    this.group.renderOrder = 6;
    this.startR = 3.2;
    this.targetR = 0.8;
    this.cool = new THREE.Color(0.5, 1.4, 1.8);
    this.gold = new THREE.Color(2.4, 2.0, 0.9);
    this.late = new THREE.Color(1.9, 0.35, 0.3);
    this.parentWorldQuaternion = new THREE.Quaternion();
    this.localCameraQuaternion = new THREE.Quaternion();
  }

  update(time, camera, ballPos, info, visible) {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.copy(ballPos);
    // Cancel the arena rotation so the timing ring still faces this player's camera.
    if (this.group.parent) {
      this.group.parent.getWorldQuaternion(this.parentWorldQuaternion);
      this.localCameraQuaternion.copy(this.parentWorldQuaternion).invert();
      this.group.quaternion.copy(this.localCameraQuaternion.multiply(camera.quaternion));
    } else {
      this.group.quaternion.copy(camera.quaternion);
    }
    const t = info.t;
    let radius;
    if (t <= info.perfectAt)
      radius =
        this.targetR + (this.startR - this.targetR) * (1 - t / info.perfectAt);
    else
      radius = Math.max(
        0.1,
        this.targetR *
          (1 - (t - info.perfectAt) / (info.ringDuration - info.perfectAt)),
      );
    this.ring.scale.setScalar(radius);

    const err = Math.abs(t - info.perfectAt);
    if (err <= info.perfectWindow) {
      this.ringMat.color.copy(this.gold);
      this.target.scale.setScalar(
        this.targetR * (1.08 + 0.06 * Math.sin(time * 40)),
      );
    } else if (t > info.perfectAt + info.goodWindow) {
      this.ringMat.color.copy(this.late);
      this.target.scale.setScalar(this.targetR);
    } else {
      this.ringMat.color.copy(this.cool);
      this.target.scale.setScalar(this.targetR);
    }
  }
}
