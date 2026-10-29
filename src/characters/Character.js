<<<<<<< HEAD
import * as THREE from 'three';
import { loadCharacter } from './CharacterLoader.js';
import { animateWizard } from './ProceduralWizard.js';
import { getShadowTexture } from '../utils/textures.js';
=======
import * as THREE from "three";
import { loadCharacter } from "./CharacterLoader.js";
import { animateWizard } from "./ProceduralWizard.js";
import { getShadowTexture } from "../utils/textures.js";
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d

/**
 * Mago em cena. Posição/rotação vêm da simulação (fighter); aqui só desenhamos e animamos.
 * Filho do grupo `arena` (oscila junto com a laje).
 */
export class Character {
  constructor(def, maxSpeed) {
    this.def = def;
    this.maxSpeed = maxSpeed;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.rig = null;
    this.mixer = null;
    this.actions = null;
    this.current = null;
    this.ready = false;

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2),
<<<<<<< HEAD
      new THREE.MeshBasicMaterial({ map: getShadowTexture(), color: '#02040f', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
=======
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(),
        color: "#02040f",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
    );
    this.shadow.position.y = 0.035;
    this.shadow.renderOrder = 2;
    this.group.add(this.shadow);

    this.load();
  }

  async load() {
    const res = await loadCharacter(this.def);
    this.inner.add(res.object);
    this.rig = res.rig;
    this.mixer = res.mixer;
    this.actions = res.actions || null;
    this.fallback = res.fallback;
    if (this.rig) this.rig.flashColor.set(this.def.accent);
    this.ready = true;
<<<<<<< HEAD
    this.play('idle');
=======
    this.play("idle");
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
  }

  /** GLB: troca de animação com fade. */
  play(name, { once = false, duration = 0 } = {}) {
    if (!this.actions) return;
    const next = this.actions[name] || this.actions.idle;
    if (!next || this.current === next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
<<<<<<< HEAD
    if (once && duration > 0) next.timeScale = next.getClip().duration / duration;
=======
    if (once && duration > 0)
      next.timeScale = next.getClip().duration / duration;
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
    else next.timeScale = 1;
    next.play();
    if (this.current) this.current.crossFadeTo(next, 0.12, false);
    this.current = next;
  }

  /** Feedback de golpe: o escudo brilha (mais forte no Parry perfeito). */
  flashShield(quality) {
    if (!this.rig) return;
<<<<<<< HEAD
    this.rig.flash = quality === 'perfect' ? 1 : 0.55;
    this.rig.flashColor.set(quality === 'perfect' ? '#ffffff' : this.def.accent);
=======
    this.rig.flash = quality === "perfect" ? 1 : 0.55;
    this.rig.flashColor.set(
      quality === "perfect" ? "#ffffff" : this.def.accent,
    );
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
  }

  update(dt, time, f) {
    this.group.position.set(f.x, 0, f.z);
    this.inner.rotation.y = f.yaw + (this.def.yawOffset || 0);
    if (!this.ready) return;

    const swingT = f.animT >= 0 ? f.animT / f.animDur : -1;
    if (this.rig) {
<<<<<<< HEAD
      animateWizard(this.rig, { vx: f.vx, vz: f.vz, yaw: f.yaw, swingT, mood: f.mood }, dt, time, this.maxSpeed);
    } else if (this.mixer) {
      const moving = Math.hypot(f.vx, f.vz) > 0.8;
      if (f.mood === 'win') this.play('win');
      else if (f.mood === 'lose') this.play('lose');
      else if (swingT >= 0) this.play('swing', { once: true, duration: f.animDur });
      else this.play(moving ? 'run' : 'idle');
=======
      animateWizard(
        this.rig,
        { vx: f.vx, vz: f.vz, yaw: f.yaw, swingT, mood: f.mood },
        dt,
        time,
        this.maxSpeed,
      );
    } else if (this.mixer) {
      const moving = Math.hypot(f.vx, f.vz) > 0.8;
      if (f.mood === "win") this.play("win");
      else if (f.mood === "lose") this.play("lose");
      else if (swingT >= 0)
        this.play("swing", { once: true, duration: f.animDur });
      else this.play(moving ? "run" : "idle");
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
      this.mixer.update(dt);
    }
  }
}
