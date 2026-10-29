import * as THREE from "three";

/**
 * Marcadores desenhados sobre a quadra (espaço local da arena):
 *  - AimMarker: mira do jogador (segue o mouse). Fica vermelha se o ponto está fora das linhas.
 *  - BounceMarks: anel que marca onde o orbe quicou (verde = dentro, vermelho = fora).
 */
export class AimMarker {
  constructor() {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 40).rotateX(-Math.PI / 2),
      this.mat,
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2),
      this.mat,
    );
    const crossGeo = new THREE.PlaneGeometry(0.1, 1.5).rotateX(-Math.PI / 2);
    const c1 = new THREE.Mesh(crossGeo, this.mat);
    const c2 = new THREE.Mesh(crossGeo, this.mat);
    c2.rotation.y = Math.PI / 2;
    this.group.add(ring, dot, c1, c2);
    this.group.position.y = 0.07;
    this.group.renderOrder = 3;
    this.in = new THREE.Color(1.6, 1.4, 0.7);
    this.out = new THREE.Color(1.8, 0.35, 0.3);
  }

  update(time, x, z, inside, visible) {
    this.group.visible = visible;
    this.group.position.set(x, 0.07, z);
    this.group.rotation.y = time * 0.8;
    this.group.scale.setScalar(1 + Math.sin(time * 5) * 0.06);
    this.mat.color.copy(inside ? this.in : this.out);
  }
}

export class BounceMarks {
  constructor(count = 6) {
    this.group = new THREE.Group();
    this.marks = Array.from({ length: count }, () => {
      const mat = new THREE.MeshBasicMaterial({
        color: "#7dffb0",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.55, 36).rotateX(-Math.PI / 2),
        mat,
      );
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
      const k = Math.min(1, m.age / 1.1);
      m.mat.opacity = k >= 1 ? 0 : (1 - k) * 0.9;
      m.mesh.scale.setScalar(1 + k * 1.4);
    });
  }
}
