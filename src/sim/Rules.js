export const PLAYER = 'player';
export const BOT = 'bot';
/** Lado da quadra de cada um: jogador em z > 0 (perto da câmera), rival em z < 0. */
export const sideSign = (who) => (who === PLAYER ? 1 : -1);
export const other = (who) => (who === PLAYER ? BOT : PLAYER);

/**
 * Regras de tênis do rali (puras):
 *  - O orbe precisa quicar primeiro DENTRO da quadra do adversário (linha vale como dentro).
 *  - Quique fora, na própria quadra, ou rede baixa = ponto do adversário.
 *  - Quem recebe pode rebater no ar (voleio) ou depois de UM quique.
 *  - Segundo quique no lado de quem recebe = ponto de quem rebateu.
 *  - Ninguém rebate duas vezes seguidas.
 * Simplificações do MVP: sem caixa de saque, sem segundo saque, sem vantagem (deuce).
 */
export class Rules {
  constructor(court, netClearCenter) {
    this.halfW = court.width / 2 + court.tolerance;
    this.halfL = court.length / 2 + court.tolerance;
    this.netClear = netClearCenter; // altura mínima do CENTRO do orbe ao cruzar a barreira
    this.newPoint();
  }

  newPoint() {
    this.state = 'serve';   // 'serve' | 'live' | 'dead'
    this.lastHitter = null;
    this.bounces = 0;
  }

  onHit(who) {
    this.state = 'live';
    this.lastHitter = who;
    this.bounces = 0;
  }

  /** Quem pode rebater agora: orbe vivo, na metade de quem vai rebater, e não foi ele o último. */
  canHit(who, ballZ) {
    return this.state === 'live' && this.lastHitter !== who && Math.sign(ballZ) === sideSign(who);
  }

  isInside(x, z) {
    return Math.abs(x) <= this.halfW && Math.abs(z) <= this.halfL;
  }

  verdict(winner, reason) {
    this.state = 'dead';
    return { winner, reason };
  }

  onBounce(x, z) {
    if (this.state !== 'live') return null;
    const hitter = this.lastHitter;
    this.bounces += 1;
    if (this.bounces === 1) {
      if (Math.sign(z) === sideSign(hitter)) return this.verdict(other(hitter), 'Caiu na própria quadra!');
      if (!this.isInside(x, z)) return this.verdict(other(hitter), 'Fora!');
      return null;
    }
    return this.verdict(hitter, 'Dois quiques!');
  }

  onNetCross(y) {
    if (this.state !== 'live' || this.bounces > 0) return null;
    if (y < this.netClear) return this.verdict(other(this.lastHitter), 'Na rede!');
    return null;
  }

  /** O orbe caiu no vácuo sem ser julgado (quique fora da laje). */
  onFall() {
    if (this.state !== 'live') return null;
    return this.bounces === 0
      ? this.verdict(other(this.lastHitter), 'Fora!')
      : this.verdict(this.lastHitter, 'Dois quiques!');
  }
}
