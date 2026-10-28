import { BallPhysics } from './BallPhysics.js';
import { Rules, PLAYER, BOT, sideSign, other } from './Rules.js';
import { MatchState } from './MatchState.js';
import { Parry } from './Parry.js';
import { BotController } from '../input/BotController.js';

const STEP = 1 / 120;            // passo fixo da simulação
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/**
 * Orquestra a partida (pura, sem THREE): fases, movimento, saque, contato do Parry,
 * regras e placar. Recebe intents como dados e devolve eventos para o jogo desenhar.
 *
 * Fases: 'ready' (aguardando clique) -> 'serve' -> 'rally' -> 'point' -> 'serve' ... -> 'over'
 */
export class Match {
  constructor(cfg) {
    this.cfg = cfg;
    this.court = cfg.court;
    this.halfW = cfg.court.width / 2;
    this.halfL = cfg.court.length / 2;
    this.ball = new BallPhysics(cfg.ball, cfg.court);
    this.rules = new Rules(cfg.court, cfg.netHeight + cfg.ball.radius);
    this.state = new MatchState(cfg.winScore);
    this.bot = new BotController(cfg.bot, cfg.court, cfg.parry);
    this.fighters = {
      [PLAYER]: this.makeFighter(PLAYER),
      [BOT]: this.makeFighter(BOT),
    };
    this.events = [];
    this.acc = 0;
    this.time = 0;
    this.phase = 'ready';
    this.phaseTime = 0;
    this.intent = { moveX: 0, moveZ: 0, aimX: 0, aimZ: -6 };
    this.resetFighters();
    this.placeHeldBall();
  }

  makeFighter(id) {
    const sign = sideSign(id);
    return {
      id, sign,
      x: 0, z: 0, vx: 0, vz: 0,
      yaw: sign > 0 ? Math.PI : 0,
      parry: new Parry(this.cfg.parry),
      buffer: 0,
      animT: -1,                     // tempo desde o início do golpe (-1 = sem golpe)
      animDur: this.cfg.parry.duration,
      aimX: 0, aimZ: -sign * 6,
      mood: 'idle',                  // 'idle' | 'win' | 'lose'
    };
  }

  home(id) {
    return id === PLAYER ? this.cfg.player.home : this.cfg.bot.home;
  }

  resetFighters() {
    [PLAYER, BOT].forEach((id) => {
      const f = this.fighters[id];
      const h = this.home(id);
      f.x = h[0]; f.z = h[1]; f.vx = f.vz = 0;
      f.yaw = f.sign > 0 ? Math.PI : 0;
      f.parry.reset(); f.buffer = 0; f.animT = -1; f.mood = 'idle';
      f.aimX = 0; f.aimZ = -f.sign * 6;
    });
  }

  // ---------------------------------------------------------------- ciclo de vida
  start() {
    this.state.reset(PLAYER);
    this.bot.reset();
    this.resetFighters();
    this.beginServe();
    this.events.push({ type: 'start' });
  }

  restart() {
    this.start();
  }

