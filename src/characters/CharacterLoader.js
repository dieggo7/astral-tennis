<<<<<<< HEAD
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildProceduralWizard } from './ProceduralWizard.js';
=======
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildProceduralWizard } from "./ProceduralWizard.js";
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d

/** Acha um clipe pelo nome (ou trecho do nome), sem diferenciar maiúsculas. */
function findClip(clips, hint) {
  if (!hint) return null;
  const h = hint.toLowerCase();
<<<<<<< HEAD
  return clips.find((c) => c.name.toLowerCase() === h) || clips.find((c) => c.name.toLowerCase().includes(h)) || null;
=======
  return (
    clips.find((c) => c.name.toLowerCase() === h) ||
    clips.find((c) => c.name.toLowerCase().includes(h)) ||
    null
  );
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
}

/**
 * Carrega o mago: tenta o GLB em def.model; se não existir ou falhar, devolve o
 * mago procedural. Contrato de animação: idle, run, swing, win, lose.
 */
export async function loadCharacter(def) {
  if (def.model) {
    try {
      // O servidor do Vite responde 200 com HTML para arquivos inexistentes; checamos o tipo.
<<<<<<< HEAD
      const head = await fetch(def.model, { method: 'HEAD' });
      const type = head.headers.get('content-type') || '';
      if (head.ok && !type.includes('text/html')) {
        const gltf = await new GLTFLoader().loadAsync(def.model);
        const object = gltf.scene;
        object.scale.setScalar(def.scale || 1);
        object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
=======
      const head = await fetch(def.model, { method: "HEAD" });
      const type = head.headers.get("content-type") || "";
      if (head.ok && !type.includes("text/html")) {
        const gltf = await new GLTFLoader().loadAsync(def.model);
        const object = gltf.scene;
        object.scale.setScalar(def.scale || 1);
        object.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
        const mixer = new THREE.AnimationMixer(object);
        const actions = {};
        Object.entries(def.clips || {}).forEach(([key, hint]) => {
          const clip = findClip(gltf.animations, hint);
          if (clip) actions[key] = mixer.clipAction(clip);
        });
<<<<<<< HEAD
        if (!actions.idle && gltf.animations[0]) actions.idle = mixer.clipAction(gltf.animations[0]);
        return { object, rig: null, mixer, actions, fallback: false };
      }
    } catch (err) {
      console.warn(`[Astral Tennis] Falha ao carregar ${def.model}; usando mago procedural.`, err);
=======
        if (!actions.idle && gltf.animations[0])
          actions.idle = mixer.clipAction(gltf.animations[0]);
        return { object, rig: null, mixer, actions, fallback: false };
      }
    } catch (err) {
      console.warn(
        `[Astral Tennis] Falha ao carregar ${def.model}; usando mago procedural.`,
        err,
      );
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
    }
  }
  return buildProceduralWizard(def);
}
