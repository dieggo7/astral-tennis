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
    this.meteor = null;
    this.characterId = 'ignis';
    this.abilityCooldown = 0;
    this.ultimateCooldown = 0;
    this.effects = { frostWall: 0, iceRink: 0, tornado: null, ballStop: null, overload: 0 };
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
      bufferType: 'normal',
      swingType: 'normal',
      dashBuffer: 0,
      meteorBuffer: 0,
      dashCooldown: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirZ: 0,
      dashRemaining: 0,
      flameWindow: 0,
      perfectStreak: 0,
      meteorCooldown: 0,
      characterId: id === PLAYER ? 'ignis' : 'glacia',
      moveSpeed: id === PLAYER ? this.cfg.player.speed : this.cfg.bot.speed,
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
      f.dashBuffer = 0; f.meteorBuffer = 0; f.dashTimer = 0; f.dashRemaining = 0; f.flameWindow = 0;
      f.aimX = 0; f.aimZ = -f.sign * 6;
    });
  }

  // ---------------------------------------------------------------- ciclo de vida
  start() {
    this.state.reset(PLAYER);
    this.bot.reset();
    const player = this.fighters[PLAYER];
    player.dashCooldown = 0;
    player.meteorCooldown = 0;
    player.perfectStreak = 0;
    this.abilityCooldown = 0;
    this.ultimateCooldown = 0;
    this.effects = { frostWall: 0, iceRink: 0, tornado: null, ballStop: null, overload: 0 };
    this.meteor = null;
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
    let perfectAt = lo + Math.random() * (hi - lo);
    // Evita que dois saques seguidos repitam quase o mesmo ritmo.
    for (let attempt = 0; attempt < 8 && this.lastServePerfectAt != null
      && Math.abs(perfectAt - this.lastServePerfectAt) < 0.22; attempt += 1) {
      perfectAt = lo + Math.random() * (hi - lo);
    }
    this.lastServePerfectAt = perfectAt;
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

  get abilityInfo() {
    const f = this.fighters[PLAYER];
    const passiveStatus = this.characterId === 'ignis' ? `Combustão x${f.perfectStreak}`
      : this.characterId === 'glacia' ? 'Pés Frios · Parry ampliado'
        : this.characterId === 'zephyr' ? 'Pés de Vento · Velocidade máxima'
          : 'Fio Desencapado · Zigue-zague ativo';
    return {
      perfectStreak: f.perfectStreak,
      abilityCooldown: this.abilityCooldown,
      ultimateCooldown: this.ultimateCooldown,
      flameWindow: f.flameWindow,
      passiveStatus,
    };
  }

  setPlayerCharacter(id) {
    if (!this.cfg.characters[id]) return;
    this.characterId = id;
    const player = this.fighters[PLAYER];
    player.characterId = id;
    player.moveSpeed = this.cfg.characters[id].speed;
    player.parry.cfg = { ...this.cfg.parry, perfectWindow: this.cfg.characters[id].perfectWindow };
    player.parry.reset();
    player.perfectStreak = 0;
    this.abilityCooldown = 0;
    this.ultimateCooldown = 0;
    this.effects = { frostWall: 0, iceRink: 0, tornado: null, ballStop: null, overload: 0 };
    this.meteor = null;
  }

  // ---------------------------------------------------------------- atualização
  /** dt variável do frame; intent do jogador = { moveX, moveZ, press, aimX, aimZ }. */
  update(dt, intent) {
    const p = this.fighters[PLAYER];
    this.intent.moveX = intent.moveX;
    this.intent.moveZ = intent.moveZ;
    p.aimX = intent.aimX;
    p.aimZ = intent.aimZ;
    if (intent.press) {
      p.buffer = this.cfg.parry.bufferTime;
      p.bufferType = 'normal';
    }
    if (intent.strongPress && this.phase === 'rally') {
      p.buffer = this.cfg.parry.bufferTime;
      p.bufferType = 'strong';
    }
    if (intent.dashPress) p.dashBuffer = 0.16;
    if (intent.ultimatePress) p.meteorBuffer = 0.16;

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
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.ultimateCooldown = Math.max(0, this.ultimateCooldown - dt);
    for (const key of ['frostWall', 'iceRink', 'overload']) this.effects[key] = Math.max(0, this.effects[key] - dt);
    player.flameWindow = Math.max(0, player.flameWindow - dt);

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
    if (this.effects.overload > 0) bi = { moveX: 0, moveZ: 0, press: false, aimX: bot.aimX, aimZ: bot.aimZ };

    if (player.dashBuffer > 0) {
      if (this.phase === 'rally' && this.abilityCooldown <= 0) {
        this.activateAbility(player);
        player.dashBuffer = 0;
      } else player.dashBuffer = Math.max(0, player.dashBuffer - dt);
    }
    if (player.meteorBuffer > 0) {
      if (this.phase === 'rally' && this.ultimateCooldown <= 0) {
        this.activateUltimate(player);
        player.meteorBuffer = 0;
      } else player.meteorBuffer = Math.max(0, player.meteorBuffer - dt);
    }
    if (this.meteor?.falling && this.phase === 'rally') {
      this.bot.moveToward(bi, bot, this.meteor.x, this.meteor.z);
    }

    this.moveFighter(player, pm.moveX, pm.moveZ, dt, player.moveSpeed);
    const botIce = this.effects.iceRink > 0 && bot.z < 0;
    this.moveFighter(bot, bi.moveX, bi.moveZ, dt, cfg.bot.speed, botIce ? 0.24 : 1);
    bot.aimX = bi.aimX; bot.aimZ = bi.aimZ;
    this.faceTargets(player, bot, dt);

    // --- saque (minigame): o MESMO botão do Parry
    if (this.phase === 'serve') this.stepServe(dt, player);

    // --- golpes (Parry)
    if (player.buffer > 0) {
      if (player.parry.press()) {
        player.swingType = player.bufferType;
        player.buffer = 0;
        this.startSwing(player);
      }
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

  activateFlameDash(f) {
    const d = this.cfg.ignis.dash;
    const dx = this.ball.x - f.x, dz = this.ball.z - f.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.02) return;
    f.dashDirX = dx / distance;
    f.dashDirZ = dz / distance;
    f.dashRemaining = Math.min(distance, d.maxDistance);
    f.dashTimer = Math.min(d.duration, f.dashRemaining / d.speed);
    this.abilityCooldown = d.cooldown;
    f.flameWindow = 0;
    this.events.push({ type: 'dash', who: f.id, x: f.x, z: f.z });
  }

  activateMeteor(f) {
    const cfg = this.cfg.ignis.meteor;
    const b = this.ball;
    const x = clamp(f.aimX, -this.halfW + 0.35, this.halfW - 0.35);
    const z = clamp(Math.min(f.aimZ, -0.8), -this.halfL + 0.5, -0.8);
    this.meteor = { x, z, radius: cfg.impactRadius, falling: false };
    this.ultimateCooldown = cfg.cooldown;
    f.perfectStreak = 0;
    f.flameWindow = 0;
    b.held = false;
    b.vx = 0;
    b.vz = 0;
    b.vy = cfg.launchSpeed;
    b.curveAccelX = 0;
    b.curveTime = 0;
    this.rules.onHit(f.id, false);
    this.events.push({ type: 'meteor', who: f.id, x, z, radius: cfg.impactRadius });
  }

  activateAbility(f) {
    const id = this.characterId;
    const cc = this.cfg.characters[id];
    this.abilityCooldown = cc.abilityCooldown;
    if (id === 'ignis') { this.abilityCooldown = 0; this.activateFlameDash(f); return; }
    if (id === 'glacia') {
      this.effects.frostWall = this.cfg.glacia.wallDuration;
      this.effects.frostWallUsed = false;
      this.events.push({ type: 'frostWall', duration: this.effects.frostWall });
    } else if (id === 'zephyr') {
      const b = this.ball;
      if (b.held || b.fallen || this.effects.tornado) { this.abilityCooldown = 0; return; }
      const direction = Math.sign(f.aimX - b.x || (Math.random() < 0.5 ? -1 : 1));
      b.vx += direction * this.cfg.zephyr.gustImpulse;
      this.events.push({ type: 'gust', x: b.x, y: b.y, z: b.z, direction });
    } else if (id === 'volta') {
      const b = this.ball;
      if (b.held || b.fallen || this.effects.ballStop || this.effects.tornado) { this.abilityCooldown = 0; return; }
      this.effects.ballStop = { timer: this.cfg.volta.stopDuration, vx: b.vx, vy: b.vy, vz: b.vz };
      b.vx = b.vy = b.vz = 0;
      this.events.push({ type: 'shortCircuit', x: b.x, y: b.y, z: b.z });
    }
  }

  activateUltimate(f) {
    const id = this.characterId;
    this.ultimateCooldown = this.cfg.characters[id].ultimateCooldown;
    if (id === 'ignis') { this.ultimateCooldown = 0; this.activateMeteor(f); return; }
    if (id === 'glacia') {
      this.effects.iceRink = this.cfg.glacia.iceDuration;
      this.events.push({ type: 'iceRink', duration: this.effects.iceRink });
    } else if (id === 'zephyr') {
      const b = this.ball;
      if (b.held || b.fallen) { this.ultimateCooldown = 0; return; }
      this.effects.tornado = { timer: this.cfg.zephyr.tornadoDuration, x: 0, y: Math.max(2, b.y), z: 0 };
      b.x = 0; b.y = this.effects.tornado.y; b.z = 0; b.vx = b.vy = b.vz = 0;
      this.events.push({ type: 'tornado', x: 0, y: b.y, z: 0 });
    } else if (id === 'volta') {
      const b = this.ball;
      if (b.held || b.fallen) { this.ultimateCooldown = 0; return; }
      this.effects.overload = 0.42;
      b.curveAccelX = 0; b.curveTime = 0; b.vy = 0;
      b.zigzagTime = 0;
      const side = Math.sign(b.z) || 1;
      b.vx = 0; b.vz = -side * this.cfg.ball.maxSpeed;
      b.speed = this.cfg.ball.maxSpeed;
      this.rules.onHit(PLAYER, false);
      this.events.push({ type: 'overload', x: b.x, y: b.y, z: b.z });
    }
  }

  stepMeteor(dt) {
    const m = this.meteor;
    const b = this.ball;
    if (!m || b.held) return;
    if (!m.falling) {
      b.vy -= this.cfg.ball.gravity * dt;
      b.y += b.vy * dt;
      if (b.vy <= 0) {
        b.x = m.x;
        b.z = m.z;
        b.vy = 0;
        m.falling = true;
        this.events.push({ type: 'meteorFall', x: m.x, y: b.y, z: m.z, radius: m.radius });
      }
      return;
    }

    b.vy -= this.cfg.ignis.meteor.fallGravity * dt;
    b.y += b.vy * dt;
    if (b.y > b.r) return;

    b.y = b.r;
    const bot = this.fighters[BOT];
    const centered = Math.hypot(bot.x - m.x, bot.z - m.z) <= this.cfg.ignis.meteor.centerTolerance;
    this.events.push({ type: 'meteorImpact', x: m.x, z: m.z, returned: centered });
    this.meteor = null;
    if (!centered) {
      this.endPoint(this.rules.verdict(PLAYER, 'Meteoro!', 'meteor', m.x, m.z));
      return;
    }

    bot.aimX = this.fighters[PLAYER].x;
    bot.aimZ = this.fighters[PLAYER].z;
    const info = this.shoot(bot, bot.aimX, bot.aimZ, {
      quality: 'normal', timingFactor: 0.15, devMult: this.cfg.bot.aimDeviationMult,
    });
    this.events.push({ type: 'meteorReturn', who: BOT, x: m.x, z: m.z, ...info });
  }

  homeIntent(f) {
    const h = this.homeFor(f.id);
    const dx = h[0] - f.x, dz = h[1] - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) return { moveX: 0, moveZ: 0 };
    const k = Math.min(1, d / 0.8);
    return { moveX: (dx / d) * k, moveZ: (dz / d) * k };
  }

  moveFighter(f, mx, mz, dt, speed, traction = 1) {
    if (f.id === PLAYER && f.dashTimer > 0) {
      const dash = this.cfg.ignis.dash;
      const travel = Math.min(dash.speed * dt, f.dashRemaining);
      f.x += f.dashDirX * travel;
      f.z += f.dashDirZ * travel;
      f.dashRemaining -= travel;
      f.dashTimer = Math.max(0, f.dashTimer - dt);
      f.vx = f.dashDirX * dash.speed;
      f.vz = f.dashDirZ * dash.speed;
      this.clampFighterToCourt(f);
      if (f.dashTimer === 0 || f.dashRemaining <= 0.001) {
        f.dashTimer = 0;
        f.dashRemaining = 0;
        f.flameWindow = dash.curveWindow;
        this.events.push({ type: 'dashReady', who: f.id, x: f.x, z: f.z });
      }
      return;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const k = f.parry.swinging ? this.cfg.parry.swingMoveFactor : 1;
    const a = this.cfg.player.accel * dt * traction;
    f.vx += clamp(mx * speed * k - f.vx, -a, a);
    f.vz += clamp(mz * speed * k - f.vz, -a, a);
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    this.clampFighterToCourt(f);
  }

  clampFighterToCourt(f) {
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
      isServe = false, speedMult = 1, timingFactor: tf = 0, region, devMult = 1,
      quality = 'normal', strong = false, passiveBonus = 0, curve = false,
    } = opt;
    const b = this.ball, bc = this.cfg.ball, A = this.cfg.aim;
    b.zigzagTime = 0;
    const r = bc.radius, g = bc.gravity;

    if (!isServe) {
      if (strong) {
        b.speed = b.speed * this.cfg.smash.speedMultiplier + passiveBonus;
      } else if (quality === 'perfect') {
        b.speed = Math.min(b.speed * bc.perfectMultiplier, bc.maxSpeed) + passiveBonus;
      } else b.speed = Math.min(b.speed * bc.hitMultiplier, bc.maxSpeed);
    }

    // --- desvio de mira (ângulo + profundidade)
    const reg = region || rallyRegion(this.court, f.sign);
    const risk = riskAt(aimX, aimZ, reg, A);
    const devDeg = deviationDeg(tf, risk, A, devMult);
    const ang = (Math.random() * 2 - 1) * devDeg * (Math.PI / 180);
    const depth = 1 + (Math.random() * 2 - 1) * tf * risk * A.maxDepthDeviation * devMult;
    const dx0 = aimX - b.x, dz0 = aimZ - b.z;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let tx = b.x + (dx0 * ca - dz0 * sa) * depth;
    let tz = b.z + (dx0 * sa + dz0 * ca) * depth;
    if (strong && quality === 'perfect') {
      // Mesmo um smash perfeito conserva um erro de mira de até 20% da meia quadra.
      tx += (Math.random() * 2 - 1) * this.halfW * this.cfg.smash.perfectAimError;
      tz += (Math.random() * 2 - 1) * (this.halfL / 2) * this.cfg.smash.perfectAimError;
    } else if (strong && Math.random() < this.cfg.smash.imperfectOutChance) {
      // A maior parte dos smashes fora do timing perfeito sai pela lateral.
      tx = (Math.random() < 0.5 ? -1 : 1) * (this.halfW + 1.2);
    }
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

    b.curveTime = curve ? Math.min(this.cfg.ignis.dash.curveDuration, T) : 0;
    b.curveAccelX = curve
      ? Math.sign(aimX - b.x || aimX - f.x || 1) * this.cfg.ignis.dash.curveAcceleration
      : 0;
    const curveExtraX = b.curveAccelX * (b.curveTime * T - 0.5 * b.curveTime * b.curveTime);
    b.vx = dx / T - curveExtraX / T;
    b.vz = dz / T;
    b.vy = (r - y0 + 0.5 * g * T * T) / T;
    b.y = y0;
    b.held = false;
    this.rules.onHit(f.id, isServe);
    this.phase = 'rally';
    return { risk, devDeg, tx, tz };
  }

  stepBall(dt) {
    if (this.meteor) {
      this.stepMeteor(dt);
      return;
    }
    const b = this.ball;
    if (this.effects.tornado) {
      const tornado = this.effects.tornado;
      tornado.timer -= dt;
      b.x = Math.sin((this.cfg.zephyr.tornadoDuration - tornado.timer) * 18) * 0.45;
      b.y = tornado.y + Math.sin((this.cfg.zephyr.tornadoDuration - tornado.timer) * 22) * 0.35;
      b.z = 0;
      if (tornado.timer <= 0) {
        const aimX = (Math.random() * 2 - 1) * (this.halfW - 1.2);
        const aimZ = -(3.5 + Math.random() * (this.halfL - 5));
        b.x = 0; b.y = Math.max(2, b.y); b.z = 0.8;
        b.vx = b.vy = b.vz = 0;
        b.speed = this.cfg.ball.maxSpeed;
        b.held = false;
        const info = this.shoot(this.fighters[PLAYER], aimX, aimZ, { quality: 'normal', timingFactor: 0 });
        b.speed = this.cfg.zephyr.tornadoSpeed;
        this.effects.tornado = null;
        this.events.push({ type: 'tornadoLaunch', x: b.x, y: b.y, z: b.z, aimX, aimZ, ...info });
      }
      return;
    }
    if (this.effects.ballStop) {
      const stopped = this.effects.ballStop;
      stopped.timer -= dt;
      if (stopped.timer <= 0) {
        b.vx = stopped.vx; b.vy = stopped.vy; b.vz = stopped.vz;
        this.effects.ballStop = null;
        this.events.push({ type: 'shortCircuitRelease', x: b.x, y: b.y, z: b.z });
      } else return;
    }
    const previousZ = b.z;
    const res = b.step(dt);
    let verdict = null;

    if (this.effects.frostWall > 0 && !this.effects.frostWallUsed
      && (previousZ - this.cfg.glacia.wallZ) * (b.z - this.cfg.glacia.wallZ) <= 0
      && Math.abs(b.x) <= this.halfW - b.r * 0.5
      && Math.abs(previousZ - this.cfg.glacia.wallZ) > 0.001) {
      b.vz *= -1;
      b.z = previousZ < this.cfg.glacia.wallZ ? this.cfg.glacia.wallZ - 0.04 : this.cfg.glacia.wallZ + 0.04;
      this.effects.frostWallUsed = true;
      this.events.push({ type: 'wallReflect', x: b.x, y: b.y, z: b.z });
    }

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
      if (f.id === BOT && this.effects.overload > 0) return;
      if (!f.parry.canConnect || !this.rules.canHit(f.id, b.z)) return;
      const rx = f.x, ry = 1.4, rz = f.z - f.sign * 0.5;
      const dist = Math.hypot(b.x - rx, b.y - ry, b.z - rz);
      if (dist > this.cfg.parry.reach) return;

      const c = f.parry.connect();
      let q = c.quality;
      if (f.id === BOT && q === 'perfect' && Math.random() > this.cfg.bot.perfectChance) q = 'normal';
      const tf = timingFactor(c.error, q, this.cfg.aim);
      const strong = f.id === PLAYER && f.swingType === 'strong';
      let passiveStacks = 0;
      let passiveBonus = 0;
      let curve = false;
      if (f.id === PLAYER) {
        f.perfectStreak = this.characterId === 'ignis' && q === 'perfect'
          ? Math.min(f.perfectStreak + 1, this.cfg.ignis.passive.maxStacks)
          : 0;
        passiveStacks = f.perfectStreak;
        if (this.characterId === 'ignis' && q === 'perfect') passiveBonus = this.ball.speed * this.cfg.ignis.passive.bonusPerStack * passiveStacks;
        curve = f.flameWindow > 0;
        if (curve) f.flameWindow = 0;
      }
      const info = this.shoot(f, f.aimX, f.aimZ, {
        quality: q, timingFactor: tf,
        devMult: f.id === BOT ? this.cfg.bot.aimDeviationMult : 1,
        strong, passiveBonus, curve,
      });
      if (f.id === PLAYER && this.characterId === 'volta') {
        b.zigzagTime = this.cfg.volta.zigzagDuration;
        b.zigzagAcceleration = this.cfg.volta.zigzagAcceleration;
        b.zigzagInterval = this.cfg.volta.zigzagInterval;
        b.zigzagClock = 0;
        b.zigzagDirection = Math.sign(Math.random() - 0.5) || 1;
      }
      this.events.push({ type: 'hit', who: f.id, quality: q, strong, curve, passiveStacks, error: c.error, x: b.x, y: b.y, z: b.z, ...info });
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
    this.meteor = null;
    this.fighters[PLAYER].perfectStreak = 0;
    this.fighters[PLAYER].flameWindow = 0;
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
