import { BallPhysics } from './BallPhysics.js';
import { Rules, PLAYER, BOT, sideSign, other } from './Rules.js';
import { MatchState } from './MatchState.js';
import { Parry } from './Parry.js';
import { rallyRegion, boxRegion, riskAt, timingFactor, deviationDeg, clampToBox } from './Aim.js';
import { BotController } from '../input/BotController.js';

const STEP = 1 / 120;            // passo fixo da simulação
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/**
 * Orquestra a partida (pura, sem THREE): fases, movimento, saque (minigame), contato do
 * Parry, mira com risco, regras e placar. Recebe intents como dados e devolve eventos.
 *
 * Fases: 'ready' -> 'serve' -> 'rally' -> 'point' -> 'serve' ... -> 'over'
 * Saque: startDelay (receptor se posiciona) -> anel contrai (clique no momento certo) -> saque.
 */
export class Match {
  constructor(cfg) {
    this.cfg = cfg;
    this.court = cfg.court;
    this.halfW = cfg.court.width / 2;
    this.halfL = cfg.court.length / 2;
    this.ball = new BallPhysics(cfg.ball, cfg.court);
    this.rules = new Rules(cfg.court, cfg.netHeight + cfg.ball.radius);
    this.state = new MatchState(cfg.winScore, cfg.serve.alternateEvery);
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
    this.retry = false;
    this.serveAttempt = 0;
    this.serve = null;           // { server, sideSign, box, attempt }
    this.botServe = null;        // { at, quality } sorteado no início do saque do rival
    this.serveTiming = this.rollServeTiming();
    this.intent = { moveX: 0, moveZ: 0, aimX: 0, aimZ: -6 };
    this.prepareServe();
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

  // ---------------------------------------------------------------- saque: geometria
  /** Define sacador, lado e caixa de saque diagonal do PRÓXIMO saque (usa o placar atual). */
  prepareServe() {
    const server = this.state.server;
    const sv = sideSign(server);
    const side = (this.state.total % 2 === 0 ? 1 : -1) * sv;   // x onde o sacador fica (direita primeiro)
    const boxSign = -side;                                       // diagonal: lado oposto
    const W = this.court.width / 2, S = this.court.serviceLine;
    this.serve = {
      server, sideSign: side, boxSign,
      box: {
        xMin: boxSign > 0 ? 0 : -W, xMax: boxSign > 0 ? W : 0,
        zMin: sv > 0 ? -S : 0, zMax: sv > 0 ? 0 : S,            // metade do adversário, até a linha de saque
      },
    };
  }

  /** Posição de espera: sacador na linha de fundo, receptor no lado da caixa; rali: posição padrão. */
  homeFor(id) {
    const c = this.cfg, s = c.serve, sv = this.serve;
    if (sv && this.phase !== 'rally') {
      const sg = sideSign(id);
      if (id === sv.server) return [sv.sideSign * s.standX, sg * s.standZ];
      return [sv.boxSign * s.receiverX, sg * c.player.home[1]];
    }
    return id === PLAYER ? c.player.home : c.bot.home;
  }

  resetFighters() {
    [PLAYER, BOT].forEach((id) => {
      const f = this.fighters[id];
      const h = this.homeFor(id);
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
    this.prepareServe();
    this.resetFighters();
    this.beginServe(false);
    this.events.push({ type: 'start' });
  }

  restart() {
    this.start();
  }

  beginServe(isRetry) {
    if (!isRetry) this.serveAttempt = 0;
    this.phase = 'serve';
    this.phaseTime = 0;
    this.rules.newPoint(this.serve.box);
    this.ball.reset();
    this.fighters[PLAYER].buffer = 0;
    this.botServe = null;
    this.serveTiming = this.rollServeTiming();
    if (this.serve.server === BOT) {
      const q = this.cfg.bot.serveQuality, r = Math.random();
      const s = this.cfg.serve;
      this.botServe = {
        quality: r < q.perfect ? 'perfect' : r < q.perfect + q.good ? 'good' : 'bad',
        at: s.startDelay + this.serveTiming.perfectAt + gauss() * 0.12,
      };
    }
    this.placeHeldBall();
    this.events.push({
      type: 'serveReady', server: this.serve.server, box: this.serve.box,
      attempt: this.serveAttempt + 1, attempts: this.cfg.serve.attempts,
    });
  }

  /**
   * Sorteia o instante perfeito do minigame de saque (a cada saque, inclusive no 2º saque),
   * para o jogador não decorar o ritmo. Respeita o timeout: sempre sobra tempo para a janela "boa".
   */
  rollServeTiming() {
    const s = this.cfg.serve;
    const hi = Math.min(s.perfectAtRange[1], s.timeout - s.startDelay - s.goodWindow - 0.05);
    const lo = Math.min(s.perfectAtRange[0], hi);
    const perfectAt = lo + Math.random() * (hi - lo);
    return { perfectAt, ringDuration: perfectAt + s.afterPerfect };
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Estado do minigame de saque (para o anel). active=false fora do saque ou antes do anel. */
  get serveInfo() {
    const s = this.cfg.serve;
    const inServe = this.phase === 'serve' && this.serve;
    const t = this.phaseTime - s.startDelay;
    return {
      inServe: !!inServe,
      server: this.serve ? this.serve.server : null,
      active: !!inServe && t >= 0,
      t, ringDuration: this.serveTiming.ringDuration, perfectAt: this.serveTiming.perfectAt,
      perfectWindow: s.perfectWindow, goodWindow: s.goodWindow, timeout: s.timeout,
      box: this.serve ? this.serve.box : null,
    };
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
      const home = this.phase === 'serve' ? this.homeFor(BOT) : cfg.bot.home;
      bi = this.bot.think(dt, { bot, player, ball: this.ball, rules: this.rules, home });
    }
    if (walkingHome) {
      pm = this.homeIntent(player);
      bi = { ...this.homeIntent(bot), press: false, aimX: bot.aimX, aimZ: bot.aimZ };
    }

    this.moveFighter(player, pm.moveX, pm.moveZ, dt, cfg.player.speed);
    this.moveFighter(bot, bi.moveX, bi.moveZ, dt, cfg.bot.speed);
    bot.aimX = bi.aimX; bot.aimZ = bi.aimZ;
    this.faceTargets(player, bot, dt);

    // --- saque (minigame): o MESMO botão do Parry
    if (this.phase === 'serve') this.stepServe(dt, player);

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
    const pause = this.retry ? cfg.pointPause * 0.55 : cfg.pointPause;
    if (this.phase === 'point' && this.phaseTime >= pause) {
      if (this.retry) {
        this.retry = false;
        this.beginServe(true);
      } else if (this.state.over) {
        this.phase = 'over';
        this.phaseTime = 0;
        this.events.push({ type: 'matchOver', winner: this.state.winner, score: { ...this.state.score } });
      } else {
        this.prepareServe();
        this.resetFighters();
        this.beginServe(false);
      }
    }
  }

  stepServe(dt, player) {
    const s = this.cfg.serve;
    const sv = this.serve;
    const t = this.phaseTime - s.startDelay;
    if (t >= 0 && !this.ringAnnounced) {
      this.ringAnnounced = true;
      this.events.push({ type: 'serveRing', server: sv.server });
    }
    if (this.phaseTime < dt * 1.5) this.ringAnnounced = false;

    if (sv.server === PLAYER) {
      if (this.phaseTime < s.startDelay) { player.buffer = 0; return; }   // cliques antes do anel não valem
      if (player.buffer > 0) {
        player.buffer = 0;
        const err = t - this.serveTiming.perfectAt;
        const q = Math.abs(err) <= s.perfectWindow ? 'perfect' : Math.abs(err) <= s.goodWindow ? 'good' : 'bad';
        this.doServe(player, q, false);
      } else if (this.phaseTime >= s.timeout) {
        this.doServe(player, 'bad', true);     // tempo esgotado: saque automático fraco
      }
    } else if (this.botServe && this.phaseTime >= this.botServe.at) {
      this.doServe(this.fighters[BOT], this.botServe.quality, false);
    }
  }

  homeIntent(f) {
    const h = this.homeFor(f.id);
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
    const s = this.fighters[this.serve.server];
    b.x = s.x;
    b.z = s.z - s.sign * 0.6;
    b.y = 1.7 + Math.sin(this.time * 3) * 0.08;
    b.vx = b.vy = b.vz = 0;
  }

  // ---------------------------------------------------------------- saque e rebatida
  /** Executa o saque. quality: 'perfect' | 'good' | 'bad'. */
  doServe(f, quality, auto) {
    const s = this.cfg.serve, bc = this.cfg.ball;
    const box = this.serve.box;
    let ax, az;
    if (f.id === PLAYER) {
      [ax, az] = clampToBox(f.aimX, f.aimZ, box);
    } else {
      const a = this.bot.serveAim(box);
      ax = a.x; az = a.z;
    }
    this.phase = 'rally';
    this.phaseTime = 0;
    this.startSwing(f);
    this.ball.speed = quality === 'perfect' ? Math.min(bc.baseSpeed * s.speedMult.perfect, bc.maxSpeed) : bc.baseSpeed;
    const info = this.shoot(f, ax, az, {
      isServe: true,
      speedMult: quality === 'perfect' ? 1 : s.speedMult[quality],
      timingFactor: s.deviation[quality],
      region: boxRegion(box),
      devMult: f.id === BOT ? this.cfg.bot.aimDeviationMult : 1,
    });
    this.events.push({ type: 'serve', who: f.id, quality, auto, ...info });
  }

  /**
   * Lança o orbe de onde ele está até o alvo por uma parábola exata. O alvo recebe um desvio
   * angular aleatório = timingFactor * risco(mira) * MAX_AIM_DEVIATION (Parry perfeito: zero).
   * A velocidade do rali define o tempo de voo; se a parábola bateria na rede, o voo fica
   * mais lento/alto (lob) o suficiente para passar por cima.
   */
  shoot(f, aimX, aimZ, opt) {
    const {
      isServe = false, speedMult = 1, timingFactor: tf = 0, region, devMult = 1, quality = 'normal',
    } = opt;
    const b = this.ball, bc = this.cfg.ball, A = this.cfg.aim;
    const r = bc.radius, g = bc.gravity;

    if (!isServe) {
      b.speed = quality === 'perfect'
        ? Math.min(b.speed * bc.perfectMultiplier, bc.maxSpeed)
        : Math.min(b.speed * bc.hitMultiplier, bc.maxSpeed);
    }

    // --- desvio de mira (ângulo + profundidade)
    const reg = region || rallyRegion(this.court, f.sign);
    const risk = riskAt(aimX, aimZ, reg, A);
    const devDeg = deviationDeg(tf, risk, A, devMult);
    const ang = (Math.random() * 2 - 1) * devDeg * (Math.PI / 180);
    const depth = 1 + (Math.random() * 2 - 1) * tf * risk * A.maxDepthDeviation * devMult;
    const dx0 = aimX - b.x, dz0 = aimZ - b.z;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const tx = b.x + (dx0 * ca - dz0 * sa) * depth;
    let tz = b.z + (dx0 * sa + dz0 * ca) * depth;
    tz = f.sign > 0 ? Math.min(tz, -0.8) : Math.max(tz, 0.8); // sempre rumo à outra metade

    const y0 = Math.max(b.y, r + 0.05);
    const dx = tx - b.x, dz = tz - b.z;
    const D = Math.hypot(dx, dz);
    let T = Math.max(D / (b.speed * speedMult), 0.25);

    // Tempo mínimo de voo para o orbe passar por cima da rede (z = 0).
    const fr = clamp(Math.abs(b.z) / Math.abs(dz), 0.03, 0.97);
    const N = this.cfg.netHeight + r;
    const need = (N - y0 * (1 - fr) - fr * r) * 1.15;
    if (need > 0) T = Math.max(T, Math.min(Math.sqrt((2 * need) / (g * fr * (1 - fr))), 2.4));

    b.vx = dx / T;
    b.vz = dz / T;
    b.vy = (r - y0 + 0.5 * g * T * T) / T;
    b.y = y0;
    b.held = false;
    this.rules.onHit(f.id, isServe);
    this.phase = 'rally';
    return { risk, devDeg, tx, tz };
  }

  stepBall(dt) {
    const b = this.ball;
    const res = b.step(dt);
    let verdict = null;

    if (res.bounce) {
      this.events.push({
        type: 'bounce', x: res.bx, z: res.bz,
        inside: this.rules.serveShot && this.rules.bounces === 0
          ? this.rules.inBox(res.bx, res.bz)
          : this.rules.isInside(res.bx, res.bz),
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
      const tf = timingFactor(c.error, q, this.cfg.aim);
      const info = this.shoot(f, f.aimX, f.aimZ, {
        quality: q, timingFactor: tf,
        devMult: f.id === BOT ? this.cfg.bot.aimDeviationMult : 1,
      });
      this.events.push({ type: 'hit', who: f.id, quality: q, error: c.error, x: b.x, y: b.y, z: b.z, ...info });
    });
  }

  endPoint(v) {
    const { winner, reason, kind } = v;
    // Falta de saque: 2º saque, ou dupla falta (ponto do receptor).
    if (kind === 'fault') {
      this.serveAttempt += 1;
      if (this.serveAttempt < this.cfg.serve.attempts) {
        this.retry = true;
        this.phase = 'point';
        this.phaseTime = 0;
        this.events.push({ type: 'fault', reason, x: v.x, z: v.z, attempt: this.serveAttempt, last: false });
        return;
      }
      this.events.push({ type: 'fault', reason, x: v.x, z: v.z, attempt: this.serveAttempt, last: true });
      this.finishPoint(winner, 'Dupla falta!', 'doubleFault');
      return;
    }
    if (kind === 'out') this.events.push({ type: 'out', x: v.x, z: v.z, winner });
    this.finishPoint(winner, reason, kind);
  }

  finishPoint(winner, reason, kind) {
    this.state.award(winner);
    this.phase = 'point';
    this.phaseTime = 0;
    if (this.state.over) {
      this.fighters[winner].mood = 'win';
      this.fighters[other(winner)].mood = 'lose';
    } else {
      this.prepareServe();  // define já o próximo sacador/lado: eles caminham até as posições
    }
    this.events.push({ type: 'point', winner, reason, kind, score: { ...this.state.score }, over: this.state.over });
  }
}
