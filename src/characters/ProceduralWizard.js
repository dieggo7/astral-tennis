import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Mago procedural (placeholder até existir o GLB). Construído olhando para +Z.
 * Raquete = escudo repulsor circular na frente da varinha.
 */
export function buildProceduralWizard(def) {
  const root = new THREE.Group();
  const body = new THREE.Group();      // balança/inclina
  root.add(body);

  const robeMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, emissive: def.color, emissiveIntensity: 0.18 });
  const trimMat = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.35, metalness: 0.4, emissive: def.accent, emissiveIntensity: 0.35 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#f1c9a5', roughness: 0.7 });
  const hatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color).multiplyScalar(0.55), roughness: 0.6 });

  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.62, 1.15, 20), robeMat);
  robe.position.y = 0.58;
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.3, 6, 16), robeMat);
  chest.position.y = 1.3;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 8, 24), trimMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.08;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 28), trimMat);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), skinMat);
  head.position.y = 1.82;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24), hatMat);
  brim.position.y = 1.98;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.85, 20), hatMat);
  hat.position.set(0, 2.42, -0.04);
  hat.rotation.x = -0.18;
  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), trimMat);
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.y = 2.06;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skinMat);
  nose.position.set(0, 1.8, 0.25);
  body.add(robe, chest, belt, hem, head, brim, hat, hatBand, nose);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // Braço + varinha (pivô no ombro direito)
  const armPivot = new THREE.Group();
  armPivot.position.set(0.38, 1.5, 0);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.62, 10), robeMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = 0.31;
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.0, 8), new THREE.MeshStandardMaterial({ color: '#4a2b16', roughness: 0.7 }));
  wand.rotation.x = Math.PI / 2;
  wand.position.z = 0.9;
  const tipMat = new THREE.MeshStandardMaterial({ color: '#201020', emissive: def.accent, emissiveIntensity: 2.4 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), tipMat);
  tip.position.z = 1.42;
  armPivot.add(arm, wand, tip);
  body.add(armPivot);

  // Escudo repulsor (a "raquete"): só aparece durante o golpe
  const shield = new THREE.Group();
  shield.position.set(0.2, 1.5, 1.15);
  const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.92, 40), shieldMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.78, 40), shieldMat.clone());
  disc.material.opacity = 0;
  shield.add(ring, disc);
  root.add(shield);

  const rig = { body, armPivot, shield, shieldMat, discMat: disc.material, tipMat, flash: 0, flashColor: new THREE.Color(), runPhase: 0 };
  return { object: root, rig, mixer: null, fallback: true };
}

/** Anima o mago procedural. st = { vx, vz, yaw, swingT (0..1 ou -1), mood }. */
export function animateWizard(rig, st, dt, time, maxSpeed) {
  const { body, armPivot, shield, shieldMat, discMat } = rig;
  const speed = Math.hypot(st.vx, st.vz);
  const k = clamp(speed / maxSpeed, 0, 1);
  rig.runPhase += dt * (6 + k * 10);

  // Velocidade no referencial do mago (frente = +Z local)
  const localZ = st.vx * Math.sin(st.yaw) + st.vz * Math.cos(st.yaw);
  const localX = st.vx * Math.cos(st.yaw) - st.vz * Math.sin(st.yaw);

  let bob = Math.sin(time * 2.2) * 0.03;
  let leanX = (localZ / maxSpeed) * 0.32;
  let leanZ = (-localX / maxSpeed) * 0.32;
  if (k > 0.1) bob = Math.abs(Math.sin(rig.runPhase)) * 0.09 * k;

  let armRot = -0.35 + Math.sin(time * 2.2) * 0.03;
  let shieldOpacity = 0;
  let shieldScale = 1;

  if (st.swingT >= 0) {
    // Varinha sobe e desce; o escudo abre perto do meio do golpe.
    const t = clamp(st.swingT, 0, 1);
    armRot = -1.35 + ease(t) * 2.0;
    shieldOpacity = Math.sin(clamp(t * 1.4, 0, 1) * Math.PI) * 0.5;
    shieldScale = 0.7 + t * 0.7;
    leanX += 0.18 * Math.sin(t * Math.PI);
  }
  if (st.mood === 'win') {
    armRot = -2.5 + Math.sin(time * 9) * 0.25;
    bob = Math.abs(Math.sin(time * 6)) * 0.35;
  } else if (st.mood === 'lose') {
    leanX = 0.35;
    armRot = 0.9;
    bob = -0.04;
  }

  rig.flash = Math.max(0, rig.flash - dt * 2.5);
  if (rig.flash > 0) {
    shieldOpacity = Math.max(shieldOpacity, rig.flash * 0.9);
    shieldScale += (1 - rig.flash) * 0.9;
  }

  body.position.y = bob;
  body.rotation.x += (leanX - body.rotation.x) * Math.min(1, dt * 12);
  body.rotation.z += (leanZ - body.rotation.z) * Math.min(1, dt * 12);
  armPivot.rotation.x = armRot;
  shield.scale.setScalar(shieldScale);
  shieldMat.opacity = shieldOpacity;
  discMat.opacity = shieldOpacity * 0.35;
  if (rig.flash > 0) {
    shieldMat.color.copy(rig.flashColor).multiplyScalar(1.6);
    discMat.color.copy(rig.flashColor).multiplyScalar(1.2);
  }
}
