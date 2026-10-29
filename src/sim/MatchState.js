import { PLAYER, BOT, other } from './Rules.js';

<<<<<<< HEAD
/**
 * Placar e sacador. O saque alterna a cada `alternateEvery` pontos (1 ou 2).
 * `total` (pontos jogados) define de que lado da quadra se saca (alterna a cada ponto).
 * Em 2v2 a alternância seria entre as duplas (e entre os jogadores de cada dupla).
 */
export class MatchState {
  constructor(winScore, alternateEvery = 1) {
    this.winScore = winScore;
    this.alternateEvery = alternateEvery;
=======
/** Placar e sacador. Saque alterna a cada ponto. Vence quem chegar primeiro a winScore. */
export class MatchState {
  constructor(winScore) {
    this.winScore = winScore;
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
    this.reset();
  }

  reset(firstServer = PLAYER) {
    this.score = { [PLAYER]: 0, [BOT]: 0 };
    this.server = firstServer;
<<<<<<< HEAD
    this.total = 0;
=======
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
    this.winner = null;
  }

  get over() {
    return this.winner !== null;
  }

  award(who) {
    this.score[who] += 1;
<<<<<<< HEAD
    this.total += 1;
    if (this.score[who] >= this.winScore) this.winner = who;
    else if (this.total % this.alternateEvery === 0) this.server = other(this.server);
=======
    if (this.score[who] >= this.winScore) this.winner = who;
    else this.server = other(this.server);
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
  }
}
