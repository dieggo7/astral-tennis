import { PLAYER, BOT, other } from './Rules.js';

/**
 * Placar e sacador. O saque alterna a cada `alternateEvery` pontos (1 ou 2).
 * `total` (pontos jogados) define de que lado da quadra se saca (alterna a cada ponto).
 * Em 2v2 a alternância seria entre as duplas (e entre os jogadores de cada dupla).
 */
export class MatchState {
  constructor(winScore, alternateEvery = 1) {
    this.winScore = winScore;
    this.alternateEvery = alternateEvery;
    this.reset();
  }

  reset(firstServer = PLAYER) {
    this.score = { [PLAYER]: 0, [BOT]: 0 };
    this.server = firstServer;
    this.total = 0;
    this.winner = null;
  }

  get over() {
    return this.winner !== null;
  }

  award(who) {
    this.score[who] += 1;
    this.total += 1;
    if (this.score[who] >= this.winScore) this.winner = who;
    else if (this.total % this.alternateEvery === 0) this.server = other(this.server);
  }
}
