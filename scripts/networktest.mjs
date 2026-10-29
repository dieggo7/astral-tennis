import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server/index.js";
import { NetState } from "../src/network/NetState.js";

const predictedState = new NetState({ interpolationDelay: 0 });
predictedState.setMovementConfig({
  court: { width: 12, length: 24 },
  player: { accel: 55, minZ: 1.2 },
  parry: { swingMoveFactor: 0.5 },
});
predictedState.setLocalFighter("bot");
const predictionSnapshot = (serverTime, x, vx, ack) => ({
  serverTime,
  ack: { bot: ack },
  orb: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, speed: 0 },
  players: [{ fighterId: "bot", team: "B", x, z: -5, vx, vz: 0, yaw: 0, moveSpeed: 9.5, swinging: false }],
});
predictedState.push(predictionSnapshot(1000, 0, 0, -1));
predictedState.predict({ moveX: 1 }, 1, 1 / 60);
const predictedX = predictedState.sample(1016).players[0].x;
assert.ok(predictedX > 0, "local prediction accelerates from rest");
predictedState.push(predictionSnapshot(1050, 0.03, 1.8, 1));
const reconciledX = predictedState.sample(1051).players[0].x;
assert.ok(Math.abs(reconciledX - predictedX) < 0.15, "snapshot reconciliation corrects movement smoothly");

const app = createGameServer({ port: 0, clientOrigin: "*", logger: { log() {}, error: console.error } });
const address = await app.listen();
const url = `http://127.0.0.1:${address.port}`;
const clients = [];

function client(resumeToken = "") {
  const socket = connect(url, { auth: { token: resumeToken }, transports: ["websocket"], reconnection: false, timeout: 3000 });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
function request(socket, event, payload = {}) {
  return new Promise((resolve, reject) => socket.timeout(3000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
}
function event(socket, name, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(new Error(`timeout waiting for ${name}`)); }, timeoutMs);
    const done = (data) => { clearTimeout(timer); resolve(data); };
    socket.once(name, done);
  });
}
function eventWhere(socket, name, predicate, timeoutMs = 9000, label = name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, onEvent);
      const room = [...app.rooms.values()][0];
      const state = room ? `${room.status}/${room.match?.phase} t=${room.match?.phaseTime.toFixed(2)} server=${room.match?.serve?.server} timeout=${room.match?.cfg.serve.timeout} tick=${room.tick} paused=${room.paused} sockets=${room.players.map((p) => !!p.socketId).join(",")}` : "no room";
      reject(new Error(`timeout waiting for ${label} (${state})`));
    }, timeoutMs);
    const onEvent = (data) => {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(name, onEvent);
      resolve(data);
    };
    socket.on(name, onEvent);
  });
}
function clientWaitingFor(resumeToken, eventName) {
  const socket = connect(url, { auth: { token: resumeToken }, transports: ["websocket"], reconnection: false, timeout: 3000 });
  clients.push(socket);
  const received = event(socket, eventName, 3000);
  const connected = new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return { socket, connected, received };
}

try {
  const host = await client(), guest = await client();
  const created = await request(host, "room:create", { mode: "1v1", name: "Ana" });
  assert.equal(created.ok, true);
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const hostOnly = await request(host, "room:start");
  assert.equal(hostOnly.ok, false, "cannot start with an open seat");
  assert.equal((await request(guest, "room:join", { code: "ZZZZZZ", name: "Guest" })).ok, false, "invalid code is rejected");
  const joined = await request(guest, "room:join", { code: created.code.toLowerCase(), name: "Ana" });
  assert.equal(joined.ok, true);
  assert.equal(joined.room.players[1].name, "Ana (2)");
  assert.equal((await request(guest, "room:start")).ok, false, "non-host cannot start");

  const snapshot = event(host, "snapshot", 9000);
  const serveEvent = eventWhere(host, "event", (payload) => payload.type === "serve", 35000, "first serve");
  const pointEvent = eventWhere(host, "event", (payload) => payload.type === "point", 35000, "point after first serve");
  const rivalServe = eventWhere(host, "event", (payload) => payload.type === "serve" && payload.who === "bot", 35000, "rival serve");
  assert.equal((await request(host, "room:start")).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 3200));
  const firstSnapshot = await snapshot;
  assert.ok(firstSnapshot.orb && firstSnapshot.players.length === 2);
  assert.equal(firstSnapshot.winner, null);
  assert.equal(app.rooms.get(created.code).status, "playing");
  const liveRoom = app.rooms.get(created.code);
  assert.deepEqual(liveRoom.players.map((p) => p.fighterId), ["player", "bot"]);
  const guestX = liveRoom.match.fighters.bot.x;
  for (let seq = 1; seq <= 12; seq += 1) {
    guest.emit("input", { seq, moveX: 1, moveZ: 0, aimX: 0, aimZ: 6 });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(liveRoom.match.fighters.bot.x > guestX + 0.1, "the second human controls the rival slot instead of leaving it to the bot");
  guest.emit("input", { seq: 13, moveX: 0, moveZ: 0, aimX: 0, aimZ: 6 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const playerX = liveRoom.match.fighters.player.x;
  const botX = liveRoom.match.fighters.bot.x;
  for (let seq = 1; seq <= 12; seq += 1) {
    host.emit("input", { seq, moveX: 1, moveZ: 0, aimX: 0, aimZ: -6 });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(liveRoom.match.fighters.player.x > playerX + 0.1, "the host controls the player slot");
  assert.ok(Math.abs(liveRoom.match.fighters.bot.x - botX) < 0.8, "host movement does not control the guest slot");
  const served = await serveEvent;
  assert.ok(["player", "bot"].includes(served.who));
  assert.equal(app.rooms.get(created.code).status, "playing", "network simulation remains alive through the first serve");
  const point = await pointEvent;
  assert.ok(point.winner === "player" || point.winner === "bot");
  const secondServe = await rivalServe;
  assert.equal(secondServe.who, "bot", "the other side serves without stopping the room simulation");
  const resumeToken = joined.token;
  guest.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const resumeAttempt = clientWaitingFor(resumeToken, "session:resumed");
  const resumedGuest = resumeAttempt.socket;
  await resumeAttempt.connected;
  const resumed = await resumeAttempt.received;
  assert.equal(resumed.room.code, created.code);

  const a = await client(), b = await client(), c = await client(), d = await client();
  const four = await request(a, "room:create", { mode: "2v2", name: "Four" });
  await request(b, "room:join", { code: four.code, name: "B" });
  await request(c, "room:join", { code: four.code, name: "C" });
  const fourth = await request(d, "room:join", { code: four.code, name: "D" });
  assert.equal(fourth.room.players.length, 4);
  assert.deepEqual(fourth.room.players.map((p) => p.team).sort(), ["A", "A", "B", "B"]);
  const fourPlayerSnapshot = event(a, "snapshot", 9000);
  assert.equal((await request(a, "room:start")).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal((await fourPlayerSnapshot).players.length, 4);
  const ended = event(a, "match:end", 2000);
  assert.equal((await request(a, "room:end")).ok, true);
  assert.equal((await ended).reason, "host-ended");

  console.log("networktest: salas, host, snapshots, controle independente dos dois jogadores, predicao/reconciliacao, primeiro saque, ponto, saque do rival, reconexao 1v1 e vagas/partida 2v2 passaram");
} finally {
  for (const socket of clients) socket.disconnect();
  await app.close();
}
