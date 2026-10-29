/** HUD em DOM por cima do canvas: placar, mensagens, dicas, tela inicial e de fim de partida. */
export class Hud {
  constructor(root, winScore, roster, selectedCharacterId = "ignis", mode = "1v1") {
    this.el = document.createElement("div");
    this.el.className = "hud menu-open";
    this.el.innerHTML = `
      <div class="hud-score">
        <div class="hud-side hud-you"><span class="hud-name">VOCÊ</span><span class="hud-pts" data-p>0</span><i class="hud-serve" data-sp></i></div>
        <div class="hud-mid"><small>ATÉ</small><b>${winScore}</b></div>
        <div class="hud-side hud-foe"><i class="hud-serve" data-sb></i><span class="hud-pts" data-b>0</span><span class="hud-name">RIVAL</span></div>
      </div>
      <div class="hud-msg" data-msg></div>
      <div class="hud-hint" data-hint>Mova: WASD / setas &nbsp;•&nbsp; Mouse: mirar &nbsp;•&nbsp; Clique esquerdo: Parry / saque &nbsp;•&nbsp; Direito: cortada &nbsp;•&nbsp; E: Investida &nbsp;•&nbsp; Q: Meteoro &nbsp;•&nbsp; T: timing</div>
      <div class="hud-timing" data-timing hidden></div>
      <div class="hud-ability-status" data-ability-status></div>
      <div class="hud-others-ults" data-other-ults hidden></div>
      <div class="hud-ability-controls" data-ability-controls>
        <button class="hud-ability-button" data-dash-button type="button">
          <span class="ability-key">E</span><span class="ability-name">Investida Flamejante</span><b data-dash-cooldown>PRONTA</b>
          <i class="ability-cooldown"><span data-dash-progress></span></i>
        </button>
        <button class="hud-ability-button ultimate" data-ultimate-button type="button">
          <span class="ability-key">Q</span><span class="ability-name">Meteoro</span><b data-ultimate-cooldown>PRONTA</b>
          <i class="ability-cooldown"><span data-ultimate-progress></span></i>
        </button>
      </div>
      <div class="hud-overlay" data-overlay>
        <h1>ASTRAL TENNIS</h1>
        <p class="hud-sub" hidden></p>
        <p data-end-message hidden></p>
        <div class="menu-actions" data-main-menu>
          <label class="mode-picker">Modo <select data-mode><option value="1v1">1v1</option><option value="2v2">2v2</option></select></label>
          <button class="hud-secondary" data-reroll type="button" hidden>Sortear equipes novamente</button>
          <button class="hud-secondary" data-open-characters type="button">Escolher personagem</button>
          <button class="hud-cta" data-cta type="button">Jogar</button>
        </div>
        <section class="character-select" data-character-select hidden aria-label="Seleção de personagem">
          <div class="character-options" data-character-options></div>
          <div class="character-select-details">
            <p class="character-kicker" data-character-kicker></p>
            <h2 data-character-title></h2>
            <p class="character-focus" data-character-focus></p>
            <div class="ability-list">
              <article><h3 data-passive-title></h3><p data-passive-description></p></article>
              <article><h3 data-ability-title></h3><p data-ability-description></p></article>
              <article><h3 data-ultimate-title></h3><p data-ultimate-description></p></article>
            </div>
            <div class="character-select-actions">
              <button class="hud-secondary" data-back-menu type="button">Voltar</button>
              <button class="hud-cta" data-confirm-character type="button">Usar</button>
            </div>
          </div>
        </section>
      </div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.pEl = q("[data-p]");
    this.bEl = q("[data-b]");
    this.spEl = q("[data-sp]");
    this.sbEl = q("[data-sb]");
    this.msg = q("[data-msg]");
    this.hint = q("[data-hint]");
    this.abilityStatus = q("[data-ability-status]");
    this.otherUlts = q("[data-other-ults]");
    this.abilityControls = q("[data-ability-controls]");
    this.dashName = q(".hud-ability-button:not(.ultimate) .ability-name");
    this.ultimateName = q(".hud-ability-button.ultimate .ability-name");
    this.dashButton = q("[data-dash-button]");
    this.ultimateButton = q("[data-ultimate-button]");
    this.dashCooldownLabel = q("[data-dash-cooldown]");
    this.ultimateCooldownLabel = q("[data-ultimate-cooldown]");
    this.dashProgress = q("[data-dash-progress]");
    this.ultimateProgress = q("[data-ultimate-progress]");
    this.timing = q("[data-timing]");
    this.overlay = q("[data-overlay]");
    this.cta = q("[data-cta]");
    this.mainMenu = q("[data-main-menu]");
    this.characterSelect = q("[data-character-select]");
    this.characterOptions = q("[data-character-options]");
    this.roster = roster;
    this.mode = mode;
    this.modeSelect = q("[data-mode]");
    this.modeSelect.value = mode;
    this.rerollButton = q("[data-reroll]");
    this.rerollButton.hidden = mode !== "2v2";
    this.modeSelect.addEventListener("change", () => {
      this.rerollButton.hidden = this.modeSelect.value !== "2v2";
    });
    this.onModeRequested = () => {};
    this.rerollButton.addEventListener("click", () => this.onModeRequested("2v2", true));
    this.selectedCharacterId = selectedCharacterId;
    this.onCharacterSelected = () => {};
    this.openCharactersButton = q("[data-open-characters]");
    this.confirmCharacterButton = q("[data-confirm-character]");
    this.title = q("h1");
    this.sub = q(".hud-sub");
    this.body = q("[data-end-message]");
    this.ctaRequested = false;
    this.abilityRequests = { dash: false, ultimate: false };
    this.cta.addEventListener("click", () => {
      const nextMode = this.modeSelect.value;
      if (nextMode !== this.mode) {
        this.onModeRequested(nextMode, false);
        return;
      }
      this.ctaRequested = true;
    });
    this.openCharactersButton.addEventListener("click", () =>
      this.showCharacterSelect(),
    );
    q("[data-back-menu]").addEventListener("click", () => this.showMainMenu());
    this.confirmCharacterButton.addEventListener("click", () =>
      this.showMainMenu(),
    );
    this.abilityControls.addEventListener("pointerdown", (event) =>
      event.stopPropagation(),
    );
    for (const button of [this.dashButton, this.ultimateButton]) {
      button.addEventListener("click", (event) => event.stopPropagation());
    }
    this.dashButton.addEventListener("click", () => {
      this.abilityRequests.dash = true;
    });
    this.ultimateButton.addEventListener("click", () => {
      this.abilityRequests.ultimate = true;
    });
    this.defaultHint = this.hint.innerHTML;
    this.msgTimer = 0;
    this.buildCharacterOptions();
    this.selectCharacter(selectedCharacterId, false);
  }

  buildCharacterOptions() {
    for (const character of Object.values(this.roster)) {
      const button = document.createElement("button");
      button.className = "character-option";
      button.type = "button";
      button.dataset.character = character.id;
      button.style.setProperty("--character-color", character.color);
      button.style.setProperty("--character-accent", character.accent);
      const swatch = document.createElement("i");
      swatch.className = "character-swatch";
      const name = document.createElement("b");
      name.textContent = character.name;
      const element = document.createElement("small");
      element.textContent = character.element;
      button.append(swatch, name, element);
      button.addEventListener("click", () =>
        this.selectCharacter(character.id),
      );
      this.characterOptions.appendChild(button);
    }
  }

  selectCharacter(id, notify = true) {
    const character = this.roster[id];
    if (!character) return;
    this.selectedCharacterId = id;
    this.characterOptions
      .querySelectorAll("[data-character]")
      .forEach((button) => {
        const selected = button.dataset.character === id;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    this.el.querySelector("[data-character-kicker]").textContent =
      `PERSONAGEM JOGÁVEL · ${character.element.toUpperCase()}`;
    this.el.querySelector("[data-character-title]").textContent =
      `${character.name}, ${character.title}`;
    this.el.querySelector("[data-character-focus]").textContent =
      `Foco em ${character.focus.toLowerCase()}`;
    this.el.querySelector("[data-passive-title]").textContent =
      `Passiva · ${character.passiveName}`;
    this.el.querySelector("[data-passive-description]").textContent =
      character.passiveDescription;
    this.el.querySelector("[data-ability-title]").textContent =
      `Habilidade · ${character.abilityName} · E`;
    this.el.querySelector("[data-ability-description]").textContent =
      `${character.abilityDescription} Recarga: ${character.abilityCooldown} segundos.`;
    this.el.querySelector("[data-ultimate-title]").textContent =
      `Ultimate · ${character.ultimateName} · Q`;
    this.el.querySelector("[data-ultimate-description]").textContent =
      `${character.ultimateDescription} Recarga: ${character.ultimateCooldown} segundos.`;
    this.confirmCharacterButton.textContent = `Usar ${character.name}`;
    this.dashName.textContent = character.abilityName;
    this.ultimateName.textContent = character.ultimateName;
    this.hint.innerHTML = `Mova: WASD / setas &nbsp;•&nbsp; Mouse: mirar &nbsp;•&nbsp; Clique esquerdo: Parry / saque &nbsp;•&nbsp; Direito: cortada &nbsp;•&nbsp; E: ${character.abilityName} &nbsp;•&nbsp; Q: ${character.ultimateName}`;
    this.defaultHint = this.hint.innerHTML;
    if (notify) this.onCharacterSelected(id);
  }

  setScore(score, server) {
    this.pEl.textContent = score.player;
    this.bEl.textContent = score.bot;
    const alliedServer = server === "player" || server === "A2";
    const rivalServer = server === "bot" || server === "B2";
    this.spEl.classList.toggle("on", alliedServer);
    this.sbEl.classList.toggle("on", rivalServer);
    const serverName = { player: "A1", A2: "A2", bot: "B1", B2: "B2" }[server] || "";
    this.spEl.title = alliedServer ? `Saque de ${serverName}` : "";
    this.sbEl.title = rivalServer ? `Saque de ${serverName}` : "";
  }

  setOtherUltimates(fighters, roster) {
    this.otherUlts.hidden = false;
    this.otherUlts.innerHTML = ["A2", "bot", "B2"].map((id) => {
      const fighter = fighters[id];
      if (!fighter) return "";
      const ready = (fighter.aiUltimateCooldown || 0) <= 0;
      const name = roster[fighter.characterId]?.name || id;
      return `<span class="other-ult ${ready ? "ready" : "cooldown"}" title="${name}: ultimate ${ready ? "pronta" : "em recarga"}"><b>${id}</b><i>${ready ? "Q" : Math.ceil(fighter.aiUltimateCooldown)}</i></span>`;
    }).join("");
  }

  /** Mensagem grande no centro (+ linha menor opcional). kind: 'perfect' | 'good' | 'bad' | 'info' */
  flash(text, kind = "info", ms = 1200, sub = "") {
    this.msg.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
    this.msg.className = `hud-msg ${kind}`;
    void this.msg.offsetWidth; // reinicia a animação CSS
    this.msg.classList.add("show");
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.classList.remove("show"), ms);
  }

  staticFlash() {
    this.el.classList.remove("static-flash");
    void this.el.offsetWidth;
    this.el.classList.add("static-flash");
    clearTimeout(this.staticFlashTimer);
    this.staticFlashTimer = setTimeout(
      () => this.el.classList.remove("static-flash"),
      220,
    );
  }

  hideOverlay() {
    this.overlay.classList.add("hidden");
    this.el.classList.remove("menu-open");
  }

  showEnd(playerWon, score) {
    this.showMainMenu();
    this.title.textContent = playerWon ? "VITÓRIA!" : "DERROTA";
    this.sub.textContent = `${score.player} × ${score.bot}`;
    const name = this.roster[this.selectedCharacterId]?.name || "Mago";
    this.body.innerHTML = playerWon
      ? `${name} domina a Arena Astral.`
      : "O rival venceu este ponto. Tente de novo!";
    this.sub.hidden = false;
    this.body.hidden = false;
    this.cta.textContent = "Jogar de novo";
    this.openCharactersButton.hidden = true;
    this.overlay.classList.remove("hidden");
    this.el.classList.add("menu-open");
  }

  showCharacterSelect() {
    this.title.textContent = "ESCOLHA SEU PERSONAGEM";
    this.sub.hidden = true;
    this.body.hidden = true;
    this.mainMenu.hidden = true;
    this.characterSelect.hidden = false;
    this.overlay.classList.add("character-select-open");
  }

  showMainMenu() {
    this.title.textContent = "ASTRAL TENNIS";
    this.openCharactersButton.hidden = false;
    this.mainMenu.hidden = false;
    this.characterSelect.hidden = true;
    this.overlay.classList.remove("character-select-open");
  }

  consumeCtaRequest() {
    const requested = this.ctaRequested;
    this.ctaRequested = false;
    return requested;
  }

  setHint(text) {
    this.hint.innerHTML = text || this.defaultHint;
  }

  setAbilityStatus(info, character) {
    const cooldown = (seconds, total, label, button, fill) => {
      const active = seconds > 0;
      label.textContent = active
        ? `${(Math.ceil(seconds * 10) / 10).toFixed(1)}s`
        : "PRONTA";
      button.disabled = active;
      fill.style.transform = `scaleX(${active ? 1 - seconds / total : 1})`;
    };
    cooldown(
      info.abilityCooldown,
      character.abilityCooldown,
      this.dashCooldownLabel,
      this.dashButton,
      this.dashProgress,
    );
    cooldown(
      info.ultimateCooldown,
      character.ultimateCooldown,
      this.ultimateCooldownLabel,
      this.ultimateButton,
      this.ultimateProgress,
    );
    const text = info.passiveStatus;
    if (this.abilityStatus.textContent !== text)
      this.abilityStatus.textContent = text;
  }

  consumeAbilityRequests() {
    const requests = this.abilityRequests;
    this.abilityRequests = { dash: false, ultimate: false };
    return requests;
  }

  toggleTiming() {
    this.timing.hidden = !this.timing.hidden;
    return !this.timing.hidden;
  }

  /** Depuração do Parry: erro em ms (negativo = cedo, positivo = tarde). */
  setTiming(errorSeconds, quality) {
    const ms = Math.round(errorSeconds * 1000);
    this.timing.textContent = `Último Parry: ${ms > 0 ? "+" : ""}${ms} ms  (${quality === "perfect" ? "PERFEITO" : "normal"})`;
  }
}
