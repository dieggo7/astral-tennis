import * as THREE from 'three';

export class LightingRig {
  constructor(config) {
    const e = config.environment;
    this.group = new THREE.Group();
    this.baseOrbIntensity = e.orbPointIntensity;

    this.group.add(new THREE.HemisphereLight(0x9a8cff, 0x1a1050, e.hemiIntensity));

    this.mainLight = new THREE.DirectionalLight(0xbcc8ff, e.directionalIntensity);
    this.mainLight.position.set(-7, 15, 11);
    this.mainLight.castShadow = e.shadowMapEnabled;
    const s = this.mainLight.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.left = -18; s.camera.right = 18; s.camera.top = 18; s.camera.bottom = -18;
    s.camera.near = 1; s.camera.far = 50;
    s.bias = -0.0005;
    s.normalBias = 0.03;
    this.group.add(this.mainLight);

    const rimMagenta = new THREE.DirectionalLight(0xff4fd8, e.rimMagenta);
    rimMagenta.position.set(12, 7, -14);
    const rimCyan = new THREE.DirectionalLight(0x4fd0ff, e.rimCyan);
    rimCyan.position.set(-12, 7, -14);
    this.group.add(rimMagenta, rimCyan);

    this.orbLight = new THREE.PointLight(0x3da5ff, e.orbPointIntensity, e.orbDistance, e.orbDecay);
    this.group.add(this.orbLight);
  }

  /** Luz do orbe acompanha posição e cor; `boost` (0..1) dá um pulso ao quicar/rebater. */
  updateOrbLight(color, worldPos, boost = 0) {
    this.orbLight.color.copy(color);
    this.orbLight.position.copy(worldPos).y += 0.5;
    this.orbLight.intensity = this.baseOrbIntensity * (1 + boost * 0.8);
  }
}
