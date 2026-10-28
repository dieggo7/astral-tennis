/** HUD em DOM por cima do canvas: placar, mensagens, dicas, tela inicial e de fim de partida. */
export class Hud {
  constructor(root, winScore) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-score">
        <div class="hud-side hud-you"><span class="hud-name">VOCÊ</span><span class="hud-pts" data-p>0</span><i class="hud-serve" data-sp></i></div>
        <div class="hud-mid"><small>ATÉ</small><b>${winScore}</b></div>
        <div class="hud-side hud-foe"><i class="hud-serve" data-sb></i><span class="hud-pts" data-b>0</span><span class="hud-name">RIVAL</span></div>
      </div>
      <div class="hud-msg" data-msg></div>
      <div class="hud-hint" data-hint>Mova: WASD / setas &nbsp;•&nbsp; Mire com o mouse &nbsp;•&nbsp; Botão esquerdo: Parry (ou sacar) &nbsp;•&nbsp; T: ver timing</div>
      <div class="hud-timing" data-timing hidden></div>
      <div class="hud-overlay" data-overlay>
        <h1>ASTRAL TENNIS</h1>
        <p class="hud-sub">Arena Astral &mdash; Ignis contra a Glacia</p>
        <p>Rebata o orbe com o <b>Parry</b>: acerte o tempo certo para devolver com o <b>dobro da velocidade</b>.<br>O orbe precisa quicar dentro da quadra rival. Dois quiques no seu lado e o ponto é deles.</p>
        <p class="hud-cta" data-cta>Clique para começar</p>
      </div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.pEl = q('[data-p]'); this.bEl = q('[data-b]');
    this.spEl = q('[data-sp]'); this.sbEl = q('[data-sb]');
    this.msg = q('[data-msg]'); this.hint = q('[data-hint]');
    this.timing = q('[data-timing]'); this.overlay = q('[data-overlay]');
    this.cta = q('[data-cta]');
    this.title = q('h1');
    this.sub = q('.hud-sub');
    this.body = this.overlay.querySelectorAll('p')[1];
    this.msgTimer = 0;
  }

  setScore(score, server) {
    this.pEl.textContent = score.player;
    this.bEl.textContent = score.bot;
    this.spEl.classList.toggle('on', server === 'player');
    this.sbEl.classList.toggle('on', server === 'bot');
  }

  /** Mensagem grande no centro. kind: 'perfect' | 'good' | 'bad' | 'info' */
  flash(text, kind = 'info', ms = 1200) {
    this.msg.textContent = text;
    this.msg.className = `hud-msg ${kind}`;
    void this.msg.offsetWidth; // reinicia a animação CSS
    this.msg.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.classList.remove('show'), ms);
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  showEnd(playerWon, score) {
    this.title.textContent = playerWon ? 'VITÓRIA!' : 'DERROTA';
    this.sub.textContent = `${score.player} × ${score.bot}`;
    this.body.innerHTML = playerWon
      ? 'O arquimago Ignis domina a Arena Astral.'
      : 'A Glacia congelou o seu placar. Tente de novo!';
    this.cta.textContent = 'Clique para jogar de novo';
    this.overlay.classList.remove('hidden');
  }

  setHint(text) {
    this.hint.innerHTML = text;
  }

  toggleTiming() {
    this.timing.hidden = !this.timing.hidden;
    return !this.timing.hidden;
  }

  /** Depuração do Parry: erro em ms (negativo = cedo, positivo = tarde). */
  setTiming(errorSeconds, quality) {
    const ms = Math.round(errorSeconds * 1000);
    this.timing.textContent = `Último Parry: ${ms > 0 ? '+' : ''}${ms} ms  (${quality === 'perfect' ? 'PERFEITO' : 'normal'})`;
  }
}
