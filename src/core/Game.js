import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { getModeConfig } from "../config/constants.js";
import { getFitPoints } from "../config/visual.js";
import { Court } from "../arena/Court.js";
import { LightBarrier } from "../arena/LightBarrier.js";
import { Obelisks } from "../arena/Obelisks.js";
import { Banners } from "../arena/Banners.js";
import { Galaxy } from "../environment/Galaxy.js";
import { FloatingIslands } from "../environment/FloatingIslands.js";
import { Particles } from "../environment/Particles.js";
import { ChaosOrb } from "../objects/ChaosOrb.js";
import { CameraRig } from "./Camera.js";
import { LightingRig } from "./Lighting.js";
import { pointUniforms, updatePointScale } from "../utils/softPoints.js";
import {
  AimMarker,
  BounceMarks,
  ImpactWaves,
  ServeBox,
  ServeRing,
  AbilityFieldVisuals,
} from "../arena/CourtMarkers.js";
import { Burst } from "../effects/Burst.js";
import {
  rallyRegion,
  boxRegion,
  riskAt,
  deviationDeg,
  clampToBox,
} from "../sim/Aim.js";
import { Match } from "../../shared/sim.js";
import { InputManager } from "../input/InputManager.js";
import { Character } from "../characters/Character.js";
import { ROSTER, MVP_MATCHUP } from "../characters/roster.js";
import { Hud } from "../ui/Hud.js";
import { NetworkClient } from "../network/NetworkClient.js";
import { RoomUI } from "../network/RoomUI.js";

export class Game {
  constructor(root, mode = new URLSearchParams(location.search).get("mode") || "1v1") {
    const selected = getModeConfig(mode);
    mode = selected.game.mode;
    const cfg = selected.arena;
    this.mode = mode;
    this.arenaConfig = cfg;
    this.gameConfig = selected.game;
    this.root = root;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b0626");
    this.scene.fog = new THREE.FogExp2(
      cfg.environment.fogColor,
      cfg.environment.fogDensity,
    );
    this.clock = new THREE.Clock();
    this.tmp = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = cfg.environment.exposure;
    this.renderer.shadowMap.enabled = cfg.environment.shadowMapEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.appendChild(this.renderer.domElement);

    this.cameraRig = new CameraRig(
      cfg.camera,
      getFitPoints(cfg.court, cfg.barrier),
    );
    this.cameraRig.attachDebug(this.renderer.domElement);
    this.camera = this.cameraRig.camera;
    this.scene.add(this.camera);

    // Pós-processamento: Render -> Bloom -> Output (tone mapping + sRGB).
    // O OutputPass é essencial: sem ele a imagem sai lavada e sem contraste.
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      cfg.environment.bloomStrength,
      cfg.environment.bloomRadius,
      cfg.environment.bloomThreshold,
    );
    this.bloomPass.enabled = cfg.environment.bloomEnabled;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.lightingRig = new LightingRig(cfg);
    this.scene.add(this.lightingRig.group);

    // Tudo que fica na laje sobe e desce junto (flutuação), inclusive o orbe.
    this.arena = new THREE.Group();
    this.court = new Court(cfg.court);
    this.barrier = new LightBarrier(cfg.barrier);
    this.obelisks = new Obelisks(cfg.barrier);
    this.banners = new Banners(cfg.court, cfg.barrier);
    this.orb = new ChaosOrb(cfg.orb, cfg.court);

