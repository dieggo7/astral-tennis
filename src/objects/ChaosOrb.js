import * as THREE from 'three';
import { clamp, orbColor } from '../config/constants.js';
import { getGlowTexture, getShadowTexture } from '../utils/textures.js';
import { createSoftPoints } from '../utils/softPoints.js';

const TRAIL_LEN = 40;

/**
 * Orbe do Caos. Tudo em espaço local da arena.
 * Física só de teste: quique no chão, paredes laterais e "rebatidas" automáticas
 * nas linhas de fundo (autoRally), que aceleram o orbe e mudam a cor.
 */
export class ChaosOrb {
  constructor(config, courtConfig) {
    this.config = config;
    this.courtConfig = courtConfig;
    this.group = new THREE.Group();   // acompanha a posição do orbe
    this.shadow = null;               // sombra na quadra (adicionada separadamente)
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.color = new THREE.Color('#3da5ff');
    this.speed = config.baseSpeed;
    this.speedRatio = 0;
    this.flash = 0;
    this.bounceSpeed = Math.sqrt(2 * config.gravity * config.bounceApex);
    this.events = { bounce: false, hit: false, cross: false };
    this.accum = 0;

    const r = config.radius;
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#1a1030', emissive: '#3da5ff', emissiveIntensity: 1.6, roughness: 0.2 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), this.coreMat);
    this.group.add(this.core);

    this.rimMat = new THREE.MeshBasicMaterial({ color: '#3da5ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.2, 24, 16), this.rimMat));

    this.haloMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: '#3da5ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(r * 6);
    this.group.add(this.halo);

    this.ringMat = new THREE.MeshBasicMaterial({ color: '#3da5ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(r * 1.55, r * 0.045, 8, 48), this.ringMat);
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(r * 1.8, r * 0.035, 8, 48), this.ringMat);
    this.group.add(this.ringA, this.ringB);

    // Sombra circular projetada na quadra
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: getShadowTexture(), color: '#02040f', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.shadow.renderOrder = 2;

    // Rastro de partículas (espaço local da arena)
    const positions = new Float32Array(TRAIL_LEN * 3);
    const colors = new Float32Array(TRAIL_LEN * 3);
    const sizes = new Float32Array(TRAIL_LEN).fill(r);
    this.trail = createSoftPoints({ positions, colors, sizes, opacity: 1, twinkle: 0, sway: 0 });
    this.trailPoints = this.trail.points;
    this.history = Array.from({ length: TRAIL_LEN }, () => new THREE.Vector3());

    this.objects = [this.group, this.shadow, this.trailPoints];
    this.reset();
  }

  reset() {
    this.speed = this.config.baseSpeed;
    this.position.set(1.5, 1.4, this.courtConfig.length / 2 - 3);
    this.setHorizontalVelocity(new THREE.Vector3(-0.28, 0, -1));
    this.velocity.y = this.bounceSpeed;
    this.history.forEach((h) => h.copy(this.position));
    this.updateRatio();
    this.flash = 1;
  }

  setHorizontalVelocity(dir) {
    dir.y = 0;
    dir.normalize().multiplyScalar(this.speed);
    this.velocity.x = dir.x;
    this.velocity.z = dir.z;
  }

  /** Rebatida simulada (tecla R ou fundo da quadra): acelera e muda de cor. */
  hit() {
    this.speed = Math.min(this.speed * this.config.hitMultiplier, this.config.maxSpeed);
    this.setHorizontalVelocity(new THREE.Vector3(this.velocity.x, 0, this.velocity.z));
    this.velocity.y = this.bounceSpeed * 1.15;
    this.flash = 1;
    this.events.hit = true;
  }

  updateRatio() {
    this.speedRatio = clamp((this.speed - this.config.baseSpeed) / (this.config.maxSpeed - this.config.baseSpeed), 0, 1);
  }

  update(dt) {
    const c = this.config;
    const r = c.radius;
    const prevZ = this.position.z;

    this.velocity.y -= c.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y < r) {
      this.position.y = r;
      this.velocity.y = this.bounceSpeed;
      this.events.bounce = true;
      this.flash = Math.max(this.flash, 0.5);
    }
    const hx = this.courtConfig.width / 2 - r;
    if (Math.abs(this.position.x) > hx) {
      this.position.x = Math.sign(this.position.x) * hx;
      this.velocity.x *= -1;
    }
    const hz = this.courtConfig.length / 2 - r;
    if (Math.abs(this.position.z) > hz) {
      this.position.z = Math.sign(this.position.z) * hz;
      this.velocity.z *= -1;
      if (c.autoRally) {
        // Depois de atingir a velocidade máxima, volta ao ritmo calmo (para o teste não travar)
        if (this.speed >= c.maxSpeed * 0.98) this.speed = c.baseSpeed;
        this.velocity.x += (Math.random() - 0.5) * 3;
        this.hit();
      }
    }
    if (prevZ * this.position.z < 0) this.events.cross = true;

    this.updateRatio();
    orbColor(this.speedRatio, c, this.color);
    this.flash = Math.max(0, this.flash - dt * 3);

    // Visual
    this.group.position.copy(this.position);
    const f = this.flash;
    this.coreMat.emissive.copy(this.color);
    this.coreMat.emissiveIntensity = 1.5 + f * 1.2;
    this.rimMat.color.copy(this.color);
    this.haloMat.color.copy(this.color);
    this.ringMat.color.copy(this.color).multiplyScalar(1.5);
    this.halo.scale.setScalar(r * (4 + this.speedRatio * 2 + f * 1.5));
    this.ringA.rotation.set(1.1, performance.now() * 0.0031, 0);
    this.ringB.rotation.set(0.3, performance.now() * -0.0024, 1.2);
    this.core.scale.setScalar(1 + f * 0.12);

    // Sombra: escala com a altura, fica mais clara quando alto
    const height = Math.max(0, this.position.y - r);
    this.shadow.position.set(this.position.x, 0.03, this.position.z);
    this.shadow.scale.setScalar(r * 2.3 * (1 + height * 0.1));
    this.shadow.material.opacity = 0.85 / (1 + height * 0.35);

    // Rastro
    this.accum += dt;
    while (this.accum > 1 / 60) {
      this.accum -= 1 / 60;
      this.history.unshift(this.history.pop().copy(this.position));
    }
    const pos = this.trail.geometry.attributes.position;
    const col = this.trail.geometry.attributes.aColor;
    const size = this.trail.geometry.attributes.aSize;
    const alpha = this.trail.geometry.attributes.aAlpha;
    for (let i = 0; i < TRAIL_LEN; i += 1) {
      const k = 1 - i / TRAIL_LEN;
      pos.setXYZ(i, this.history[i].x, this.history[i].y, this.history[i].z);
      col.setXYZ(i, this.color.r, this.color.g, this.color.b);
      size.setX(i, r * (0.25 + 0.8 * k));
      alpha.setX(i, k * k * (0.35 + this.speedRatio * 0.5));
    }
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
  }

  /** Lê e zera os eventos desta passada (quique, rebatida, travessia da rede). */
  consumeEvents() {
    const e = { ...this.events };
    this.events.bounce = this.events.hit = this.events.cross = false;
    return e;
  }
}
