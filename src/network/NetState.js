const INTERPOLATION_DELAY_MS = 100;
const MAX_BUFFER = 24;

/** Snapshot queue, remote interpolation and lightweight local movement prediction. */
export class NetState {
  constructor({ interpolationDelay = INTERPOLATION_DELAY_MS } = {}) {
    this.delay = interpolationDelay;
    this.snapshots = [];
    this.localFighterId = null;
    this.predicted = null;
    this.pending = [];
    this.correction = { x: 0, z: 0 };
    this.lastSampleAt = 0;
    this.movement = { width: 12, length: 24, accel: 55, minZ: 1.2, swingMoveFactor: 0.5 };
    this.ping = 0;
    this.serverOffset = 0;
  }

  setMovementConfig(config) {
    if (!config) return;
    this.movement = {
      width: config.court?.width || this.movement.width,
      length: config.court?.length || this.movement.length,
      accel: config.player?.accel || this.movement.accel,
      minZ: config.player?.minZ || this.movement.minZ,
      swingMoveFactor: config.parry?.swingMoveFactor || this.movement.swingMoveFactor,
    };
  }

  setLocalFighter(fighterId) {
    this.localFighterId = fighterId;
    this.predicted = null;
    this.pending = [];
    this.correction = { x: 0, z: 0 };
    this.lastSampleAt = 0;
  }

  push(snapshot) {
    this.snapshots.push(snapshot);
    this.snapshots.sort((a, b) => a.serverTime - b.serverTime);
    if (this.snapshots.length > MAX_BUFFER) this.snapshots.shift();
    if (this.localFighterId) this.reconcile(snapshot);
  }

  predict(input, seq, dt) {
    if (!this.localFighterId) return;
    const latest = this.snapshots.at(-1);
    const fighter = latest?.players.find((p) => p.fighterId === this.localFighterId);
    if (!fighter) return;
    if (!this.predicted) this.predicted = predictionState(fighter);
    const d = Math.min(Math.max(dt, 0), 0.05);
    this.predicted = stepMovement(this.predicted, input, d, fighter, this.movement);
    this.pending.push({
      seq,
      moveX: input.moveX || 0,
      moveZ: input.moveZ || 0,
      dt: d,
      swinging: !!fighter.swinging,
    });
    if (this.pending.length > 180) this.pending.shift();
  }

  reconcile(snapshot) {
    const fighter = snapshot.players.find((p) => p.fighterId === this.localFighterId);
    if (!fighter) return;
    const ack = snapshot.ack?.[this.localFighterId] ?? -1;
    this.pending = this.pending.filter((input) => input.seq > ack);
    const oldRender = this.predicted
      ? { x: this.predicted.x + this.correction.x, z: this.predicted.z + this.correction.z }
      : null;
    this.predicted = predictionState(fighter);
    for (const input of this.pending) this.predicted = stepMovement(this.predicted, input, input.dt, { ...fighter, swinging: input.swinging }, this.movement);
    if (oldRender) {
      this.correction.x = oldRender.x - this.predicted.x;
      this.correction.z = oldRender.z - this.predicted.z;
    }
  }

  sample(clientNow = Date.now()) {
    if (!this.snapshots.length) return null;
    const now = clientNow;
    const sampleDt = this.lastSampleAt ? Math.min(0.05, Math.max(0, (now - this.lastSampleAt) / 1000)) : 0;
    this.lastSampleAt = now;
    const correctionDecay = Math.exp(-sampleDt / 0.09);
    this.correction.x *= correctionDecay;
    this.correction.z *= correctionDecay;
    const target = clientNow + this.serverOffset - this.delay;
    let before = this.snapshots[0], after = this.snapshots.at(-1);
    for (let i = 1; i < this.snapshots.length; i += 1) {
      if (this.snapshots[i].serverTime >= target) {
        before = this.snapshots[i - 1]; after = this.snapshots[i]; break;
      }
      before = this.snapshots[i];
    }
    const span = Math.max(1, after.serverTime - before.serverTime);
    const alpha = Math.max(0, Math.min(1, (target - before.serverTime) / span));
    const result = structuredClone(alpha >= 1 ? after : before);
    if (before !== after && alpha < 1) {
      result.orb = interpolateObject(before.orb, after.orb, alpha);
      const remote = new Map(after.players.map((p) => [p.fighterId, p]));
      result.players = before.players.map((p) => {
        const q = remote.get(p.fighterId);
        return q ? { ...p, x: lerp(p.x, q.x, alpha), z: lerp(p.z, q.z, alpha), yaw: angleLerp(p.yaw, q.yaw, alpha) } : p;
      });
    }
    if (this.localFighterId && this.predicted) {
      const local = result.players.find((p) => p.fighterId === this.localFighterId);
      if (local) {
        local.x = this.predicted.x + this.correction.x;
        local.z = this.predicted.z + this.correction.z;
        local.vx = this.predicted.vx;
        local.vz = this.predicted.vz;
      }
    }
    return result;
  }
}

function predictionState(fighter) {
  return { x: fighter.x, z: fighter.z, vx: fighter.vx || 0, vz: fighter.vz || 0 };
}

function stepMovement(state, input, dt, fighter, config) {
  let moveX = Math.max(-1, Math.min(1, input.moveX || 0));
  let moveZ = Math.max(-1, Math.min(1, input.moveZ || 0));
  const length = Math.hypot(moveX, moveZ);
  if (length > 1) { moveX /= length; moveZ /= length; }
  const speed = fighter.moveSpeed || 9.5;
  const swingFactor = fighter.swinging ? config.swingMoveFactor : 1;
  const accel = config.accel * dt;
  const vx = state.vx + clamp(moveX * speed * swingFactor - state.vx, -accel, accel);
  const vz = state.vz + clamp(moveZ * speed * swingFactor - state.vz, -accel, accel);
  let x = state.x + vx * dt;
  let z = state.z + vz * dt;
  const halfWidth = config.width / 2;
  const halfLength = config.length / 2;
  const maxX = halfWidth - 0.3;
  const maxZ = halfLength - 0.3;
  const sign = fighter.team === "B" || fighter.team === "bot" || fighter.sign < 0 ? -1 : 1;
  const zLo = sign > 0 ? config.minZ : -maxZ;
  const zHi = sign > 0 ? maxZ : -config.minZ;
  let nextVx = vx, nextVz = vz;
  if (x > maxX || x < -maxX) { x = clamp(x, -maxX, maxX); nextVx = 0; }
  if (z < zLo || z > zHi) { z = clamp(z, zLo, zHi); nextVz = 0; }
  return { x, z, vx: nextVx, vz: nextVz };
}

function interpolateObject(a, b, t) {
  const result = { ...a };
  for (const key of ["x", "y", "z", "vx", "vy", "vz", "speed"]) result[key] = lerp(a[key] || 0, b[key] || 0, t);
  return result;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function angleLerp(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
