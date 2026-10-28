import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { arenaConfig, getFitPoints } from '../config/constants.js';
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
    this.arena.add(this.court.group, this.barrier.group, this.obelisks.group, this.banners.group, ...this.orb.objects);
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
      if (e.code === 'Space') { e.preventDefault(); this.orb.reset(); }
      if (e.code === 'KeyR') this.orb.hit();
      if (e.code === 'KeyC') this.cameraRig.toggleDebugMode();
      if (e.code === 'KeyB') this.bloomPass.enabled = !this.bloomPass.enabled;
    });
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    pointUniforms.uTime.value = time;

    this.arena.position.y = Math.sin(time * arenaConfig.court.floatSpeed) * arenaConfig.court.floatAmplitude;

    this.orb.update(dt);
    const ev = this.orb.consumeEvents();
    if (ev.cross) {
      this.barrier.pulse(this.orb.position, 0.6 + this.orb.speedRatio);
      this.cameraRig.shake(0.08 + this.orb.speedRatio * 0.12, 0.2);
    }
    if (ev.hit) this.cameraRig.shake(0.1 + this.orb.speedRatio * 0.2, 0.25);

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
