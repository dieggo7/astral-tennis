import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { arenaConfig, gameConfig, getFitPoints } from '../config/constants.js';
import { Court } from '../arena/Court.js';
import { LightBarrier } from '../arena/LightBarrier.js';
import { Obelisks } from '../arena/Obelisks.js';
import { Banners } from '../arena/Banners.js';
import { Galaxy } from '../environment/Galaxy.js';
import { FloatingIslands } from '../environment/FloatingIslands.js';
import { Particles } from '../environment/Particles.js';
import { ChaosOrb } from '../objects/ChaosOrb.js';
import { CameraRig } from './Camera.js';
import { LightingRig } from './Lighting.js';
import { pointUniforms, updatePointScale } from '../utils/softPoints.js';
import { AimMarker, BounceMarks, ServeBox, ServeRing } from '../arena/CourtMarkers.js';
import { Burst } from '../effects/Burst.js';
import { rallyRegion, boxRegion, riskAt, deviationDeg, clampToBox } from '../sim/Aim.js';
import { Match } from '../sim/Match.js';
import { InputManager } from '../input/InputManager.js';
import { Character } from '../characters/Character.js';
import { ROSTER, MVP_MATCHUP } from '../characters/roster.js';
import { Hud } from '../ui/Hud.js';

export class Game {
  constructor(root) {
    const cfg = arenaConfig;
    this.root = root;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0626');
    this.scene.fog = new THREE.FogExp2(cfg.environment.fogColor, cfg.environment.fogDensity);
    this.clock = new THREE.Clock();
    this.tmp = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = cfg.environment.exposure;
    this.renderer.shadowMap.enabled = cfg.environment.shadowMapEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.appendChild(this.renderer.domElement);

    this.cameraRig = new CameraRig(cfg.camera, getFitPoints(cfg.court, cfg.barrier));
    this.cameraRig.attachDebug(this.renderer.domElement);
    this.camera = this.cameraRig.camera;
    this.scene.add(this.camera);

    // Pós-processamento: Render -> Bloom -> Output (tone mapping + sRGB).
    // O OutputPass é essencial: sem ele a imagem sai lavada e sem contraste.
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      cfg.environment.bloomStrength, cfg.environment.bloomRadius, cfg.environment.bloomThreshold,
    );
    this.bloomPass.enabled = cfg.environment.bloomEnabled;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.lightingRig = new LightingRig(cfg);
    this.scene.add(this.lightingRig.group);

    // Tudo que fica na laje sobe e desce junto (flutuação), inclusive o orbe.
    this.arena = new THREE.Group();
    this.court = new Court(cfg.court);
    this.barrier = new LightBarrier(cfg.barrier);
    this.obelisks = new Obelisks(cfg.barrier);
    this.banners = new Banners(cfg.court, cfg.barrier);
    this.orb = new ChaosOrb(cfg.orb, cfg.court);

    // Gameplay: simulação pura (passo fixo) + personagens, marcadores e HUD que só a desenham.
    this.match = new Match(gameConfig);
    this.input = new InputManager(this.renderer.domElement);
    this.hud = new Hud(this.root, gameConfig.winScore);
    this.characters = {
      player: new Character(ROSTER[MVP_MATCHUP.player], gameConfig.player.speed),
      bot: new Character(ROSTER[MVP_MATCHUP.bot], gameConfig.bot.speed),
    };
    this.aimMarker = new AimMarker();
    this.bounceMarks = new BounceMarks();
    this.serveBox = new ServeBox();
    this.serveRing = new ServeRing();
    this.burst = new Burst();
    this.hitStop = 0;
    this.slowTimer = 0;     // slow motion (segundos reais restantes)
    this.lastScoreKey = '';

    this.arena.add(
      this.court.group, this.barrier.group, this.obelisks.group, this.banners.group,
      this.serveBox.group, this.aimMarker.group, this.bounceMarks.group, this.serveRing.group, this.burst.points,
      this.characters.player.group, this.characters.bot.group,
      ...this.orb.objects,
    );
    this.scene.add(this.arena);
    this.setShadowCasters();

    this.galaxy = new Galaxy(cfg.galaxy);
    this.scene.add(this.galaxy.group);
    const pose = this.cameraRig.computePose(16 / 9);
    this.islands = new FloatingIslands({ position: pose.position, target: pose.target, fov: cfg.camera.fov });
    this.scene.add(this.islands.group);
    this.particles = new Particles();
    this.scene.add(this.particles.group);

