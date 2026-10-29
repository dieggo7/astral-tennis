import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server/index.js";

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
  assert.equal((await request(host, "room:start")).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 3200));
  const firstSnapshot = await snapshot;
  assert.ok(firstSnapshot.orb && firstSnapshot.players.length === 2);
  assert.equal(app.rooms.get(created.code).status, "playing");
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

  console.log("networktest: salas, host, nomes unicos, snapshot, reconexao 1v1 e vagas/partida 2v2 passaram");
} finally {
  for (const socket of clients) socket.disconnect();
  await app.close();
}