  beginServe() {
    this.phase = 'serve';
    this.phaseTime = 0;
    this.rules.newPoint();
    this.ball.reset();
    this.fighters[PLAYER].buffer = 0;
    this.placeHeldBall();
    this.events.push({ type: 'serveReady', server: this.state.server });
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- atualização
  /** dt variável do frame; intent do jogador = { moveX, moveZ, press, aimX, aimZ }. */
  update(dt, intent) {
    const p = this.fighters[PLAYER];
    this.intent.moveX = intent.moveX;
    this.intent.moveZ = intent.moveZ;
    p.aimX = intent.aimX;
    p.aimZ = intent.aimZ;
    if (intent.press) p.buffer = this.cfg.parry.bufferTime;

    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  step(dt) {
    this.time += dt;
    this.phaseTime += dt;
    const cfg = this.cfg;
    const player = this.fighters[PLAYER];
    const bot = this.fighters[BOT];

    // --- intents
    const walkingHome = this.phase === 'point';
    let pm = this.intent;
    let bi = { moveX: 0, moveZ: 0, press: false, aimX: bot.aimX, aimZ: bot.aimZ };
    if (this.phase === 'rally' || this.phase === 'serve') {
      bi = this.bot.think(dt, { bot, player, ball: this.ball, rules: this.rules });
    }
    if (walkingHome) {
      pm = this.homeIntent(player);
      bi = { ...this.homeIntent(bot), press: false, aimX: bot.aimX, aimZ: bot.aimZ };
    }

    this.moveFighter(player, pm.moveX, pm.moveZ, dt, cfg.player.speed);
    this.moveFighter(bot, bi.moveX, bi.moveZ, dt, cfg.bot.speed);
    bot.aimX = bi.aimX; bot.aimZ = bi.aimZ;
    this.faceTargets(player, bot, dt);

    // --- saque
    if (this.phase === 'serve') {
      const server = this.fighters[this.state.server];
      if (server.id === PLAYER && player.buffer > 0) {
        player.buffer = 0;
        this.serve(player, player.aimX, player.aimZ);
      } else if (server.id === BOT && this.phaseTime >= cfg.serveDelayBot) {
        const a = this.bot.serveAim();
        this.serve(bot, a.x, a.z);
      }
    }

    // --- golpes (Parry)
    if (player.buffer > 0) {
      if (player.parry.press()) { player.buffer = 0; this.startSwing(player); }
      else player.buffer -= dt;
    }
    if (bi.press && bot.parry.press()) this.startSwing(bot);

    [player, bot].forEach((f) => {
      const r = f.parry.update(dt);
      if (r === 'whiff') this.events.push({ type: 'whiff', who: f.id });
      if (f.animT >= 0) {
        f.animT += dt;
        if (f.animT > f.animDur) f.animT = -1;
      }
    });

    // --- orbe
    if (this.phase === 'serve' || this.phase === 'ready') {
      this.placeHeldBall();
    } else {
      this.stepBall(dt);
    }

    // --- fim da pausa de ponto
    if (this.phase === 'point' && this.phaseTime >= cfg.pointPause) {
      if (this.state.over) {
        this.phase = 'over';
        this.phaseTime = 0;
        this.events.push({ type: 'matchOver', winner: this.state.winner, score: { ...this.state.score } });
      } else {
        this.resetFighters();
        this.beginServe();
      }
    }
  }

  homeIntent(f) {
    const h = this.home(f.id);
    const dx = h[0] - f.x, dz = h[1] - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) return { moveX: 0, moveZ: 0 };
    const k = Math.min(1, d / 0.8);
    return { moveX: (dx / d) * k, moveZ: (dz / d) * k };
  }

  moveFighter(f, mx, mz, dt, speed) {
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const k = f.parry.swinging ? this.cfg.parry.swingMoveFactor : 1;
    const a = this.cfg.player.accel * dt;
    f.vx += clamp(mx * speed * k - f.vx, -a, a);
    f.vz += clamp(mz * speed * k - f.vz, -a, a);
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    const maxX = this.halfW - 0.3;
    const minZ = this.cfg.player.minZ, maxZ = this.halfL - 0.3;
    if (f.x > maxX || f.x < -maxX) { f.x = clamp(f.x, -maxX, maxX); f.vx = 0; }
    const zLo = f.sign > 0 ? minZ : -maxZ;
    const zHi = f.sign > 0 ? maxZ : -minZ;
    if (f.z < zLo || f.z > zHi) { f.z = clamp(f.z, zLo, zHi); f.vz = 0; }
  }

  faceTargets(player, bot, dt) {
    const turn = (f, tx, tz) => {
      const target = Math.atan2(tx - f.x, tz - f.z);
      let d = target - f.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.yaw += d * Math.min(1, dt * 14);
    };
    turn(player, player.aimX, player.aimZ);
    if (this.rules.state === 'live' && this.rules.lastHitter === PLAYER) turn(bot, this.ball.x, this.ball.z);
    else turn(bot, player.x, player.z);
  }

  startSwing(f) {
    f.animT = 0;
    f.animDur = this.cfg.parry.duration;
    this.events.push({ type: 'swing', who: f.id });
  }

  placeHeldBall() {
    const b = this.ball;
    const s = this.fighters[this.state.server];
    b.x = s.x;
    b.z = s.z - s.sign * 0.6;
    b.y = 1.7 + Math.sin(this.time * 3) * 0.08;
    b.vx = b.vy = b.vz = 0;
  }

  // ---------------------------------------------------------------- saque e rebatida
  serve(f, aimX, aimZ) {
    this.phase = 'rally';
    this.phaseTime = 0;
    this.startSwing(f);
    this.ball.speed = this.cfg.ball.baseSpeed;
    this.shoot(f, aimX, aimZ, 'normal', true);
    this.events.push({ type: 'serve', who: f.id });
  }

  /**
   * Lança o orbe de onde ele está até o alvo (aimX, aimZ) por uma parábola exata.
   * A velocidade do rali define o tempo de voo; se a parábola bateria na barreira,
   * o voo fica mais lento/alto (lob) o suficiente para passar por cima.
   */
  shoot(f, aimX, aimZ, quality, isServe) {
    const b = this.ball, bc = this.cfg.ball, pc = this.cfg.parry;
    const r = bc.radius, g = bc.gravity;

    if (!isServe) {
      b.speed = quality === 'perfect'
        ? Math.min(b.speed * bc.perfectMultiplier, bc.maxSpeed)
        : Math.min(b.speed * bc.hitMultiplier, bc.maxSpeed);
    }

    const scatter = isServe ? pc.scatterServe
      : f.id === BOT ? this.cfg.bot.scatter
        : quality === 'perfect' ? pc.scatterPerfect : pc.scatterNormal;
    const ang = Math.random() * TAU;
    const rad = Math.sqrt(Math.random()) * scatter;
    const tx = aimX + Math.cos(ang) * rad;
    let tz = aimZ + Math.sin(ang) * rad;
    tz = f.sign > 0 ? Math.min(tz, -0.8) : Math.max(tz, 0.8); // sempre rumo à outra metade

    const y0 = Math.max(b.y, r + 0.05);
    const dx = tx - b.x, dz = tz - b.z;
    const D = Math.hypot(dx, dz);
    let T = Math.max(D / b.speed, 0.25);

    // Tempo mínimo de voo para o orbe passar por cima da barreira (z = 0).
    const fr = clamp(Math.abs(b.z) / Math.abs(dz), 0.03, 0.97);
    const N = this.cfg.netHeight + r;
    const need = (N - y0 * (1 - fr) - fr * r) * 1.15;
    if (need > 0) T = Math.max(T, Math.min(Math.sqrt((2 * need) / (g * fr * (1 - fr))), 2.2));

    b.vx = dx / T;
    b.vz = dz / T;
    b.vy = (r - y0 + 0.5 * g * T * T) / T;
    b.y = y0;
    b.held = false;
    this.rules.onHit(f.id);
    this.phase = 'rally';
  }

  stepBall(dt) {
    const b = this.ball;
    const res = b.step(dt);
    let verdict = null;

    if (res.bounce) {
      this.events.push({
        type: 'bounce', x: res.bx, z: res.bz,
        inside: this.rules.isInside(res.bx, res.bz),
      });
      verdict = this.rules.onBounce(res.bx, res.bz) || verdict;
    }
    if (res.net) {
      this.events.push({ type: 'net', y: res.netY });
      verdict = verdict || this.rules.onNetCross(res.netY);
    }
    if (b.fallen) verdict = verdict || this.rules.onFall();
    if (verdict) { this.endPoint(verdict); return; }

    if (this.rules.state !== 'live') return;
    [this.fighters[PLAYER], this.fighters[BOT]].forEach((f) => {
      if (this.rules.state !== 'live') return;
      if (!f.parry.canConnect || !this.rules.canHit(f.id, b.z)) return;
      const rx = f.x, ry = 1.4, rz = f.z - f.sign * 0.5;
      const dist = Math.hypot(b.x - rx, b.y - ry, b.z - rz);
      if (dist > this.cfg.parry.reach) return;

      const c = f.parry.connect();
      let q = c.quality;
      if (f.id === BOT && q === 'perfect' && Math.random() > this.cfg.bot.perfectChance) q = 'normal';
      this.shoot(f, f.aimX, f.aimZ, q, false);
      this.events.push({ type: 'hit', who: f.id, quality: q, error: c.error, x: b.x, y: b.y, z: b.z });
    });
  }

  endPoint({ winner, reason }) {
    this.state.award(winner);
    this.phase = 'point';
    this.phaseTime = 0;
    if (this.state.over) {
      this.fighters[winner].mood = 'win';
      this.fighters[other(winner)].mood = 'lose';
    }
    this.events.push({ type: 'point', winner, reason, score: { ...this.state.score }, over: this.state.over });
  }
}
