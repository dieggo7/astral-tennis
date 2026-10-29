import "dotenv/config";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { getModeConfig } from "../src/config/constants.js";
import { Match } from "../shared/sim.js";
import { PLAYER, BOT } from "../src/sim/Rules.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NAMES = new Set(["ignis", "glacia", "zephyr", "volta"]);
const MOVE_SPEED_LIMIT = 1;
const FIXED_DT = 1 / 60;

function token() { return randomBytes(24).toString("base64url"); }
function createCode(rooms) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const bytes = randomBytes(6);
    let code = "";
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Nao foi possivel gerar um codigo de sala.");
}
function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 16);
}
function uniqueName(room, requested) {
  const base = cleanName(requested) || "Mago";
  const has = (name) => room.players.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` (${i})`;
    const candidate = `${base.slice(0, 16 - suffix.length)}${suffix}`;
    if (!has(candidate)) return candidate;
  }
  return `Mago ${randomBytes(2).toString("hex")}`;
}
function teamCapacity(mode) { return mode === "2v2" ? 2 : 1; }
function chooseTeam(room) {
  const max = teamCapacity(room.mode);
  const a = room.players.filter((p) => p.team === "A").length;
  const b = room.players.filter((p) => p.team === "B").length;
  return a < max ? "A" : b < max ? "B" : null;
}
function fighterFor(room, player) {
  if (room.mode === "1v1") return player.team === "A" ? PLAYER : BOT;
  const teammates = room.players.filter((p) => p.team === player.team).sort((a, b) => a.joinedAt - b.joinedAt);
  const idx = teammates.indexOf(player);
  if (player.team === "A") return idx === 0 ? PLAYER : "A2";
  return idx === 0 ? BOT : "B2";
}
function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    host: room.hostId,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, characterId: p.characterId,
      connected: !!p.socketId, host: p.id === room.hostId,
      fighterId: room.status === "lobby" ? null : p.fighterId,
    })),
    capacity: room.mode === "2v2" ? 4 : 2,
    connectedCount: room.players.filter((p) => p.socketId).length,
  };
}

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withRandom(room, fn) {
  const original = Math.random;
  Math.random = room.random;
  try { return fn(); } finally { Math.random = original; }
}

