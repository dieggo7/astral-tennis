import { PLAYER, BOT, other } from './Rules.js';

/** Placar e sacador. Saque alterna a cada ponto. Vence quem chegar primeiro a winScore. */
export class MatchState {
  constructor(winScore) {
    this.winScore = winScore;
    this.reset();
  }

  reset(firstServer = PLAYER) {
    this.score = { [PLAYER]: 0, [BOT]: 0 };
    this.server = firstServer;
    this.winner = null;
  }

  get over() {
    return this.winner !== null;
  }

  award(who) {
    this.score[who] += 1;
    if (this.score[who] >= this.winScore) this.winner = who;
    else this.server = other(this.server);
  }
}
