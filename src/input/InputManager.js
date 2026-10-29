import * as THREE from 'three';

/**
 * Teclado + mouse -> intents (dados puros) para a simulação.
 *  - Mover: WASD ou setas  (W/↑ = rumo à barreira, S/↓ = rumo ao fundo)
 *  - Parry / sacar: botão esquerdo do mouse (Espaço também funciona)
 *  - Mirar: posição do cursor sobre a quadra
 */
export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressQueued = false;
    this.strongPressQueued = false;
    this.dashQueued = false;
    this.ultimateQueued = false;
    this.ndc = new THREE.Vector2(0, -0.3);
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.aim = { x: 0, z: -6 };

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') this.pressQueued = true;
      if (e.code === 'KeyE') this.dashQueued = true;
      if (e.code === 'KeyQ') this.ultimateQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointermove', (e) => {
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    window.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.pressQueued = true;
      if (e.button === 2) this.strongPressQueued = true;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Ponto do cursor sobre o plano da quadra (espaço local da arena). */
  updateAim(camera, arena) {
    this.raycaster.setFromCamera(this.ndc, camera);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    // plano da quadra em coordenadas de mundo (a arena oscila em Y)
    this.plane.constant = -arena.position.y;
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      arena.worldToLocal(this.hit);
      // limita a mira a um pouco além das linhas (dá para errar, mas não para mirar no infinito)
      this.aim.x = Math.max(-9, Math.min(9, this.hit.x));
      this.aim.z = Math.max(-15, Math.min(15, this.hit.z));
    } else {
      this.aim.x = origin.x + dir.x * 10;
    }
    return this.aim;
  }

  /** Intent do frame. O clique é "de borda": só vale uma vez. */
  read(camera, arena) {
    const k = this.keys;
    const moveX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const moveZ = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const aim = this.updateAim(camera, arena);
    const press = this.pressQueued;
    const strongPress = this.strongPressQueued;
    const dashPress = this.dashQueued;
    const ultimatePress = this.ultimateQueued;
    this.pressQueued = false;
    this.strongPressQueued = false;
    this.dashQueued = false;
    this.ultimateQueued = false;
    return { moveX, moveZ, press, strongPress, dashPress, ultimatePress, aimX: aim.x, aimZ: aim.z };
  }
}
