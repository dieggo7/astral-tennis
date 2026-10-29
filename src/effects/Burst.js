import * as THREE from 'three';
import { createSoftPoints } from '../utils/softPoints.js';

/**
 * Explosões de partículas redondas e suaves (pool fixo), em espaço local da arena.
 * Usadas no OUT, no quique, nas faltas e no saque perfeito.
 */
export class Burst {
  constructor(max = 200) {
    this.max = max;
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 3);
    const sizes = new Float32Array(max).fill(0.001);
    this.soft = createSoftPoints({ positions, colors, sizes, opacity: 1, twinkle: 0, sway: 0 });
    this.points = this.soft.points;
    this.points.frustumCulled = false;
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.2 }));
    this.next = 0;
    this.color = new THREE.Color();
    this.soft.geometry.attributes.aAlpha.array.fill(0);
  }

  /** opts: count, color, speed, up, life, size, gravity */
  emit(x, y, z, { count = 30, color = '#ffffff', speed = 5, up = 3, life = 0.8, size = 0.25, gravity = 9 } = {}) {
    const geo = this.soft.geometry;
    const pos = geo.attributes.position, col = geo.attributes.aColor;
    this.color.set(color);
    for (let i = 0; i < count; i += 1) {
      const idx = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const q = this.p[idx];
      q.vx = Math.cos(a) * s;
      q.vz = Math.sin(a) * s;
      q.vy = up * (0.4 + Math.random() * 0.9);
      q.life = q.max = life * (0.6 + Math.random() * 0.6);
      q.size = size * (0.6 + Math.random() * 0.8);
      q.g = gravity;
      pos.setXYZ(idx, x, y, z);
      col.setXYZ(idx, this.color.r, this.color.g, this.color.b);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  update(dt) {
    const geo = this.soft.geometry;
    const pos = geo.attributes.position, size = geo.attributes.aSize, alpha = geo.attributes.aAlpha;
    for (let i = 0; i < this.max; i += 1) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { alpha.setX(i, 0); size.setX(i, 0.001); continue; }
      q.vy -= (q.g ?? 9) * dt;
      pos.setXYZ(i, pos.getX(i) + q.vx * dt, Math.max(0.05, pos.getY(i) + q.vy * dt), pos.getZ(i) + q.vz * dt);
      const k = q.life / q.max;
      alpha.setX(i, k * k);
      size.setX(i, q.size * (0.4 + 0.6 * k));
    }
    pos.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
  }
}
