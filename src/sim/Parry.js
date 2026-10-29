/**
 * Parry: o escudo repulsor na ponta da varinha.
 * O clique inicia um golpe de `duration` segundos. Se o orbe entra no alcance
 * durante o golpe, ocorre o contato. A qualidade depende de quando o contato
 * acontece em relação ao instante secreto `sweetTime`:
 *   - dentro de perfectWindow -> 'perfect'
 *   - qualquer outro momento do golpe -> 'normal'
 *   - orbe nunca entra no alcance -> erro (whiff), com recarga maior
 * Clicar tarde demais (orbe já no alcance) dá 'normal'; clicar cedo demais erra.
 */
export class Parry {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.swinging = false;
    this.t = 0;
    this.cooldown = 0;
    this.connected = false;
  }

  press() {
    if (this.swinging || this.cooldown > 0) return false;
    this.swinging = true;
    this.t = 0;
    this.connected = false;
    return true;
  }

  /** Retorna 'whiff' no frame em que um golpe termina sem acertar. */
  update(dt) {
    if (this.swinging) {
      this.t += dt;
      if (this.t >= this.cfg.duration) {
        this.swinging = false;
        const whiff = !this.connected;
        this.cooldown = whiff ? this.cfg.cooldownMiss : this.cfg.cooldownHit;
        return whiff ? "whiff" : null;
      }
    } else if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }
    return null;
  }

  get canConnect() {
    return this.swinging && !this.connected;
  }

  /** Chamado quando o orbe entra no alcance. error > 0 = contato depois do ideal. */
  connect() {
    const error = this.t - this.cfg.sweetTime;
    this.connected = true;
    return {
      quality: Math.abs(error) <= this.cfg.perfectWindow ? "perfect" : "normal",
      error,
    };
  }
}
