import { clamp } from '../config/constants.js';

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1]

/**
 * Rival simples. Gera "intents" (mover, golpear, mirar) como o jogador faria.
 * Dificuldade toda em gameConfig.bot. Ele prevê onde o orbe vai quicar, ignora
 * bolas que vão sair, corre até um ponto alcançável e clica com um pequeno erro de timing.
 */
export class BotController {
  constructor(cfg, court, parryCfg) {
    this.cfg = cfg;
    this.parry = parryCfg;
    this.halfW = court.width / 2;
    this.halfL = court.length / 2;
    this.reset();
  }

  reset() {
    this.incoming = false;
    this.reaction = 0;
    this.plan = 0;
    this.target = null;
    this.willSwing = true;
    this.jitter = 0;
    this.pressed = false;
  }

  pickAim(player) {
    const c = this.cfg;
    const maxX = this.halfW - c.aimMargin;
    return {
      x: clamp(-player.x * 0.7 + (Math.random() * 2 - 1) * c.aimSpread, -maxX, maxX),
      z: 3 + Math.random() * 7,
    };
  }

  /** Mira do saque: dentro da caixa de saque diagonal (com folga das linhas). */
  serveAim(box) {
    const m = 0.8;
    return {
      x: box.xMin + m + Math.random() * (box.xMax - box.xMin - 2 * m),
      z: box.zMin + m + Math.random() * (box.zMax - box.zMin - 2 * m),
    };
  }

  moveToward(out, bot, tx, tz, k = 1) {
    const dx = tx - bot.x, dz = tz - bot.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const s = Math.min(1, d / 0.5) * k;
    out.moveX = (dx / d) * s;
    out.moveZ = (dz / d) * s;
  }

  think(dt, { bot, player, ball, rules, home }) {
    const c = this.cfg;
    const out = { moveX: 0, moveZ: 0, press: false, aimX: bot.aimX, aimZ: bot.aimZ };
    const live = rules.state === 'live' && rules.lastHitter === 'player';

    if (!live) {
      this.incoming = false;
      this.target = null;
      this.moveToward(out, bot, home[0], home[1], 0.7);
      return out;
    }

    if (!this.incoming) {            // bola nova vindo
      this.incoming = true;
      this.reaction = c.reaction * (0.8 + Math.random() * 0.5);
      this.willSwing = Math.random() >= c.missChance;
      this.jitter = gauss() * c.timingJitter;
      this.pressed = false;
      this.plan = 0;
    }

    this.reaction -= dt;
    if (this.reaction > 0) return out;

    this.plan -= dt;
    if (this.plan <= 0) {
      this.plan = 0.1;
      this.replan(bot, ball, rules);
    }
    if (!this.target) {              // vai sair: deixa passar
      this.moveToward(out, bot, home[0], home[1], 0.5);
      return out;
    }

    this.moveToward(out, bot, this.target.x, this.target.z);

    // Clique: quando o orbe está a (alcance + velocidade * tempo ideal) de distância.
    if (this.willSwing && !this.pressed && ball.z < -0.3) {
      const rx = bot.x, ry = 1.4, rz = bot.z + 0.5;
      const dx = ball.x - rx, dy = ball.y - ry, dz = ball.z - rz;
      const dist = Math.hypot(dx, dy, dz);
      const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
      const approaching = dx * ball.vx + dy * ball.vy + dz * ball.vz < 0;
      if (approaching && dist <= this.parry.reach + sp * (this.parry.sweetTime + this.jitter)) {
        const aim = this.pickAim(player);
        out.press = true;
        out.aimX = aim.x;
        out.aimZ = aim.z;
        this.pressed = true;
      }
    }
    return out;
  }

  replan(bot, ball, rules) {
    const c = this.cfg;
    const samples = ball.predict(2.5);
    const tolW = this.halfW + 0.3, tolL = this.halfL + 0.3;
    let from = 0;

    if (rules.bounces === 0) {
      const fb = samples.find((s) => s.bounce);
      if (fb && (Math.abs(fb.x) > tolW || Math.abs(fb.z) > tolL || fb.z > 0)) {
        this.target = null;          // vai cair fora/na rede: não corre atrás
        return;
      }
      from = fb ? samples.indexOf(fb) + 6 : 0; // um pouco depois do quique
    }

    const reach = this.parry.reach;
    let best = null;
    for (let i = from; i < samples.length; i += 1) {
      const s = samples[i];
      if (s.z > -1 || s.z < -(this.halfL - 0.3) || Math.abs(s.x) > this.halfW) continue;
      if (s.y < 0.5 || s.y > 2.4) continue;
      const need = Math.hypot(s.x - bot.x, s.z - bot.z) - reach * 0.7;
      const can = c.speed * Math.max(0, s.t - 0.05);
      best = s;                       // guarda o último candidato como plano B
      if (need <= can) { best = s; break; }
    }
    this.target = best
      ? {
        x: clamp(best.x + gauss() * c.positionError, -this.halfW + 0.3, this.halfW - 0.3),
        z: clamp(best.z - 0.5, -(this.halfL - 0.3), -1.2),
      }
      : null;
  }
}
