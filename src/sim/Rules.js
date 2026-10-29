export const PLAYER = "player";
export const BOT = "bot";
/** Lado da quadra de cada um: jogador em z > 0 (perto da câmera), rival em z < 0. */
export const sideSign = (who) => teamSideSign(who);
export const other = (who) => (who === PLAYER ? BOT : PLAYER);

// Team helpers also accept future fighter ids (A1/A2/B1/B2); legacy player/bot
// remain valid aliases for the existing 1v1 simulation.
export const teamOf = (fighterId) => {
  if (fighterId === PLAYER || fighterId === "A1" || fighterId === "A2") return PLAYER;
  if (fighterId === BOT || fighterId === "B1" || fighterId === "B2") return BOT;
  return fighterId;
};
export const teamSideSign = (team) => (teamOf(team) === PLAYER ? 1 : -1);
export const otherTeam = (team) => {
  if (team === PLAYER) return BOT;
  if (team === BOT) return PLAYER;
  return teamOf(team) === PLAYER ? BOT : PLAYER;
};

/**
 * Regras de tênis do rali (puras):
 *  - O orbe precisa quicar primeiro DENTRO da quadra do adversário (linha vale como dentro).
 *  - Quique fora, na própria quadra ou rede baixa = ponto do adversário (kind 'out' / 'own' / 'net').
 *  - Quem recebe pode rebater no ar (voleio) ou depois de UM quique. Segundo quique = ponto de quem rebateu.
 *  - Ninguém rebate duas vezes seguidas.
 * Saque:
 *  - O primeiro quique precisa cair na CAIXA DE SAQUE diagonal. Senão é FALTA (kind 'fault'):
 *    o Match decide entre 2º saque e dupla falta. Saque sem resposta = ACE.
 * Simplificações: sem vantagem (deuce); sem "let".
 */
export class Rules {
  constructor(court, netClearCenter) {
    this.halfW = court.width / 2 + court.tolerance;
    this.halfL = court.length / 2 + court.tolerance;
    this.tol = court.tolerance;
    this.netClear = netClearCenter; // altura mínima do CENTRO do orbe ao cruzar a barreira
    this.newPoint(null);
  }

  newPoint(box) {
    this.state = "serve"; // 'serve' | 'live' | 'dead'
    this.lastHitter = null;
    this.bounces = 0;
    this.box = box; // caixa de saque: { xMin, xMax, zMin, zMax }
    this.serveShot = false; // o orbe atual é um saque que ainda não foi devolvido?
  }

  onHit(who, isServe = false) {
    this.state = "live";
    this.lastHitter = teamOf(who);
    this.bounces = 0;
    this.serveShot = isServe;
  }

  /** Quem pode rebater agora: orbe vivo, na metade de quem vai rebater, e não foi ele o último. */
  canHit(who, ballZ) {
    const team = teamOf(who);
    return (
      this.state === "live" &&
      teamOf(this.lastHitter) !== team &&
      Math.sign(ballZ) === teamSideSign(team)
    );
  }

  isInside(x, z) {
    return Math.abs(x) <= this.halfW && Math.abs(z) <= this.halfL;
  }

  inBox(x, z) {
    const b = this.box,
      t = this.tol;
    return (
      !!b &&
      x >= b.xMin - t &&
      x <= b.xMax + t &&
      z >= b.zMin - t &&
      z <= b.zMax + t
    );
  }

  verdict(winner, reason, kind, x = 0, z = 0) {
    this.state = "dead";
    return { winner, reason, kind, x, z };
  }

  onBounce(x, z) {
    if (this.state !== "live") return null;
    const hitter = this.lastHitter;
    this.bounces += 1;
    if (this.bounces === 1) {
      if (Math.sign(z) === teamSideSign(hitter)) {
        return this.serveShot
          ? this.verdict(otherTeam(hitter), "Falta!", "fault", x, z)
          : this.verdict(otherTeam(hitter), "Caiu na própria quadra!", "own", x, z);
      }
      if (this.serveShot) {
        return this.inBox(x, z)
          ? null
          : this.verdict(otherTeam(hitter), "Falta!", "fault", x, z);
      }
      if (!this.isInside(x, z))
        return this.verdict(otherTeam(hitter), "OUT!", "out", x, z);
      return null;
    }
    return this.serveShot
      ? this.verdict(hitter, "ACE!", "ace", x, z)
      : this.verdict(hitter, "Dois quiques!", "double", x, z);
  }

  onNetCross(y) {
    if (this.state !== "live" || this.bounces > 0) return null;
    if (y >= this.netClear) return null;
    return this.serveShot
      ? this.verdict(otherTeam(this.lastHitter), "Falta! (rede)", "fault")
      : this.verdict(otherTeam(this.lastHitter), "Na rede!", "net");
  }

  /** O orbe caiu no vácuo sem ser julgado (quique fora da laje). */
  onFall() {
    if (this.state !== "live") return null;
    if (this.bounces === 0) {
      return this.serveShot
        ? this.verdict(otherTeam(this.lastHitter), "Falta!", "fault")
        : this.verdict(otherTeam(this.lastHitter), "OUT!", "out");
    }
    return this.verdict(this.lastHitter, "Dois quiques!", "double");
  }
}