export function createGameServer({ port = Number(process.env.PORT || 3001), clientOrigin = process.env.CLIENT_ORIGIN || "*", logger = console } = {}) {
  const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Astral Tennis room server");
  });
  const io = new Server(httpServer, {
    cors: { origin: clientOrigin === "*" ? "*" : clientOrigin.split(",").map((x) => x.trim()), methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });
  const rooms = new Map();
  const reconnectTimers = new Map();
  let nextPlayerOrder = 1;

  const emitError = (socket, reason) => socket.emit("room:error", { reason });
  const emitRoom = (room) => io.to(room.code).emit("room:state", publicRoom(room));
  const removeRoom = (room) => {
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    if (room.pauseTimer) clearTimeout(room.pauseTimer);
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    rooms.delete(room.code);
    room.players.forEach((p) => reconnectTimers.delete(p.token));
  };
  const playerForSocket = (room, socket) => room?.players.find((p) => p.socketId === socket.id);
  const checkSession = (socket) => {
    const room = [...rooms.values()].find((r) => r.players.some((p) => p.token === socket.data.resumeToken));
    const player = room?.players.find((p) => p.token === socket.data.resumeToken);
    return room && player ? { room, player } : null;
  };
  const startMatch = (room) => {
    if (room.status !== "lobby" && room.status !== "finished") return false;
    const max = room.mode === "2v2" ? 4 : 2;
    if (room.players.length !== max || room.players.some((p) => !p.socketId)) return false;
    if (["A", "B"].some((team) => room.players.filter((p) => p.team === team).length !== teamCapacity(room.mode))) return false;
    const game = getModeConfig(room.mode).game;
    game.networkMode = true;
    game.twoVTwo ||= {};
    game.twoVTwo.AI_USE_ABILITIES = false;
    room.seed = randomBytes(4).readUInt32BE(0);
    room.random = mulberry32(room.seed);
    room.match = withRandom(room, () => {
      const match = new Match(game);
      for (const p of room.players) {
        p.fighterId = fighterFor(room, p);
        match.setFighterCharacter(p.fighterId, p.characterId);
      }
      return match;
    });
    room.inputs = new Map();
    room.lastSeq = new Map();
    room.status = "countdown";
    room.paused = false;
    room.pendingEnd = false;
    const startsAt = Date.now() + 3000;
    const config = { mode: room.mode, court: game.court, winScore: game.winScore, step: 1 / 120 };
    io.to(room.code).emit("match:start", {
      seed: room.seed, startsAt, config,
      ack: Object.fromEntries(room.players.map((p) => [p.fighterId, room.lastSeq.get(p.id) ?? -1])),
      players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team, fighterId: p.fighterId, characterId: p.characterId })),
    });
    emitRoom(room);
    room.countdownTimer = setTimeout(() => {
      if (!rooms.has(room.code) || room.status !== "countdown") return;
      withRandom(room, () => room.match.start());
      room.status = "playing";
      room.tick = 0;
      room.lastSnapshot = 0;
      emitRoom(room);
    }, Math.max(0, startsAt - Date.now()));
    return true;
  };
  const finishMatch = (room, winnerTeam, reason = "match") => {
    if (room.status === "finished" || room.status === "lobby") return;
    const disconnected = room.players.filter((p) => !p.socketId);
    for (const p of disconnected) reconnectTimers.delete(p.token);
    room.players = room.players.filter((p) => !!p.socketId);
    if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id || null;
    const capacity = room.mode === "2v2" ? 4 : 2;
    room.status = room.players.length < capacity ? "lobby" : "finished";
    room.paused = false;
    if (room.pauseTimer) clearTimeout(room.pauseTimer);
    io.to(room.code).emit("match:end", {
      winnerTeam, score: { ...room.match.state.score }, reason,
    });
    emitRoom(room);
  };
  const handleDisconnect = (room, player) => {
    reconnectTimers.delete(player.token);
    player.socketId = null;
    if (room.status === "lobby" || room.status === "finished") {
      const wasFinished = room.status === "finished";
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.hostId === player.id) room.hostId = room.players.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id || null;
      if (wasFinished && room.players.length < (room.mode === "2v2" ? 4 : 2)) room.status = "lobby";
      if (!room.players.length) removeRoom(room);
      else emitRoom(room);
      return;
    }
    if (room.status === "countdown") {
      if (room.countdownTimer) clearTimeout(room.countdownTimer);
      room.status = "lobby";
      emitErrorToRoom(room, "Um jogador desconectou; inicio cancelado.");
      emitRoom(room);
      return;
    }
    room.paused = true;
    room.pauseStartedAt = Date.now();
    io.to(room.code).emit("match:paused", { playerId: player.id, seconds: 20 });
    room.pauseTimer = setTimeout(() => {
      if (!room.paused || player.socketId) return;
      const sameTeamOnline = room.players.some((p) => p.team === player.team && p.socketId);
      if (room.mode === "1v1" || !sameTeamOnline) {
        finishMatch(room, player.team === "A" ? "B" : "A", "forfeit");
        room.players = room.players.filter((p) => p.id !== player.id);
        if (room.hostId === player.id) room.hostId = room.players.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id || null;
        room.status = "lobby";
        if (!room.players.length) removeRoom(room);
        else emitRoom(room);
      } else {
        // In 2v2 the missing seat is released after 20s; the simulation's AI takes over that fighter.
        room.players = room.players.filter((p) => p.id !== player.id);
        reconnectTimers.delete(player.token);
        room.paused = false;
        room.status = "playing";
        io.to(room.code).emit("match:resumed", { reason: "teammate-continues" });
        emitRoom(room);
      }
    }, 20000);
    if (room.players.every((p) => !p.socketId)) {
      room.emptyTimer = setTimeout(() => { if (room.players.every((p) => !p.socketId)) removeRoom(room); }, 30000);
    }
    emitRoom(room);
  };
  function emitErrorToRoom(room, reason) { io.to(room.code).emit("room:error", { reason }); }

  io.on("connection", (socket) => {
    socket.data.resumeToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    const resumed = checkSession(socket);
    if (resumed) {
      const { room, player } = resumed;
      player.socketId = socket.id;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      const timer = reconnectTimers.get(player.token);
      if (timer) clearTimeout(timer);
      reconnectTimers.delete(player.token);
      if (room.paused && room.players.every((p) => p.socketId || p.id === player.id)) {
        room.paused = false;
        if (room.pauseTimer) clearTimeout(room.pauseTimer);
        room.status = "playing";
        io.to(room.code).emit("match:resumed", { startsAt: Date.now() + 1000 });
      }
      socket.emit("session:resumed", { token: player.token, playerId: player.id, fighterId: player.fighterId || null, room: publicRoom(room) });
      if (room.match && (room.status === "playing" || room.status === "countdown")) {
        const game = getModeConfig(room.mode).game;
        socket.emit("match:start", {
          seed: room.seed, startsAt: Date.now(), config: { mode: room.mode, court: game.court, winScore: game.winScore, step: 1 / 120 },
          ack: Object.fromEntries(room.players.map((p) => [p.fighterId, room.lastSeq.get(p.id) ?? -1])),
          players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team, fighterId: p.fighterId, characterId: p.characterId })),
        });
        if (room.status === "playing") socket.emit("snapshot", makeSnapshot(room));
      }
      emitRoom(room);
    }

    socket.on("room:create", (data = {}, ack = () => {}) => {
      data = data && typeof data === "object" ? data : {};
      const mode = data.mode === "2v2" ? "2v2" : data.mode === "1v1" ? "1v1" : null;
      if (!mode) return replyError(socket, ack, "Escolha 1v1 ou 2v2.");
      if (socket.data.roomCode) return replyError(socket, ack, "Voce ja esta em uma sala.");
      const code = createCode(rooms);
      const room = {
        code, mode, status: "lobby", hostId: null, players: [], createdAt: Date.now(),
        match: null, inputs: new Map(), lastSeq: new Map(),
      };
      const player = makePlayer(room, socket, data.name, "A");
      room.hostId = player.id;
      rooms.set(code, room);
      socket.join(code); socket.data.roomCode = code;
      emitRoom(room);
      ack({ ok: true, code, token: player.token, playerId: player.id, fighterId: null, room: publicRoom(room) });
    });

    socket.on("room:join", (data = {}, ack = () => {}) => {
      data = data && typeof data === "object" ? data : {};
      const code = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
      const room = rooms.get(code);
      if (!room) return replyError(socket, ack, "Codigo de sala inexistente.");
      if (room.status !== "lobby") return replyError(socket, ack, "A partida desta sala ja comecou.");
      if (room.players.length >= (room.mode === "2v2" ? 4 : 2)) return replyError(socket, ack, "Sala cheia.");
      if (socket.data.roomCode) return replyError(socket, ack, "Voce ja esta em uma sala.");
      const team = chooseTeam(room);
      const player = makePlayer(room, socket, data.name, team);
      socket.join(code); socket.data.roomCode = code;
      emitRoom(room);
      ack({ ok: true, code, token: player.token, playerId: player.id, fighterId: null, room: publicRoom(room) });
    });

    socket.on("room:setTeam", (data = {}, ack = () => {}) => {
      data = data && typeof data === "object" ? data : {};
      const room = rooms.get(socket.data.roomCode);
      const actor = playerForSocket(room, socket);
      if (!room || !actor || room.status !== "lobby") return replyError(socket, ack, "Times so podem ser alterados no lobby.");
      const target = actor.id === room.hostId && typeof data.playerId === "string" ? room.players.find((p) => p.id === data.playerId) : actor;
      const team = data.team === "A" || data.team === "B" ? data.team : null;
      if (!target || !team) return replyError(socket, ack, "Time invalido.");
      const count = room.players.filter((p) => p.team === team && p.id !== target.id).length;
      if (count >= teamCapacity(room.mode)) return replyError(socket, ack, "Esse time ja esta completo.");
      target.team = team; emitRoom(room); ack({ ok: true });
    });

    socket.on("room:setCharacter", (data = {}, ack = () => {}) => {
      data = data && typeof data === "object" ? data : {};
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || !player || room.status !== "lobby") return replyError(socket, ack, "Personagem so pode ser alterado no lobby.");
      if (!NAMES.has(data.characterId)) return replyError(socket, ack, "Personagem invalido.");
      player.characterId = data.characterId; emitRoom(room); ack({ ok: true });
    });

    socket.on("room:start", (_data = {}, ack = () => {}) => {
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || !player) return replyError(socket, ack, "Voce nao esta em uma sala.");
      if (room.hostId !== player.id) return replyError(socket, ack, "Somente o anfitriao pode iniciar.");
      if (!startMatch(room)) return replyError(socket, ack, "Preencha todas as vagas com jogadores conectados antes de iniciar.");
      ack({ ok: true });
    });

    socket.on("room:rematch", (_data = {}, ack = () => {}) => {
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || !player || player.id !== room.hostId) return replyError(socket, ack, "Somente o anfitriao pode iniciar a revanche.");
      if (room.status !== "finished" || !startMatch(room)) return replyError(socket, ack, "A revanche nao esta disponivel.");
      ack({ ok: true });
    });

    socket.on("room:end", (_data = {}, ack = () => {}) => {
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || !player || player.id !== room.hostId) return replyError(socket, ack, "Somente o anfitriao pode encerrar a partida.");
      if (room.mode !== "2v2" || room.status !== "playing") return replyError(socket, ack, "Encerramento manual so esta disponivel durante uma partida 2v2.");
      finishMatch(room, null, "host-ended");
      ack({ ok: true });
    });

    socket.on("input", (data = {}) => {
      if (!data || typeof data !== "object") return;
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || room.status !== "playing" || room.paused || !room.match || !player?.fighterId) return;
      const seq = Number.isSafeInteger(data.seq) ? data.seq : -1;
      const previous = room.lastSeq.get(player.id) ?? -1;
      if (seq <= previous) return;
      room.lastSeq.set(player.id, seq);
      const moveX = finiteClamp(data.moveX, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT);
      const moveZ = finiteClamp(data.moveZ, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT);
      const court = room.match.court;
      const input = {
        moveX, moveZ,
        aimX: finiteClamp(data.aimX, -court.width / 2 - 1.5, court.width / 2 + 1.5),
        aimZ: finiteClamp(data.aimZ, -court.length / 2 - 1.5, court.length / 2 + 1.5),
        press: data.swing === true || data.press === true,
        strongPress: data.strong === true,
        ability: data.ability === true,
        ultimate: data.ultimate === true,
      };
      room.inputs.set(player.fighterId, { ...input, seq });
      player.lastInputAt = Date.now();
    });

    socket.on("room:leave", (_data = {}, ack = () => {}) => {
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (room && player) {
        handleDisconnect(room, player);
        socket.leave(room.code); socket.data.roomCode = null;
      }
      ack({ ok: true });
    });

    socket.on("disconnect", () => {
      const room = rooms.get(socket.data.roomCode), player = playerForSocket(room, socket);
      if (!room || !player) return;
      player.socketId = null;
      const delay = room.status === "playing" ? 150 : 1500;
      const timer = setTimeout(() => handleDisconnect(room, player), delay);
      reconnectTimers.set(player.token, timer);
    });
    socket.on("clock:pong", (data = {}) => socket.emit("clock:pong", { id: data && typeof data.id === "string" ? data.id : "", serverTime: Date.now() }));
  });

  const tickTimer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.status !== "playing" || room.paused || !room.match) continue;
      room.tick += 1;
      const intents = {};
      for (const player of room.players) {
        if (player.fighterId && player.socketId) {
          const latest = room.inputs.get(player.fighterId) || neutralInput(room.match, player.fighterId);
          intents[player.fighterId] = latest;
          room.inputs.set(player.fighterId, { ...latest, press: false, swing: false, strong: false, strongPress: false, ability: false, ultimate: false });
        }
      }
      withRandom(room, () => room.match.update(FIXED_DT, { intents }));
      for (const event of room.match.consumeEvents()) io.to(room.code).emit("event", { ...event, serverTime: Date.now() });
      if (room.match.phase === "over") { finishMatch(room, room.match.state.winner === PLAYER ? "A" : "B"); continue; }
      if (room.tick % 3 === 0) io.to(room.code).emit("snapshot", makeSnapshot(room));
    }
  }, 1000 / 60);

  const pingTimer = setInterval(() => {
    const now = Date.now();
    for (const socket of io.sockets.sockets.values()) socket.emit("clock:ping", { serverTime: now, id: `${now}-${randomBytes(2).toString("hex")}` });
  }, 5000);

  function makePlayer(room, socket, requestedName, team) {
    const player = {
      id: token().slice(0, 12), token: token(), name: uniqueName(room, requestedName),
      team: team || chooseTeam(room), characterId: "ignis", socketId: socket.id,
      joinedAt: nextPlayerOrder++, fighterId: null,
    };
    room.players.push(player);
    socket.data.roomCode = room.code;
    socket.data.resumeToken = player.token;
    socket.auth = { ...(socket.auth || {}), token: player.token };
    return player;
  }
  function makeSnapshot(room) {
    const match = room.match, ball = match.ball;
    return {
      tick: room.tick, serverTime: Date.now(), phase: match.phase, phaseTime: match.phaseTime,
      orb: pick(ball, ["x", "y", "z", "vx", "vy", "vz", "speed", "r", "held", "fallen"]),
      players: Object.values(match.fighters).map((f) => ({
        fighterId: f.id, team: f.team === PLAYER ? "A" : "B", x: f.x, z: f.z, vx: f.vx, vz: f.vz,
        yaw: f.yaw, animT: f.animT, animDur: f.animDur, mood: f.mood, characterId: f.characterId,
        moveSpeed: f.moveSpeed,
        swinging: f.parry.swinging, dashTimer: f.dashTimer, aiAbilityCooldown: f.aiAbilityCooldown,
        aiUltimateCooldown: f.aiUltimateCooldown,
        abilityCooldown: f.id === PLAYER ? match.abilityCooldown : f.aiAbilityCooldown,
        ultimateCooldown: f.id === PLAYER ? match.ultimateCooldown : f.aiUltimateCooldown,
      })),
      score: { A: match.state.score.player, B: match.state.score.bot },
      server: match.serve?.server || null,
      serverTeam: match.serve?.server === PLAYER || match.serve?.server === "A2" ? "A" : "B",
      ruleState: match.rules.state,
      lastHitter: match.rules.lastHitter,
      bounces: match.rules.bounces,
      serveInfo: match.serveInfo,
      effects: { frostWall: match.effects.frostWall, frostWallZ: match.effects.frostWallZ, frostWallUsed: match.effects.frostWallUsed, iceRink: match.effects.iceRink, iceRinkTeam: match.effects.iceRinkTeam, overload: match.effects.overload, overloadTeam: match.effects.overloadTeam, tornado: match.effects.tornado },
      abilityInfo: match.abilityInfo,
      ack: Object.fromEntries(room.players.map((p) => [p.fighterId, room.lastSeq.get(p.id) ?? -1])),
    };
  }
  function neutralInput(match, fighterId) {
    const f = match.fighters[fighterId];
    return { moveX: 0, moveZ: 0, press: false, aimX: f?.aimX || 0, aimZ: f?.aimZ || 0 };
  }
  function replyError(socket, ack, reason) { emitError(socket, reason); if (typeof ack === "function") ack({ ok: false, reason }); }
  function finiteClamp(value, min, max) { return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0; }
  function pick(object, keys) { return Object.fromEntries(keys.map((key) => [key, object[key]])); }

  return {
    io, httpServer, rooms,
    listen: () => new Promise((resolve) => httpServer.listen(port, "0.0.0.0", () => resolve(httpServer.address()))),
    close: async () => {
      clearInterval(tickTimer); clearInterval(pingTimer);
      for (const room of rooms.values()) removeRoom(room);
      await new Promise((resolve) => io.close(resolve));
      if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createGameServer();
  app.listen().then((address) => console.log(`Astral Tennis server listening on ${address.port}`));
}
