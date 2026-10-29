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
    this.ping = 0;
    this.serverOffset = 0;
  }

  setLocalFighter(fighterId) {
    this.localFighterId = fighterId;
    this.predicted = null;
    this.pending = [];
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
    if (!this.predicted) this.predicted = { x: fighter.x, z: fighter.z };
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));
    const moveZ = Math.max(-1, Math.min(1, input.moveZ || 0));
    const length = Math.hypot(moveX, moveZ) || 1;
    const speed = fighter.moveSpeed || 9.5;
    const d = Math.min(Math.max(dt, 0), 0.05);
    this.predicted.x += (moveX / length) * speed * d;
    this.predicted.z += (moveZ / length) * speed * d;
    this.pending.push({ seq, moveX, moveZ, dt: d });
    if (this.pending.length > 180) this.pending.shift();
  }

  reconcile(snapshot) {
    const fighter = snapshot.players.find((p) => p.fighterId === this.localFighterId);
    if (!fighter) return;
    const ack = snapshot.ack?.[this.localFighterId] ?? -1;
    this.pending = this.pending.filter((input) => input.seq > ack);
    this.predicted = { x: fighter.x, z: fighter.z };
    const speed = fighter.moveSpeed || 9.5;
    for (const input of this.pending) {
      const length = Math.hypot(input.moveX, input.moveZ) || 1;
      this.predicted.x += (input.moveX / length) * speed * input.dt;
      this.predicted.z += (input.moveZ / length) * speed * input.dt;
    }
  }

  sample(clientNow = Date.now()) {
    if (!this.snapshots.length) return null;
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
      if (local) Object.assign(local, this.predicted);
    }
    return result;
  }
}

function interpolateObject(a, b, t) {
  const result = { ...a };
  for (const key of ["x", "y", "z", "vx", "vy", "vz", "speed"]) result[key] = lerp(a[key] || 0, b[key] || 0, t);
  return result;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function angleLerp(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
