/**
 * Física do Orbe do Caos (pura, sem THREE). Espaço local da arena:
 * X = largura, Z = comprimento, Y = altura, superfície da quadra em y = 0,
 * barreira de luz em z = 0. O lado do jogador é z > 0; o do rival, z < 0.
 */
export class BallPhysics {
  constructor(cfg, court) {
    this.cfg = cfg;
    this.r = cfg.radius;
    this.slabHalfW = court.width / 2 + court.margin;
    this.slabHalfL = court.length / 2 + court.margin;
    this.reset();
  }

  reset() {
    this.x = 0; this.y = 2; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.curveAccelX = 0;
    this.curveTime = 0;
    this.zigzagTime = 0;
    this.zigzagClock = 0;
    this.zigzagInterval = 0.09;
    this.zigzagDirection = 1;
    this.speed = this.cfg.baseSpeed; // velocidade "nominal" do rali (define a cor)
    this.held = true;                // preso na mão de quem vai sacar
    this.fallen = false;             // caiu no vácuo
  }

  clone() {
    const c = Object.create(BallPhysics.prototype);
    return Object.assign(c, this);
  }

  step(dt) {
    const out = { bounce: false, bx: 0, bz: 0, net: false, netY: 0 };
    if (this.held || this.fallen) return out;
    const c = this.cfg;
    const pz = this.z;

    if (this.zigzagTime > 0) {
      this.zigzagTime = Math.max(0, this.zigzagTime - dt);
      this.zigzagClock -= dt;
      if (this.zigzagClock <= 0) {
        this.zigzagDirection *= -1;
        this.zigzagClock = this.zigzagInterval;
      }
      this.vx += this.zigzagDirection * (this.zigzagAcceleration || 68) * dt;
    }

    this.vy -= c.gravity * dt;
    const curveDt = Math.min(dt, this.curveTime);
    if (curveDt > 0) {
      this.x += this.vx * curveDt + 0.5 * this.curveAccelX * curveDt * curveDt;
      this.vx += this.curveAccelX * curveDt;
      this.curveTime -= curveDt;
      if (this.curveTime <= 0) this.curveAccelX = 0;
    }
    this.x += this.vx * (dt - curveDt);
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    // Só existe chão sobre a laje (quadra + borda de pedra). Fora dela, o orbe cai no vácuo.
    const onSlab = Math.abs(this.x) <= this.slabHalfW && Math.abs(this.z) <= this.slabHalfL;
    if (this.y <= this.r && this.vy < 0 && onSlab) {
      this.y = this.r;
      this.vy = Math.max(-this.vy * c.restitution, c.minBounceSpeed);
      this.vx *= c.groundFriction;
      this.vz *= c.groundFriction;
      this.curveAccelX = 0;
      this.curveTime = 0;
      out.bounce = true;
      out.bx = this.x;
      out.bz = this.z;
    }
    if ((pz > 0 && this.z <= 0) || (pz < 0 && this.z >= 0)) {
      out.net = true;
      out.netY = this.y;
    }
    if (this.y < -25) this.fallen = true;
    return out;
  }

  /** Prevê a trajetória sem alterar o estado real (usado pelo bot). */
  predict(maxTime = 2.5, dt = 1 / 60) {
    const s = this.clone();
    s.held = false;
    const samples = [];
    let bounces = 0;
    for (let t = dt; t <= maxTime && !s.fallen; t += dt) {
      const r = s.step(dt);
      if (r.bounce) bounces += 1;
      samples.push({ t, x: s.x, y: s.y, z: s.z, bounce: r.bounce, bounces });
    }
    return samples;
  }
}
