import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Câmera arcade fixa. A distância é calculada automaticamente para a quadra
 * inteira caber na tela em qualquer proporção (16:9, 4:3, celular em pé...).
 */
export class CameraRig {
  constructor(config, fitPoints) {
    this.config = config;
    this.fitPoints = fitPoints;
    this.camera = new THREE.PerspectiveCamera(
      config.fov,
      16 / 9,
      config.near,
      config.far,
    );
    this.pose = this.computePose(16 / 9);
    this.camera.position.copy(this.pose.position);
    this.camera.lookAt(this.pose.target);

    this.mouse = new THREE.Vector2();
    this.parallax = new THREE.Vector2();
    this.shakeAmp = 0;
    this.shakeDur = 0;
    this.shakeTime = 0;
    this.controls = null;
    this.domElement = null;
  }

  /** Posição ideal da câmera para um aspect ratio (sem alterar a câmera real). */
  computePose(aspect) {
    const cfg = this.config;
    const el = THREE.MathUtils.degToRad(cfg.elevationDeg);
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const cam = new THREE.PerspectiveCamera(cfg.fov, aspect, cfg.near, cfg.far);
    const tmp = new THREE.Vector3();
    const lim = cfg.fitMargin;

    const solve = (target) => {
      const fits = (d) => {
        cam.position.copy(target).addScaledVector(dir, d);
        cam.lookAt(target);
        cam.updateMatrixWorld(true);
        return this.fitPoints.every((p) => {
          tmp.copy(p).project(cam);
          return Math.abs(tmp.x) <= lim && Math.abs(tmp.y) <= lim;
        });
      };
      let lo = 8,
        hi = 250;
      for (let i = 0; i < 28; i += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };

    // Procura o ponto de mira que exige a menor distância (quadra bem centralizada).
    let best = null;
    for (let tz = -4; tz <= 4.01; tz += 0.5) {
      const target = new THREE.Vector3(
        cfg.target[0],
        cfg.target[1],
        cfg.target[2] + tz,
      );
      const d = solve(target);
      if (!best || d < best.d) best = { d, target };
    }
    return {
      position: best.target.clone().addScaledVector(dir, best.d),
      target: best.target,
    };
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.pose = this.computePose(aspect);
  }

  /** Tremor de câmera para ultimates e impactos. */
  shake(intensity = 0.3, duration = 0.3) {
    this.shakeAmp = Math.max(this.shakeAmp, intensity);
    this.shakeDur = duration;
    this.shakeTime = 0;
  }

  applyScreenShake(strength) {
    this.shake(strength, 0.25);
  }

  attachDebug(domElement) {
    this.domElement = domElement;
  }

  /** Tecla C: alterna entre a câmera de jogo e uma câmera livre (OrbitControls). */
  toggleDebugMode() {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
      return;
    }
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.target.copy(this.pose.target);
    this.controls.enableDamping = true;
  }

  update(dt) {
    if (this.controls) {
      this.controls.update();
      return;
    }
    const p = this.config.parallax;
    this.parallax.lerp(this.mouse, 1 - Math.exp(-dt * 4));
    const desired = this.pose.position.clone();
    desired.x += this.parallax.x * p;
    desired.y += -this.parallax.y * p * 0.6;

    if (this.shakeAmp > 0.001) {
      this.shakeTime += dt;
      const k = Math.max(0, 1 - this.shakeTime / this.shakeDur);
      const a = this.shakeAmp * k * k;
      desired.x += (Math.random() - 0.5) * a;
      desired.y += (Math.random() - 0.5) * a * 0.7;
      if (k <= 0) this.shakeAmp = 0;
    }
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 10));
    this.camera.lookAt(this.pose.target);
  }
}