    this.onResize();
    this.bindEvents();
  }

  setShadowCasters() {
    this.arena.traverse((o) => {
      if (o.isMesh && o.material && !o.material.isShaderMaterial && !o.material.transparent && o.castShadow === false) {
        o.castShadow = false;
      }
    });
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.cameraRig.setAspect(w / h);
    updatePointScale(this.renderer, this.camera);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pointermove', (e) => {
      this.cameraRig.mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    });
    window.addEventListener('keydown', (e) => {
      if (!arenaConfig.debug.debugKeys) return;
      if (e.code === 'KeyC') this.cameraRig.toggleDebugMode();
      if (e.code === 'KeyB') this.bloomPass.enabled = !this.bloomPass.enabled;
      if (e.code === 'KeyT') this.hud.toggleTiming();
    });
  }

  /** Traduz eventos da simulação em feedback: shake, pulso da barreira, HUD, partículas, slow motion. */
  handleEvents(events) {
    const pc = gameConfig.parry;
    const who = (w) => (w === 'player' ? 'Ponto seu' : 'Ponto do rival');
    for (const e of events) {
      switch (e.type) {
        case 'start':
          this.hud.hideOverlay();
          break;
        case 'serveReady':
          this.hud.setHint('');
          this.hud.flash(
            e.server === 'player' ? 'Seu saque' : 'Saque do rival', 'info', 1100,
            e.attempt > 1 ? '2º saque' : '',
          );
          break;
        case 'serveRing':
          if (e.server === 'player') this.hud.setHint('<b>Saque:</b> clique quando o anel encostar no círculo dourado!');
          break;
        case 'serve': {
          this.hud.setHint('');
          this.orb.pulse(1);
          this.characters[e.who].flashShield(e.quality === 'perfect' ? 'perfect' : 'normal');
          const p = this.orb.position;
          if (e.quality === 'perfect') {
            // Efeito especial: explosão dourada, shake forte e pausa curta.
            this.burst.emit(p.x, p.y, p.z, { count: 60, color: '#ffe27a', speed: 7, up: 4, life: 0.9, size: 0.3 });
            this.burst.emit(p.x, p.y, p.z, { count: 25, color: '#ffffff', speed: 4, up: 6, life: 0.6, size: 0.22 });
            this.cameraRig.shake(0.4, 0.3);
            this.hitStop = pc.hitStop;
            this.hud.flash(e.who === 'player' ? 'SAQUE PERFEITO!' : 'Saque perfeito do rival!', e.who === 'player' ? 'perfect' : 'bad', 1000);
          } else if (e.quality === 'bad') {
            this.cameraRig.shake(0.05, 0.12);
            if (e.who === 'player') this.hud.flash(e.auto ? 'Tempo esgotado!' : 'Saque fraco', 'bad', 900);
          } else {
            this.cameraRig.shake(0.1, 0.15);
          }
          break;
        }
        case 'hit': {
          this.characters[e.who].flashShield(e.quality);
          this.orb.pulse(e.strong ? 1.6 : 1);
          if (e.strong) {
            this.cameraRig.shake(e.quality === 'perfect' ? 0.55 : 0.38, 0.34);
            if (e.quality === 'perfect') this.hitStop = pc.hitStop;
            if (e.who === 'player') {
              this.hud.flash(e.quality === 'perfect' ? 'CORTADA PERFEITA!' : 'CORTADA!', e.quality === 'perfect' ? 'perfect' : 'info', 1000);
            }
          } else if (e.quality === 'perfect') {
            this.cameraRig.shake(0.38, 0.3);
            this.hitStop = pc.hitStop;
            this.hud.flash(e.who === 'player' ? 'PARRY PERFEITO!' : 'Parry perfeito do rival!', e.who === 'player' ? 'perfect' : 'bad', 900);
          } else {
            this.cameraRig.shake(0.1 + this.orb.speedRatio * 0.15, 0.2);
          }
          if (e.who === 'player') this.hud.setTiming(e.error, e.quality);
          break;
        }
        case 'bounce':
          this.orb.pulse(0.5);
          this.bounceMarks.spawn(e.x, e.z, e.inside);
          if (e.inside) this.burst.emit(e.x, 0.1, e.z, { count: 7, color: '#7dffb0', speed: 2.2, up: 2.2, life: 0.4, size: 0.16 });
          else this.burst.emit(e.x, 0.1, e.z, { count: 16, color: '#ff4a4a', speed: 3, up: 3, life: 0.6, size: 0.2 });
          break;
        case 'net':
          this.barrier.pulse(this.orb.position, 0.6 + this.orb.speedRatio);
          this.cameraRig.shake(0.06 + this.orb.speedRatio * 0.1, 0.2);
          break;
        case 'out':
          // OUT!: mensagem, explosão de partículas no ponto do quique e slow motion.
          this.burst.emit(e.x, 0.1, e.z, { count: 70, color: '#ff3a3a', speed: 6, up: 5, life: 1.0, size: 0.32 });
          this.burst.emit(e.x, 0.1, e.z, { count: 25, color: '#ffd0a0', speed: 3, up: 7, life: 0.8, size: 0.2 });
          this.hud.flash('OUT!', 'bad', 1600, who(e.winner));
          this.cameraRig.shake(0.2, 0.3);
          this.slowTimer = 0.75;
          break;
        case 'fault':
          if (e.x || e.z) this.burst.emit(e.x, 0.1, e.z, { count: 24, color: '#ffa13a', speed: 3.5, up: 3, life: 0.7, size: 0.22 });
          if (!e.last) this.hud.flash('FALTA!', 'bad', 1300, '2º saque');
          break;
        case 'point':
          if (e.kind === 'out') break;                       // já mostrado pelo evento 'out'
          if (e.kind === 'doubleFault') this.hud.flash('DUPLA FALTA!', e.winner === 'player' ? 'good' : 'bad', 1500, who(e.winner));
          else if (e.kind === 'ace') this.hud.flash('ACE!', e.winner === 'player' ? 'perfect' : 'bad', 1500, who(e.winner));
          else this.hud.flash(e.reason, e.winner === 'player' ? 'good' : 'bad', 1500, who(e.winner));
          this.cameraRig.shake(0.15, 0.25);
          break;
        case 'matchOver':
          this.hud.showEnd(e.winner === 'player', e.score);
          break;
        default:
          break;
      }
    }
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    pointUniforms.uTime.value = time;

    this.arena.position.y = Math.sin(time * arenaConfig.court.floatSpeed) * arenaConfig.court.floatAmplitude;

    // --- entrada -> simulação (passo fixo dentro do Match) -> eventos
    const intent = this.input.read(this.camera, this.arena);
    const match = this.match;
    if (match.phase === 'ready' && intent.press) {
      match.start();
      intent.press = false; // o clique de "começar" não vira saque
    } else if (match.phase === 'over' && intent.press && match.phaseTime > 0.8) {
      match.restart();
      intent.press = false;
    }
    // Tempo de simulação: hit-stop (congela) e slow motion (OUT!) afetam a partida e os personagens.
    let timeScale = 1;
    if (this.slowTimer > 0) { this.slowTimer -= dt; timeScale = 0.28; }
    let simDt = dt * timeScale;
    if (this.hitStop > 0) { this.hitStop -= dt; simDt = 0; }
    match.update(simDt, intent);
    this.handleEvents(match.consumeEvents());

    // --- visual
    const vdt = dt * timeScale;
    this.orb.update(vdt, match.ball);
    this.characters.player.update(vdt, time, match.fighters.player);
    this.characters.bot.update(vdt, time, match.fighters.bot);
    this.bounceMarks.update(vdt);
    this.burst.update(vdt);

    const sInfo = match.serveInfo;
    const playerServing = sInfo.inServe && sInfo.server === 'player';
    this.serveBox.update(time, sInfo.box, sInfo.inServe);
    this.serveRing.update(time, this.camera, this.orb.position, sInfo, playerServing && sInfo.active);

    // Mira: no saque, presa à caixa de saque; no rali, na metade do adversário.
    const A = gameConfig.aim;
    const p = match.fighters.player;
    let ax = intent.aimX, az = Math.min(intent.aimZ, -0.8);
    let region = rallyRegion(gameConfig.court, 1);
    let inside;
    if (playerServing) {
      [ax, az] = clampToBox(intent.aimX, intent.aimZ, sInfo.box);
      region = boxRegion(sInfo.box);
      inside = true;
    } else {
      inside = match.rules.isInside(ax, az);
    }
    const risk = riskAt(ax, az, region, A);
    const typicalDev = deviationDeg(0.5, risk, A) * (Math.PI / 180);   // espalhamento de uma rebatida "meio ruim"
    const spread = Math.hypot(ax - p.x, az - p.z) * Math.tan(typicalDev);
    this.aimMarker.update(time, ax, az, {
      inside, risk, spread,
      visible: match.phase === 'rally' || (playerServing && sInfo.active),
    });
    const scoreKey = `${match.state.score.player}-${match.state.score.bot}-${match.state.server}`;
    if (scoreKey !== this.lastScoreKey) {
      this.lastScoreKey = scoreKey;
      this.hud.setScore(match.state.score, match.state.server);
    }

    this.court.update(time);
    this.barrier.setTint(this.orb.color);
    this.barrier.update(time, dt, this.orb.position);
    this.obelisks.update(time);
    this.banners.update(time);
    this.islands.update(time);
    this.particles.update(time);

    this.arena.localToWorld(this.tmp.copy(this.orb.position));
    this.lightingRig.updateOrbLight(this.orb.color, this.tmp, this.orb.flash);

    this.cameraRig.update(dt);
    this.galaxy.group.position.copy(this.camera.position);
    this.galaxy.update(dt, time, this.orb.speedRatio);

    this.composer.render();
  }
}
