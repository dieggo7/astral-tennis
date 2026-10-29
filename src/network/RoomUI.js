const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Small DOM overlay for room creation, joining and lobby controls. */
export class RoomUI {
  constructor(root, network, { mode = "1v1", characters = {}, onModeMismatch = () => {}, onMatchStart = () => {}, onMatchEnd = () => {}, onLeave = () => {} } = {}) {
    this.network = network;
    this.mode = mode;
    this.characters = characters;
    this.onModeMismatch = onModeMismatch;
    this.onMatchStart = onMatchStart;
    this.onMatchEnd = onMatchEnd;
    this.onLeave = onLeave;
    this.el = document.createElement("section");
    this.el.className = "room-ui";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="room-card">
        <button class="room-close" type="button" aria-label="Fechar">×</button>
        <h2>Salas Astrais</h2>
        <p class="room-status" data-status>Crie uma sala ou entre com um codigo.</p>
        <div class="room-entry" data-entry>
          <label>Seu nome <input data-name maxlength="16" autocomplete="nickname" placeholder="Nome"></label>
          <label>Formato <select data-mode><option value="1v1">1v1 · duas vagas</option><option value="2v2">2v2 · quatro vagas</option></select></label>
          <div class="room-actions">
            <button type="button" data-create>Criar sala</button>
            <label class="room-code-entry">Codigo <input data-code maxlength="6" placeholder="ABC234" autocapitalize="characters"></label>
            <button type="button" data-join>Entrar</button>
          </div>
        </div>
        <div class="room-lobby" data-lobby hidden>
          <div class="room-code-display">Sala <b data-room-code></b><button type="button" data-copy>Copiar codigo</button></div>
          <p data-room-mode></p>
          <div class="room-players" data-players></div>
          <div class="room-actions">
            <button type="button" data-start hidden>Iniciar partida</button>
            <button type="button" data-rematch hidden>Revanche</button>
            <button type="button" data-end-match hidden>Encerrar partida</button>
            <button type="button" data-leave>Sair da sala</button>
          </div>
        </div>
        <p class="room-error" data-error role="alert"></p>
      </div>`;
    root.appendChild(this.el);
    this.status = this.el.querySelector("[data-status]");
    this.error = this.el.querySelector("[data-error]");
    this.modeInput = this.el.querySelector("[data-mode]");
    this.nameInput = this.el.querySelector("[data-name]");
    this.codeInput = this.el.querySelector("[data-code]");
    this.entry = this.el.querySelector("[data-entry]");
    this.lobby = this.el.querySelector("[data-lobby]");
    this.playerList = this.el.querySelector("[data-players]");
    this.startButton = this.el.querySelector("[data-start]");
    this.rematchButton = this.el.querySelector("[data-rematch]");
    this.endMatchButton = this.el.querySelector("[data-end-match]");
    this.modeInput.value = mode;

    this.el.querySelector(".room-close").addEventListener("click", () => this.close());
    this.el.querySelector("[data-create]").addEventListener("click", () => this.create());
    this.el.querySelector("[data-join]").addEventListener("click", () => this.join());
    this.startButton.addEventListener("click", () => this.run(() => network.startMatch()));
    this.rematchButton.addEventListener("click", () => this.run(() => network.rematch()));
    this.endMatchButton.addEventListener("click", () => this.run(() => network.endMatch()));
    this.el.querySelector("[data-leave]").addEventListener("click", () => this.run(async () => { await network.leaveRoom(); this.showEntry(); this.onLeave(); }));
    this.el.querySelector("[data-copy]").addEventListener("click", () => this.copyCode());
    this.codeInput.addEventListener("input", () => { this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6); });
    this.codeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") this.join(); });

    network.on("room:state", (room) => this.renderRoom(room));
    network.on("room:error", ({ reason }) => this.showError(reason));
    network.on("connect_error", ({ reason }) => this.showError(`Falha de conexao: ${reason}`));
    network.on("disconnect", () => { if (!this.el.hidden) this.status.textContent = "Conexao interrompida; tentando reconectar..."; });
    network.on("session:resumed", ({ room }) => { this.open(); this.renderRoom(room); });
    network.on("match:start", (data) => { this.close(); this.onMatchStart(data); });
    network.on("match:paused", ({ seconds }) => { this.open(); this.status.textContent = `Partida pausada; aguardando reconexao por ${seconds} segundos.`; });
    network.on("match:resumed", () => { this.close(); });
    network.on("match:end", (data) => {
      this.open();
      const winnerNames = Array.isArray(data.winnerNames) ? data.winnerNames.filter((name) => typeof name === "string" && name.trim()) : [];
      this.status.textContent = winnerNames.length
        ? `Vencedor${winnerNames.length > 1 ? "es" : ""}: ${winnerNames.join(", ")}`
        : data.winnerTeam ? `Partida encerrada. Venceu o time ${data.winnerTeam}.` : "Partida encerrada pelo anfitriao.";
      this.onMatchEnd(data);
    });
  }

  open() { this.el.hidden = false; this.error.textContent = ""; }
  close() { this.el.hidden = true; }
  showError(message) { this.error.textContent = message; }
  showEntry() {
    this.entry.hidden = false; this.lobby.hidden = true;
    this.status.textContent = "Crie uma sala ou entre com um codigo.";
    this.error.textContent = "";
  }

  async create() {
    const mode = this.modeInput.value;
    if (mode !== this.mode) return this.onModeMismatch(mode, { type: "create", name: this.nameInput.value });
    await this.run(() => this.network.createRoom(mode, this.nameInput.value));
  }

  async join() {
    await this.run(async () => {
      const result = await this.network.joinRoom(this.codeInput.value, this.nameInput.value);
      const mode = result.room?.mode;
      if (mode && mode !== this.mode) this.onModeMismatch(mode, { type: "resume" });
      return result;
    });
  }

  async run(operation) {
    this.error.textContent = "";
    try { await operation(); } catch (error) { this.showError(error.message); }
  }

  renderRoom(room) {
    if (!room) return;
    if (room.mode !== this.mode) return this.onModeMismatch(room.mode, { type: "resume" });
    this.entry.hidden = true;
    this.lobby.hidden = false;
    this.el.querySelector("[data-room-code]").textContent = room.code;
    this.el.querySelector("[data-room-mode]").textContent = `${room.mode} · ${room.players.length}/${room.capacity} jogadores · ${room.status === "finished" ? "partida encerrada" : room.status === "playing" || room.status === "countdown" ? "em partida" : "lobby"}`;
    const me = room.players.find((p) => p.id === this.network.playerId);
    this.playerList.innerHTML = room.players.map((p) => {
      const canChooseTeam = me?.id === room.host || p.id === me?.id;
      const team = canChooseTeam
        ? `<select data-team-player="${escapeHtml(p.id)}"><option value="A" ${p.team === "A" ? "selected" : ""}>Time A</option><option value="B" ${p.team === "B" ? "selected" : ""}>Time B</option></select>`
        : `<span class="room-team">Time ${escapeHtml(p.team)}</span>`;
      return `<div class="room-player"><span>${escapeHtml(p.name)}${p.host ? " · host" : ""}${p.id === me?.id ? " · voce" : ""}</span>${team}<span>${p.connected ? "● online" : "○ reconectando"}</span></div>`;
    }).join("");
    this.playerList.querySelectorAll("[data-team-player]").forEach((select) => select.addEventListener("change", () => {
      this.run(() => this.network.setTeam(select.value, select.dataset.teamPlayer));
    }));
    const characterOptions = Object.entries(this.characters).map(([id, item]) => `<option value="${escapeHtml(id)}" ${me?.characterId === id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
    const characterSelect = document.createElement("select");
    characterSelect.className = "room-character";
    characterSelect.innerHTML = characterOptions;
    characterSelect.setAttribute("aria-label", "Seu mago");
    characterSelect.addEventListener("change", () => this.run(() => this.network.setCharacter(characterSelect.value)));
    if (me && room.status === "lobby") this.playerList.append(characterSelect);
    this.startButton.hidden = !(me?.host && room.status === "lobby");
    this.rematchButton.hidden = !(me?.host && room.status === "finished");
    this.endMatchButton.hidden = !(me?.host && room.mode === "2v2" && room.status === "playing");
    this.startButton.disabled = room.players.length !== room.capacity || room.players.some((p) => !p.connected);
    this.status.textContent = room.status === "lobby" ? "Compartilhe o codigo e aguarde as vagas." : room.status === "countdown" ? "Partida iniciando..." : room.status === "playing" ? "Partida em andamento." : "Pronto para revanche.";
  }

  async copyCode() {
    try { await navigator.clipboard.writeText(this.network.room?.code || ""); this.status.textContent = "Codigo copiado."; }
    catch { this.showError("Nao foi possivel copiar; selecione o codigo manualmente."); }
  }
}
