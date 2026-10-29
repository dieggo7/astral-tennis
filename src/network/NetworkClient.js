import { io } from "socket.io-client";
import { NetState } from "./NetState.js";

const TOKEN_KEY = "astral-online-token";
const INPUT_SEND_INTERVAL_MS = 1000 / 60;
const EDGE_INPUTS = ["press", "strongPress", "dashPress", "ultimatePress"];

export class NetworkClient {
  constructor(url = import.meta.env.VITE_SERVER_URL || "http://localhost:3001") {
    this.url = url;
    this.token = sessionStorage.getItem(TOKEN_KEY) || "";
    this.playerId = null;
    this.fighterId = null;
    this.room = null;
    this.seq = 0;
    this.lastInputSentAt = 0;
    this.pendingInput = null;
    this.pendingInputDt = 0;
    this.listeners = new Map();
    this.pings = new Map();
    this.netState = new NetState();
    this.socket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3000,
      timeout: 8000,
      transports: ["websocket", "polling"],
      auth: (cb) => cb({ token: this.token }),
    });
    this.bindSocket();
  }

  bindSocket() {
    this.socket.on("connect", () => this.dispatch("connect", {}));
    this.socket.on("disconnect", (reason) => {
      this.clearPendingInput();
      this.dispatch("disconnect", { reason });
    });
    this.socket.on("connect_error", (error) => this.dispatch("connect_error", { reason: error.message }));
    for (const event of ["room:state", "room:error", "session:resumed", "match:start", "match:countdown", "match:paused", "match:resumed", "match:end", "event"]) {
      this.socket.on(event, (data) => {
        if (event === "room:state") this.room = data;
        if (event === "session:resumed") this.acceptSession(data);
        if (event === "match:start") {
          const own = data.players?.find((p) => p.id === this.playerId);
          if (own) {
            this.acceptSession({ fighterId: own.fighterId });
            const ack = data.ack?.[own.fighterId] ?? -1;
            this.seq = Math.max(this.seq, ack);
          }
          this.netState.setLocalFighter(this.fighterId);
          this.clearPendingInput();
        }
        this.dispatch(event, data);
      });
    }
    this.socket.on("snapshot", (snapshot) => {
      const ack = snapshot.ack?.[this.fighterId];
      if (Number.isSafeInteger(ack)) this.seq = Math.max(this.seq, ack);
      this.netState.push(snapshot);
      this.dispatch("snapshot", snapshot);
    });
    this.socket.on("clock:ping", ({ id, serverTime }) => {
      this.pings.set(id, { sentAt: Date.now(), serverTime });
      this.socket.emit("clock:pong", { id });
    });
    this.socket.on("clock:pong", ({ id, serverTime }) => {
      const mark = this.pings.get(id);
      if (!mark) return;
      const now = Date.now();
      const rtt = now - mark.sentAt;
      const midpoint = (mark.sentAt + now) / 2;
      this.netState.ping = rtt;
      this.netState.serverOffset = serverTime - midpoint;
      this.pings.delete(id);
      this.dispatch("ping", { rtt, offset: this.netState.serverOffset });
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  dispatch(event, data) {
    for (const callback of this.listeners.get(event) || []) callback(data);
  }

  async connect() {
    if (this.socket.connected) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Tempo esgotado ao conectar ao servidor.")); }, 9000);
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (error) => { cleanup(); reject(new Error(error.message || "Falha de conexao.")); };
      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off("connect", onConnect);
        this.socket.off("connect_error", onError);
      };
      this.socket.once("connect", onConnect);
      this.socket.once("connect_error", onError);
      this.socket.connect();
    });
  }

  async createRoom(mode, name) {
    await this.connect();
    const result = await this.request("room:create", { mode, name });
    if (result.ok) { this.acceptSession(result); if (result.room) this.dispatch("room:state", result.room); }
    return result;
  }

  async joinRoom(code, name) {
    await this.connect();
    const result = await this.request("room:join", { code, name });
    if (result.ok) { this.acceptSession(result); if (result.room) this.dispatch("room:state", result.room); }
    return result;
  }

  request(event, data = {}) {
    return new Promise((resolve, reject) => {
      this.socket.timeout(7000).emit(event, data, (error, result) => {
        if (error) reject(new Error("O servidor nao respondeu."));
        else if (!result?.ok) reject(new Error(result?.reason || "A solicitacao foi recusada."));
        else resolve(result);
      });
    });
  }

  acceptSession(data) {
    if (data.token) {
      this.token = data.token;
      sessionStorage.setItem(TOKEN_KEY, data.token);
      this.socket.auth = { token: data.token };
    }
    if (data.playerId) this.playerId = data.playerId;
    if (data.fighterId) {
      const changedFighter = this.fighterId !== data.fighterId;
      this.fighterId = data.fighterId;
      this.netState.setLocalFighter(data.fighterId);
      if (changedFighter) this.clearPendingInput();
    }
    if (data.room) this.room = data.room;
  }

  async setTeam(team, playerId) { return this.request("room:setTeam", { team, playerId }); }
  async setCharacter(characterId) { return this.request("room:setCharacter", { characterId }); }
  async startMatch() { return this.request("room:start"); }
  async rematch() { return this.request("room:rematch"); }
  async endMatch() { return this.request("room:end"); }
  async leaveRoom() {
    try { await this.request("room:leave"); } finally {
      this.clearPendingInput();
      this.room = null; this.fighterId = null; this.playerId = null;
      this.token = ""; this.socket.auth = { token: "" }; sessionStorage.removeItem(TOKEN_KEY);
      this.netState.setLocalFighter(null);
    }
  }

  sendInput(input, dt = 1 / 60) {
    if (!this.socket.connected || !this.fighterId) return;
    if (!this.pendingInput) this.pendingInput = { ...input };
    else {
      for (const key of Object.keys(input)) {
        this.pendingInput[key] = EDGE_INPUTS.includes(key)
          ? !!this.pendingInput[key] || !!input[key]
          : input[key];
      }
    }
    this.pendingInputDt = Math.min(0.05, this.pendingInputDt + Math.max(0, dt));
    const now = performance.now();
    if (this.lastInputSentAt && now - this.lastInputSentAt < INPUT_SEND_INTERVAL_MS) return;

    const next = this.pendingInput;
    const sendDt = this.pendingInputDt || dt;
    this.pendingInput = null;
    this.pendingInputDt = 0;
    this.lastInputSentAt = now;
    const seq = ++this.seq;
    this.netState.predict(next, seq, sendDt);
    this.socket.emit("input", {
      seq, moveX: next.moveX, moveZ: next.moveZ,
      aimX: next.aimX, aimZ: next.aimZ,
      swing: next.press, strong: next.strongPress,
      ability: next.dashPress, ultimate: next.ultimatePress,
    });
  }

  clearPendingInput() {
    this.lastInputSentAt = 0;
    this.pendingInput = null;
    this.pendingInputDt = 0;
  }

  close() { this.socket.disconnect(); }
}
