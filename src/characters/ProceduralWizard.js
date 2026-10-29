import * as THREE from "three";

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Mago procedural (placeholder até existir o GLB). Construído olhando para +Z.
 * Raquete = escudo repulsor circular na frente da varinha.
 */
export function buildProceduralWizard(def) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // balança/inclina
  root.add(body);

  const robeMat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.55,
    emissive: def.color,
    emissiveIntensity: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: def.accent,
    roughness: 0.35,
    metalness: 0.4,
    emissive: def.accent,
    emissiveIntensity: 0.35,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: "#f1c9a5",
    roughness: 0.7,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.55),
    roughness: 0.6,
  });

  const robe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.62, 1.15, 20),
    robeMat,
  );
  robe.position.y = 0.58;
  const chest = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.31, 0.3, 6, 16),
    robeMat,
  );
  chest.position.y = 1.3;
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.05, 8, 24),
    trimMat,
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.08;
  const hem = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.04, 8, 28),
    trimMat,
  );
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), skinMat);
  head.position.y = 1.82;
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24),
    hatMat,
  );
  brim.position.y = 1.98;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.85, 20), hatMat);
  hat.position.set(0, 2.42, -0.04);
  hat.rotation.x = -0.18;
  const hatBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.035, 8, 24),
    trimMat,
  );
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.y = 2.06;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skinMat);
  nose.position.set(0, 1.8, 0.25);
  body.add(robe, chest, belt, hem, head, brim, hat, hatBand, nose);

  // Silhueta e acessórios próprios para distinguir os quatro modelos mesmo sem GLB.
  const details = new THREE.Group();
  body.add(details);
  const detailMat = new THREE.MeshStandardMaterial({
    color: def.accent,
    roughness: 0.25,
    metalness: 0.35,
    emissive: def.accent,
    emissiveIntensity: 0.8,
  });
  if (def.id === "ignis") {
    [-0.2, 0, 0.2].forEach((x, i) => {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.42 + (i === 1 ? 0.12 : 0), 8),
        detailMat,
      );
      flame.position.set(x, 2.72, -0.2);
      flame.rotation.z = x * -1.5;
      details.add(flame);
    });
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      detailMat,
    );
    shoulder.position.set(-0.38, 1.47, -0.03);
    details.add(shoulder);
  } else if (def.id === "glacia") {
    [-0.24, -0.08, 0.08, 0.24].forEach((x, i) => {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.17 + (i % 2) * 0.05),
        detailMat,
      );
      crystal.position.set(x, 2.12 + (i % 2) * 0.08, 0.01);
      crystal.scale.set(0.8, 1.5, 0.8);
      details.add(crystal);
    });
    [-1, 1].forEach((side) => {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2),
        detailMat,
      );
      shard.position.set(side * 0.47, 1.48, -0.02);
      shard.scale.set(0.7, 1.4, 0.7);
      details.add(shard);
    });
  } else if (def.id === "zephyr") {
    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.055, 8, 32),
      detailMat,
    );
    sash.position.set(0, 0.82, 0);
    sash.rotation.x = Math.PI / 2;
    sash.rotation.z = 0.24;
    details.add(sash);
    [-1, 1].forEach((side) => {
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.72, 8),
        detailMat,
      );
      feather.position.set(side * 0.4, 1.46, -0.25);
      feather.rotation.z = side * -0.75;
      feather.rotation.x = -0.5;
      details.add(feather);
    });
  } else if (def.id === "volta") {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.055, 8, 28),
      detailMat,
    );
    coil.position.set(0, 1.46, 0);
    coil.rotation.x = Math.PI / 2;
    details.add(coil);
    [-0.22, 0.22].forEach((x) => {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 10),
        detailMat,
      );
      node.position.set(x, 2.08, -0.05);
      details.add(node);
    });
    const aerial = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.42, 6),
      detailMat,
    );
    aerial.position.set(0, 2.85, -0.05);
    details.add(aerial);
  }
  body.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // Braço + varinha (pivô no ombro direito)
  const armPivot = new THREE.Group();
  armPivot.position.set(0.38, 1.5, 0);
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 0.62, 10),
    robeMat,
  );
  arm.rotation.x = Math.PI / 2;
  arm.position.z = 0.31;
  const wand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.03, 1.0, 8),
    new THREE.MeshStandardMaterial({ color: "#4a2b16", roughness: 0.7 }),
  );
  wand.rotation.x = Math.PI / 2;
  wand.position.z = 0.9;
  const tipMat = new THREE.MeshStandardMaterial({
    color: "#201020",
    emissive: def.accent,
    emissiveIntensity: 2.4,
  });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), tipMat);
  tip.position.z = 1.42;
  armPivot.add(arm, wand, tip);
  body.add(armPivot);

  // Escudo repulsor (a "raquete"): só aparece durante o golpe
  const shield = new THREE.Group();
  shield.position.set(0.2, 1.5, 1.15);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.accent).multiplyScalar(1.6),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.92, 40),
    shieldMat,
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 40),
    shieldMat.clone(),
  );
  disc.material.opacity = 0;
  shield.add(ring, disc);
  root.add(shield);

  const rig = {
    body,
    armPivot,
    shield,
    shieldMat,
    discMat: disc.material,
    tipMat,
    flash: 0,
    flashColor: new THREE.Color(),
    runPhase: 0,
  };
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
  if (st.mood === "win") {
    armRot = -2.5 + Math.sin(time * 9) * 0.25;
    bob = Math.abs(Math.sin(time * 6)) * 0.35;
  } else if (st.mood === "lose") {
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
