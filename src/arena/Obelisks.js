import * as THREE from "three";
import { getGlowTexture } from "../utils/textures.js";

/** Dois obeliscos de pedra e cristal, de onde nasce a barreira de luz. */
export class Obelisks {
  constructor(barrierConfig) {
    this.group = new THREE.Group();
    this.crystals = [];
    this.glows = [];
    const px = barrierConfig.pillarX;
    const H = barrierConfig.pillarHeight ?? barrierConfig.height; // obeliscos altos; a rede é mais baixa

    const stone = new THREE.MeshStandardMaterial({
      color: "#34407a",
      roughness: 0.55,
      metalness: 0.2,
      flatShading: true,
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: "#4b5aa0",
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: "#ffc94d",
      emissive: "#ffb02e",
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.25,
    });

    [-1, 1].forEach((side, idx) => {
      const x = side * px;
      const hue = idx === 0 ? "#35d4ff" : "#ff4fd8";
      const crystalMat = new THREE.MeshStandardMaterial({
        color: hue,
        emissive: hue,
        emissiveIntensity: 2.4,
        roughness: 0.15,
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.92,
      });

      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.95, 0.4, 8),
        plinthMat,
      );
      plinth.position.set(x, 0.2, 0);
      plinth.castShadow = true;
      this.group.add(plinth);

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.56, H - 0.2, 6),
        stone,
      );
      shaft.position.set(x, 0.4 + (H - 0.2) / 2, 0);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      this.group.add(shaft);

      [0.9, 1.9, H - 0.2].forEach((y, i) => {
        const r = 0.5 - i * 0.07;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.06, 8, 24),
          gold,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, y, 0);
        this.group.add(ring);
      });

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.34, 0.35, 6),
        plinthMat,
      );
      cap.position.set(x, H + 0.1, 0);
      this.group.add(cap);

      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.62, 0),
        crystalMat,
      );
      crystal.scale.set(0.8, 1.6, 0.8);
      crystal.userData.baseY = H + 1.35;
      crystal.position.set(x, crystal.userData.baseY, 0);
      this.group.add(crystal);
      this.crystals.push(crystal);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color: hue,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(4.2, 4.2, 1);
      glow.position.set(x, H + 1.35, 0);
      this.group.add(glow);
      this.glows.push(glow);
    });

    // Feixe fino ligando os dois obeliscos na altura da rede (limite visível)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, px * 2 - 0.6, 6),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.5, 1.2, 1.6),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, barrierConfig.height, 0); // feixe marca o TOPO DA REDE
    this.group.add(beam);
  }

  update(time) {
    this.crystals.forEach((c, i) => {
      c.rotation.y = time * 0.9 + i * 2;
      c.position.y = c.userData.baseY + Math.sin(time * 1.4 + i * 1.7) * 0.12;
      this.glows[i].material.opacity = 0.65 + 0.2 * Math.sin(time * 2 + i);
    });
  }
}