    // Gameplay: simulação pura (passo fixo) + personagens, marcadores e HUD que só a desenham.
    this.match = new Match(this.gameConfig);
    this.input = new InputManager(this.renderer.domElement, this.gameConfig.court);
    this.selectedCharacterId = sessionStorage.getItem("astral-character") || MVP_MATCHUP.player;
    this.match.setPlayerCharacter(this.selectedCharacterId);
    this.hud = new Hud(
      this.root,
      this.gameConfig.winScore,
      ROSTER,
      this.selectedCharacterId,
      mode,
    );
    this.playerCharacters = Object.fromEntries(
      Object.entries(ROSTER).map(([id, def]) => [
        id,
        new Character(def, def.speed),
      ]),
    );
    Object.entries(this.playerCharacters).forEach(([id, character]) => {
      character.group.visible = id === this.selectedCharacterId;
    });
    this.characters = {
      player: this.playerCharacters[this.selectedCharacterId],
      bot: null,
    };
    const available = Object.keys(ROSTER).filter((id) => id !== this.selectedCharacterId);
    const chooseBot = () => available.splice(Math.floor(Math.random() * available.length), 1)[0];
    const botId = mode === "2v2" ? chooseBot() : MVP_MATCHUP.bot;
    this.characters.bot = new Character(ROSTER[botId], this.gameConfig.bot.speed);
    this.localBotCharacter = this.characters.bot;
    if (mode === "2v2") {
      const allyId = chooseBot();
      const secondBotId = chooseBot();
      this.characters.A2 = new Character(ROSTER[allyId], this.gameConfig.bot.speed);
      this.characters.B2 = new Character(ROSTER[secondBotId], this.gameConfig.bot.speed);
      this.match.fighters.player.characterId = this.selectedCharacterId;
      this.match.fighters.A2.characterId = allyId;
      this.match.fighters.bot.characterId = botId;
      this.match.fighters.B2.characterId = secondBotId;
    }
    for (const [id, character] of Object.entries(this.characters)) {
      const allied = id === "player" || id === "A2";
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 0.88, 32),
        new THREE.MeshBasicMaterial({
          color: allied ? "#42e8ff" : "#ff4f87",
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.055;
      ring.userData.teamRing = true;
      character.group.add(ring);
      if (id === "player") {
        const marker = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.42, 4),
          new THREE.MeshBasicMaterial({ color: "#ffe079" }),
        );
        marker.position.set(0, 3.35, 0);
        this.humanMarker = marker;
        character.group.add(marker);
      }
    }
    this.hud.onCharacterSelected = (id) => this.setPlayerCharacter(id);
    this.hud.onModeRequested = (nextMode, reroll = false) => {
      sessionStorage.setItem("astral-character", this.selectedCharacterId);
      const url = new URL(location.href);
      url.searchParams.set("mode", nextMode);
      if (reroll) url.searchParams.set("reroll", String(Math.random()));
      else url.searchParams.delete("reroll");
      location.assign(url.href);
    };
    this.network = new NetworkClient();
    this.online = false;
    this.onlineEvents = [];
    this.onlineStartAt = 0;
    this.onlineStatus = document.createElement("div");
    this.onlineStatus.className = "online-game-status";
    this.onlineStatus.hidden = true;
    this.root.appendChild(this.onlineStatus);
    this.roomUI = new RoomUI(this.root, this.network, {
      mode,
      characters: ROSTER,
      onModeMismatch: (nextMode, action) => {
        if (action?.type === "create") sessionStorage.setItem("astral-online-pending", JSON.stringify(action));
        const url = new URL(location.href);
        url.searchParams.set("mode", nextMode);
        location.assign(url.href);
      },
      onMatchStart: (data) => this.beginOnlineMatch(data),
      onMatchEnd: (data) => {
        this.onlineStatus.hidden = false;
        this.onlineStatus.textContent = data.winnerTeam
          ? `Fim da partida · time ${data.winnerTeam} venceu · abrir lobby`
          : "Partida encerrada · abrir lobby";
      },
      onLeave: () => this.leaveOnlineMatch(),
    });
    this.hud.onOnlineRequested = () => {
      this.roomUI.open();
      if (this.network.token && !this.network.socket.connected) this.network.connect().catch((error) => this.roomUI.showError(error.message));
    };
    this.onlineStatus.addEventListener("click", () => {
      if (this.network.room) this.roomUI.open();
    });
    this.network.on("event", (event) => this.onlineEvents.push(event));
    this.network.on("ping", ({ rtt }) => { this.onlineStatus.dataset.ping = `${Math.round(rtt)} ms`; });
    this.network.on("disconnect", () => {
      if (this.online) this.onlineStatus.textContent = "Conexao interrompida · reconectando...";
    });
    this.network.on("session:resumed", ({ room }) => {
      if (room?.mode !== this.mode) this.roomUI.onModeMismatch(room.mode, { type: "resume" });
    });
    const pendingOnline = sessionStorage.getItem("astral-online-pending");
    if (pendingOnline) {
      sessionStorage.removeItem("astral-online-pending");
      try {
        const pending = JSON.parse(pendingOnline);
        if (pending.type === "create") {
          this.roomUI.open();
          this.roomUI.nameInput.value = pending.name || "";
          this.roomUI.modeInput.value = mode;
          queueMicrotask(() => this.roomUI.create());
        } else if (pending.type === "resume") {
          this.roomUI.open();
          this.network.connect().catch((error) => this.roomUI.showError(error.message));
        }
      } catch { sessionStorage.removeItem("astral-online-pending"); }
    } else if (this.network.token) {
      this.roomUI.open();
      this.network.connect().catch((error) => this.roomUI.showError(error.message));
    }
    this.aimMarker = new AimMarker();
    this.bounceMarks = new BounceMarks();
    this.impactWaves = new ImpactWaves();
    this.abilityFields = new AbilityFieldVisuals(cfg.court);
    this.serveBox = new ServeBox();
    this.serveRing = new ServeRing();
    this.burst = new Burst();
    this.hitStop = 0;
    this.slowTimer = 0; // slow motion (segundos reais restantes)
    this.dashTrailTimer = 0;
    this.meteorTrailTimer = 0;
    this.lastScoreKey = "";
    this.otherUltTimer = 0;

    this.arena.add(
      this.court.group,
      this.barrier.group,
      this.obelisks.group,
      this.banners.group,
      this.serveBox.group,
      this.aimMarker.group,
      this.bounceMarks.group,
      this.impactWaves.group,
      this.abilityFields.group,
      this.serveRing.group,
      this.burst.points,
      ...Object.values(this.playerCharacters).map(
        (character) => character.group,
      ),
      this.characters.bot.group,
      ...(this.characters.A2 ? [this.characters.A2.group, this.characters.B2.group] : []),
      ...this.orb.objects,
    );
    this.scene.add(this.arena);
    this.setShadowCasters();

    this.galaxy = new Galaxy(cfg.galaxy);
    this.scene.add(this.galaxy.group);
    const pose = this.cameraRig.computePose(16 / 9);
    this.islands = new FloatingIslands({
      position: pose.position,
      target: pose.target,
      fov: cfg.camera.fov,
    });
    this.scene.add(this.islands.group);
    this.particles = new Particles();
    this.scene.add(this.particles.group);

    this.onResize();
    this.bindEvents();
  }

  setShadowCasters() {
    this.arena.traverse((o) => {
      if (
        o.isMesh &&
        o.material &&
        !o.material.isShaderMaterial &&
        !o.material.transparent &&
        o.castShadow === false
      ) {
        o.castShadow = false;
      }
    });
  }

  onResize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.cameraRig.setAspect(w / h);
    updatePointScale(this.renderer, this.camera);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("pointermove", (e) => {
      this.cameraRig.mouse.set(
        e.clientX / window.innerWidth - 0.5,
        e.clientY / window.innerHeight - 0.5,
      );
    });
    window.addEventListener("keydown", (e) => {
      if (!this.arenaConfig.debug.debugKeys) return;
      if (e.code === "KeyC") this.cameraRig.toggleDebugMode();
      if (e.code === "KeyB") this.bloomPass.enabled = !this.bloomPass.enabled;
      if (e.code === "KeyT") this.hud.toggleTiming();
    });
  }

  setPlayerCharacter(id) {
    if (!this.playerCharacters[id]) return;
    this.selectedCharacterId = id;
    sessionStorage.setItem("astral-character", id);
    Object.entries(this.playerCharacters).forEach(
      ([characterId, character]) => {
        character.group.visible = characterId === id;
      },
    );
    this.characters.player = this.playerCharacters[id];
    this.match.setPlayerCharacter(id);
  }

  beginOnlineMatch(data) {
    // A reconnect can replay match:start immediately before the current snapshot.
    // Rebuilding the match in that case briefly resets the remote player's view.
    if (this.online && this.onlineSeed === data.seed) {
      this.onlineStartAt = data.startsAt || this.onlineStartAt;
      return;
    }
    const own = data.players?.find((p) => p.id === this.network.playerId);
    if (!own?.fighterId) {
      this.online = false;
      this.roomUI.open();
      this.roomUI.showError("O servidor iniciou a partida sem associar seu jogador a uma vaga. Saia da sala e entre novamente.");
      return;
    }
    this.online = true;
    this.onlineSeed = data.seed;
    this.onlineStartAt = data.startsAt || Date.now();
    this.network.acceptSession({ fighterId: own.fighterId });
    this.localFighterId = own.fighterId;
    this.match = new Match({
      ...this.gameConfig,
      networkMode: true,
      twoVTwo: this.gameConfig.twoVTwo ? { ...this.gameConfig.twoVTwo, AI_USE_ABILITIES: false } : undefined,
    });
    if (!this.match.setNetworkFighter(this.localFighterId)) {
      this.online = false;
      this.roomUI.open();
      this.roomUI.showError("A vaga recebida não existe neste modo de jogo.");
      return;
    }
    this.arena.rotation.y = this.match.fighters[this.localFighterId].sign < 0 ? Math.PI : 0;
    for (const player of data.players || []) this.match.setFighterCharacter(player.fighterId, player.characterId);
    this.syncOnlineRoster(data.players || []);
    this.match.start();
    this.match.consumeEvents();
    this.match.phase = "ready";
    this.hud.hideOverlay();
    this.onlineStatus.hidden = false;
    this.onlineStatus.textContent = `Conectado · Time ${own.team} · ping: -- ms`;
  }

  leaveOnlineMatch() {
    this.roomUI.close();
    this.online = false;
    this.localFighterId = null;
    this.onlineSeed = null;
    this.arena.rotation.y = 0;
    this.onlineEvents = [];
    this.onlineStatus.hidden = true;
    [...Object.values(this.characters), ...Object.values(this.playerCharacters), this.localBotCharacter]
      .filter(Boolean)
      .forEach((character) => { character.group.visible = false; });
    this.characters.player = this.playerCharacters[this.selectedCharacterId];
    this.characters.bot = this.localBotCharacter;
    this.characters.player.group.visible = true;
    this.characters.bot.group.visible = true;
    this.match = new Match(this.gameConfig);
    this.match.setPlayerCharacter(this.selectedCharacterId);
    this.hud.overlay.classList.remove("hidden");
    this.hud.el.classList.add("menu-open");
    this.hud.showMainMenu();
  }

  syncOnlineRoster(players) {
    Object.values(this.characters).forEach((character) => { character.group.visible = false; });
    const used = new Set();
    for (const player of players) {
      if (!this.match.fighters[player.fighterId] || !ROSTER[player.characterId]) continue;
      const current = this.characters[player.fighterId];
      let character = current?.def.id === player.characterId && !used.has(current)
        ? current
        : null;
      if (!character) character = new Character(ROSTER[player.characterId], this.gameConfig.characters[player.characterId]?.speed || this.gameConfig.bot.speed);
      used.add(character);
      let ring = character.group.children.find((child) => child.userData.teamRing);
      if (!ring) {
        ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.055;
        ring.userData.teamRing = true;
        character.group.add(ring);
      }
      ring.material.color.set(player.team === "A" ? "#42e8ff" : "#ff4f87");
      if (character.group.parent !== this.arena) this.arena.add(character.group);
      character.group.visible = true;
      this.characters[player.fighterId] = character;
    }
    if (this.humanMarker && this.localFighterId && this.characters[this.localFighterId]) {
      this.humanMarker.parent?.remove(this.humanMarker);
      this.characters[this.localFighterId].group.add(this.humanMarker);
    }
  }

  applyOnlineSnapshot(snapshot) {
    const match = this.match;
    match.phase = snapshot.phase;
    match.phaseTime = snapshot.phaseTime;
    Object.assign(match.ball, snapshot.orb);
    match.state.score = { player: snapshot.score.A, bot: snapshot.score.B };
    match.state.server = snapshot.server || null;
    match.state.winner = snapshot.winner || null;
    match.serve = { server: snapshot.server, box: snapshot.serveInfo?.box };
    match.serveTiming = {
      perfectAt: snapshot.serveInfo?.perfectAt || 0,
      ringDuration: snapshot.serveInfo?.ringDuration || 1,
    };
    match.rules.state = snapshot.ruleState || (snapshot.phase === "serve" ? "serve" : "live");
    match.rules.lastHitter = snapshot.lastHitter || null;
    match.rules.bounces = snapshot.bounces || 0;
    Object.assign(match.effects, snapshot.effects);
    match.abilityCooldown = snapshot.abilityInfo?.abilityCooldown || 0;
    match.ultimateCooldown = snapshot.abilityInfo?.ultimateCooldown || 0;
    for (const remote of snapshot.players) {
      const fighter = match.fighters[remote.fighterId];
      if (!fighter) continue;
      const { fighterId: _fighterId, team, swinging, ...state } = remote;
      Object.assign(fighter, state);
      fighter.team = team === "A" ? "player" : "bot";
      fighter.parry.swinging = remote.swinging;
      fighter.parry.connected = false;
    }
    const local = snapshot.players.find((fighter) => fighter.fighterId === this.localFighterId);
    if (local) match.localFighterId = local.fighterId;
    const scoreKey = `${match.state.score.player}-${match.state.score.bot}-${match.state.server}`;
    if (scoreKey !== this.lastScoreKey) {
      this.lastScoreKey = scoreKey;
      const localTeam = this.localFighterId === "player" || this.localFighterId === "A2" ? "A" : "B";
      this.hud.setScore(match.state.score, snapshot.server, localTeam);
    }
    const serverNow = Date.now() + this.network.netState.serverOffset;
    const seconds = Math.max(0, Math.ceil((this.onlineStartAt - serverNow) / 1000));
    const localTeam = this.localFighterId === "player" || this.localFighterId === "A2" ? "A" : "B";
    this.onlineStatus.textContent = seconds > 0
      ? `Partida online · ${seconds} · seu time: ${localTeam}`
      : `Partida online · seu time: ${localTeam} · ping: ${Math.round(this.network.netState.ping)} ms`;
  }

  /** Traduz eventos da simulação em feedback: shake, pulso da barreira, HUD, partículas, slow motion. */
  handleEvents(events) {
    const pc = this.gameConfig.parry;
    const localId = this.localFighterId || "player";
    const localTeam = localId === "player" || localId === "A2" ? "A" : "B";
    const teamOfFighter = (id) => id === "player" || id === "A2" || id === "A1" ? "A" : "B";
    const isLocal = (id) => id === localId;
    const isFriendly = (id) => teamOfFighter(id) === localTeam;
    const who = (winner) => (isFriendly(winner) ? "Ponto seu time" : "Ponto do rival");
    for (const e of events) {
      switch (e.type) {
        case "start":
          this.hud.hideOverlay();
          break;
        case "serveReady":
          this.hud.setHint("");
          this.hud.flash(
            isLocal(e.server) ? "Seu saque" : isFriendly(e.server) ? "Saque do parceiro" : "Saque do rival",
            "info",
            1100,
            e.attempt > 1 ? "2º saque" : "",
          );
          break;
        case "serveRing":
          if (isLocal(e.server))
            this.hud.setHint(
              "<b>Saque:</b> clique quando o anel encostar no círculo dourado!",
            );
          break;
        case "serve": {
          this.hud.setHint("");
          this.orb.pulse(1);
          this.characters[e.who]?.flashShield(
            e.quality === "perfect" ? "perfect" : "normal",
          );
          const p = this.orb.position;
          if (e.quality === "perfect") {
            // Efeito especial: explosão dourada, shake forte e pausa curta.
            this.burst.emit(p.x, p.y, p.z, {
              count: 60,
              color: "#ffe27a",
              speed: 7,
              up: 4,
              life: 0.9,
              size: 0.3,
            });
            this.burst.emit(p.x, p.y, p.z, {
              count: 25,
              color: "#ffffff",
              speed: 4,
              up: 6,
              life: 0.6,
              size: 0.22,
            });
            this.cameraRig.shake(0.4, 0.3);
            this.hitStop = pc.hitStop;
            this.hud.flash(
              isLocal(e.who)
                ? "SAQUE PERFEITO!"
                : isFriendly(e.who) ? "Saque perfeito do seu time!" : "Saque perfeito do rival!",
              isFriendly(e.who) ? "perfect" : "bad",
              1000,
            );
          } else if (e.quality === "bad") {
            this.cameraRig.shake(0.05, 0.12);
            if (isFriendly(e.who))
              this.hud.flash(
                e.auto ? (isLocal(e.who) ? "Tempo esgotado!" : "Tempo esgotado no saque do parceiro") : "Saque fraco",
                "bad",
                900,
              );
          } else {
            this.cameraRig.shake(0.1, 0.15);
          }
          break;
        }
        case "hit": {
          this.characters[e.who]?.flashShield(e.quality);
          this.orb.pulse(e.strong ? 1.6 : 1);
          this.impactWaves.spawn(
            e.x,
            e.z,
            e.curve ? "#44eaff" : e.strong ? "#ff6428" : "#ffc94d",
          );
          if (e.strong) {
            this.cameraRig.shake(e.quality === "perfect" ? 0.55 : 0.38, 0.34);
            if (e.quality === "perfect") this.hitStop = pc.hitStop;
            if (isFriendly(e.who)) {
              this.hud.flash(
                e.curve
                  ? "CORTADA FLAMEJANTE!"
                  : e.quality === "perfect"
                    ? "CORTADA PERFEITA!"
                    : "CORTADA!",
                e.quality === "perfect" ? "perfect" : "info",
                1000,
                e.passiveStacks ? `COMBUSTÃO x${e.passiveStacks}` : "",
              );
            }
          } else if (e.curve && isFriendly(e.who)) {
            this.cameraRig.shake(0.42, 0.3);
            this.burst.emit(e.x, e.y, e.z, {
              count: 42,
              color: "#ff7a26",
              speed: 5,
              up: 2.5,
              life: 0.55,
              size: 0.24,
            });
            this.hud.flash(
              "CURVA FLAMEJANTE!",
              "perfect",
              900,
              e.passiveStacks ? `COMBUSTÃO x${e.passiveStacks}` : "",
            );
          } else if (e.quality === "perfect") {
            this.cameraRig.shake(0.38, 0.3);
            this.hitStop = pc.hitStop;
            this.hud.flash(
              isFriendly(e.who)
                ? "PARRY PERFEITO!"
                : "Parry perfeito do rival!",
              isFriendly(e.who) ? "perfect" : "bad",
              900,
              e.who === "player" && e.passiveStacks
                ? `COMBUSTÃO x${e.passiveStacks}`
                : "",
            );
          } else {
            this.cameraRig.shake(0.1 + this.orb.speedRatio * 0.15, 0.2);
          }
          if (isLocal(e.who)) this.hud.setTiming(e.error, e.quality);
          break;
        }
        case "dash":
          this.burst.emit(e.x, 0.18, e.z, {
            count: 42,
            color: "#ff4b19",
            speed: 5.5,
            up: 2.2,
            life: 0.6,
            size: 0.25,
          });
          this.impactWaves.spawn(e.x, e.z, "#ff6a24");
          this.cameraRig.shake(0.16, 0.2);
          this.hud.flash("INVESTIDA FLAMEJANTE!", "info", 850);
          break;
        case "dashReady":
          this.burst.emit(e.x, 0.18, e.z, {
            count: 18,
            color: "#ffd34f",
            speed: 2.5,
            up: 2.2,
            life: 0.4,
            size: 0.18,
          });
          break;
        case "meteor":
          this.cameraRig.shake(0.28, 0.38);
          this.hud.flash(
            "METEORO!",
            "perfect",
            1300,
            "Acerte o centro do círculo para devolver",
          );
          this.burst.emit(
            this.orb.position.x,
            this.orb.position.y,
            this.orb.position.z,
            {
              count: 48,
              color: "#ff6428",
              speed: 4.2,
              up: 8,
              life: 0.8,
              size: 0.28,
            },
          );
          break;
        case "meteorFall":
          this.burst.emit(e.x, e.y, e.z, {
            count: 42,
            color: "#fff0b0",
            speed: 4.5,
            up: 2,
            life: 0.45,
            size: 0.24,
          });
          break;
        case "meteorImpact":
          this.burst.emit(e.x, 0.12, e.z, {
            count: 64,
            color: e.returned ? "#ffe17a" : "#ff482e",
            speed: 6,
            up: 4,
            life: 0.8,
            size: 0.28,
          });
          this.impactWaves.spawn(e.x, e.z, "#ffb12e", 0);
          this.impactWaves.spawn(e.x, e.z, "#fff078", 0.12);
          this.impactWaves.spawn(e.x, e.z, "#ff4b21", 0.24);
          this.cameraRig.shake(0.42, 0.38);
          break;
        case "meteorReturn":
          this.hud.flash("METEORO DEVOLVIDO!", "bad", 1000);
          break;
        case "frostWall":
          this.burst.emit(0, 1.4, 5.6, {
            count: 44,
            color: "#8beaff",
            speed: 3.5,
            up: 2.5,
            life: 0.8,
            size: 0.23,
          });
          this.hud.flash("MURALHA DE CRISTAL", "info", 900);
          break;
        case "wallReflect":
          this.burst.emit(e.x, e.y, e.z, {
            count: 50,
            color: "#b6f6ff",
            speed: 5,
            up: 3.2,
            life: 0.65,
            size: 0.22,
          });
          this.impactWaves.spawn(e.x, e.z, "#8beaff");
          this.hud.flash("BOLA REBATIDA PELA MURALHA!", "good", 900);
          break;
        case "iceRink":
          this.burst.emit(0, 0.12, -5, {
            count: 80,
            color: "#8beaff",
            speed: 5,
            up: 1.5,
            life: 1,
            size: 0.18,
          });
          this.hud.flash(
            "PISTA DE PATINAÇÃO",
            "perfect",
            1100,
            "O rival perdeu tração",
          );
          break;
        case "gust":
          this.burst.emit(e.x, e.y, e.z, {
            count: 34,
            color: "#9dffe2",
            speed: 5,
            up: 1.8,
            life: 0.55,
            size: 0.19,
          });
          this.hud.flash("RAJADA DE VENTO", "info", 750);
          break;
        case "tornado":
          this.cameraRig.shake(0.12, 0.3);
          this.hud.flash(
            "OLHO DO FURACÃO",
            "perfect",
            900,
            "A bola foi sugada pela rede",
          );
          break;
        case "tornadoLaunch":
          this.burst.emit(e.x, e.y, e.z, {
            count: 72,
            color: "#9dffe2",
            speed: 8,
            up: 3.4,
            life: 0.6,
            size: 0.24,
          });
          this.cameraRig.shake(0.5, 0.35);
          break;
        case "shortCircuit":
        case "shortCircuitRelease":
          this.burst.emit(e.x, e.y, e.z, {
            count: 34,
            color: "#ffe45c",
            speed: 4.5,
            up: 2.2,
            life: 0.45,
            size: 0.17,
          });
          if (e.type === "shortCircuit")
            this.hud.flash("CURTO-CIRCUITO", "info", 700);
          break;
        case "overload":
          this.hud.staticFlash();
          this.hud.flash(
            "SOBRECARGA!",
            "perfect",
            950,
            "Raio em velocidade máxima",
          );
          this.cameraRig.shake(0.38, 0.3);
          this.burst.emit(e.x, e.y, e.z, {
            count: 64,
            color: "#fff178",
            speed: 8,
            up: 3,
            life: 0.55,
            size: 0.24,
          });
          break;
        case "bounce":
          this.orb.pulse(0.5);
          this.bounceMarks.spawn(e.x, e.z, e.inside);
          if (e.inside)
            this.burst.emit(e.x, 0.1, e.z, {
              count: 7,
              color: "#7dffb0",
              speed: 2.2,
              up: 2.2,
              life: 0.4,
              size: 0.16,
            });
          else
            this.burst.emit(e.x, 0.1, e.z, {
              count: 16,
              color: "#ff4a4a",
              speed: 3,
              up: 3,
              life: 0.6,
              size: 0.2,
            });
          break;
        case "net":
          this.barrier.pulse(this.orb.position, 0.6 + this.orb.speedRatio);
          this.cameraRig.shake(0.06 + this.orb.speedRatio * 0.1, 0.2);
          break;
        case "out":
          // OUT!: mensagem, explosão de partículas no ponto do quique e slow motion.
          this.burst.emit(e.x, 0.1, e.z, {
            count: 70,
            color: "#ff3a3a",
            speed: 6,
            up: 5,
            life: 1.0,
            size: 0.32,
          });
          this.burst.emit(e.x, 0.1, e.z, {
            count: 25,
            color: "#ffd0a0",
            speed: 3,
            up: 7,
            life: 0.8,
            size: 0.2,
          });
          this.hud.flash("OUT!", "bad", 1600, who(e.winner));
          this.cameraRig.shake(0.2, 0.3);
          this.slowTimer = 0.75;
          break;
        case "fault":
          if (e.x || e.z)
            this.burst.emit(e.x, 0.1, e.z, {
              count: 24,
              color: "#ffa13a",
              speed: 3.5,
              up: 3,
              life: 0.7,
              size: 0.22,
            });
          if (!e.last) this.hud.flash("FALTA!", "bad", 1300, "2º saque");
          break;
        case "point":
          if (e.kind === "out") break; // já mostrado pelo evento 'out'
          if (e.kind === "doubleFault")
            this.hud.flash(
              "DUPLA FALTA!",
              isFriendly(e.winner) ? "good" : "bad",
              1500,
              who(e.winner),
            );
          else if (e.kind === "ace")
            this.hud.flash(
              "ACE!",
              isFriendly(e.winner) ? "perfect" : "bad",
              1500,
              who(e.winner),
            );
          else
            this.hud.flash(
              e.reason,
              isFriendly(e.winner) ? "good" : "bad",
              1500,
              who(e.winner),
            );
          this.cameraRig.shake(0.15, 0.25);
          break;
        case "matchOver":
          this.hud.showEnd(isFriendly(e.winner), e.score);
          break;
        default:
          break;
      }
    }
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    pointUniforms.uTime.value = time;

    this.arena.position.y =
      Math.sin(time * this.arenaConfig.court.floatSpeed) *
      this.arenaConfig.court.floatAmplitude;

    // --- entrada -> simulação (passo fixo dentro do Match) -> eventos
    const intent = this.input.read(this.camera, this.arena);
    const abilityRequests = this.hud.consumeAbilityRequests();
    intent.dashPress ||= abilityRequests.dash;
    intent.ultimatePress ||= abilityRequests.ultimate;
    const match = this.match;
    if (!this.online && match.phase === "ready") {
      if (this.hud.consumeCtaRequest()) match.start();
      // Cliques no fundo e nos controles do menu não viram golpes no jogo.
      intent.press = false;
      intent.strongPress = false;
      intent.dashPress = false;
      intent.ultimatePress = false;
    } else if (!this.online && match.phase === "over") {
      if (match.phaseTime > 0.8 && this.hud.consumeCtaRequest())
        match.restart();
      intent.press = false;
      intent.strongPress = false;
      intent.dashPress = false;
      intent.ultimatePress = false;
    }
    // Tempo de simulação: hit-stop (congela) e slow motion (OUT!) afetam a partida e os personagens.
    let timeScale = 1;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      timeScale = 0.28;
    }
    let simDt = dt * timeScale;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      simDt = 0;
    }
    if (this.online) {
      const localId = this.localFighterId || this.network.fighterId;
      if (localId && (match.fighters[localId]?.sign || 1) < 0) {
        intent.moveX *= -1;
        intent.moveZ *= -1;
      }
      if (intent.press) this.characters[localId]?.flashShield("normal");
      this.network.sendInput(intent, dt);
      const snapshot = this.network.netState.sample();
      if (snapshot) this.applyOnlineSnapshot(snapshot);
      const countdown = Math.max(0, Math.ceil((this.onlineStartAt - (Date.now() + this.network.netState.serverOffset)) / 1000));
      if (countdown > 0) {
        const localTeam = localId === "player" || localId === "A2" ? "A" : "B";
        this.onlineStatus.textContent = `Partida online · ${countdown} · seu time: ${localTeam}`;
      }
      const queued = this.onlineEvents.splice(0);
      this.handleEvents(queued.filter((event) => event.type !== "matchOver"));
    } else {
      match.update(simDt, intent);
      this.handleEvents(match.consumeEvents());
    }

    // --- visual
    const vdt = dt * timeScale;
    this.orb.update(vdt, match.ball);
    this.characters.player?.update(vdt, time, match.fighters.player);
    this.characters.bot?.update(vdt, time, match.fighters.bot);
    this.characters.A2?.update(vdt, time, match.fighters.A2);
    this.characters.B2?.update(vdt, time, match.fighters.B2);
    this.bounceMarks.update(vdt);
    this.dashTrailTimer -= vdt;
    const player = match.fighters[this.localFighterId || "player"] || match.fighters.player;
    if (player.dashTimer > 0 && this.dashTrailTimer <= 0) {
      this.burst.emit(
        player.x - player.dashDirX * 0.35,
        0.35,
        player.z - player.dashDirZ * 0.35,
        {
          count: 8,
          color: "#ff6324",
          speed: 2.2,
          up: 1.2,
          life: 0.42,
          size: 0.2,
        },
      );
      this.dashTrailTimer = 0.035;
    }
    this.meteorTrailTimer -= vdt;
    if (match.meteor && this.meteorTrailTimer <= 0) {
      const b = match.ball;
      this.burst.emit(b.x, b.y, b.z, {
        count: match.meteor.falling ? 7 : 4,
        color: match.meteor.falling ? "#fff0b0" : "#ff6a24",
        speed: match.meteor.falling ? 2.8 : 1.8,
        up: match.meteor.falling ? 1.5 : 3.2,
        life: 0.36,
        size: 0.22,
      });
      this.meteorTrailTimer = 0.035;
    }
    this.burst.update(vdt);
    this.impactWaves.update(vdt);
    this.abilityFields.update(match.effects, time);

    const sInfo = match.serveInfo;
    const playerServing = sInfo.inServe && sInfo.server === (this.localFighterId || "player");
    this.serveBox.update(time, sInfo.box, sInfo.inServe);
    this.serveRing.update(
      time,
      this.camera,
      this.orb.position,
      sInfo,
      playerServing && sInfo.active,
    );

    // Mira: no saque, presa à caixa de saque; no rali, na metade do adversário.
    const A = this.gameConfig.aim;
    const p = match.fighters[this.localFighterId || "player"] || match.fighters.player;
    const localSign = p.sign || 1;
    let ax = intent.aimX,
      az = localSign > 0 ? Math.min(intent.aimZ, -0.8) : Math.max(intent.aimZ, 0.8);
    let region = rallyRegion(this.gameConfig.court, localSign);
    let inside;
    if (playerServing) {
      [ax, az] = clampToBox(intent.aimX, intent.aimZ, sInfo.box);
      region = boxRegion(sInfo.box);
      inside = true;
    } else {
      inside = match.rules.isInside(ax, az);
    }
    const risk = riskAt(ax, az, region, A);
    const typicalDev = deviationDeg(0.5, risk, A) * (Math.PI / 180); // espalhamento de uma rebatida "meio ruim"
    const spread = Math.hypot(ax - p.x, az - p.z) * Math.tan(typicalDev);
    this.aimMarker.update(time, ax, az, {
      inside,
      risk,
      spread,
      visible:
        (match.phase === "rally" && !match.meteor) ||
        (playerServing && sInfo.active),
    });
    this.hud.setAbilityStatus(
      match.abilityInfo,
      ROSTER[player.characterId || this.selectedCharacterId],
    );
    this.otherUltTimer -= dt;
    if (this.mode === "2v2" && this.otherUltTimer <= 0) {
      this.otherUltTimer = 0.25;
      this.hud.setOtherUltimates(match.fighters, ROSTER, this.localFighterId || "player");
    }
    const scoreKey = `${match.state.score.player}-${match.state.score.bot}-${match.state.server}`;
    if (scoreKey !== this.lastScoreKey) {
      this.lastScoreKey = scoreKey;
      const localTeam = this.online && this.localFighterId !== "player" && this.localFighterId !== "A2" ? "B" : "A";
      this.hud.setScore(match.state.score, match.state.server, localTeam);
    }

    this.court.update(time);
    this.barrier.setTint(this.orb.color);
    this.barrier.update(time, dt, this.orb.position);
    this.obelisks.update(time);
    this.banners.update(time);
    this.islands.update(time);
    this.particles.update(time);

    this.arena.localToWorld(this.tmp.copy(this.orb.position));
    this.lightingRig.updateOrbLight(this.orb.color, this.tmp, this.orb.flash);

    this.cameraRig.update(dt);
    this.galaxy.group.position.copy(this.camera.position);
    this.galaxy.update(dt, time, this.orb.speedRatio);

    this.composer.render();
  }
}
