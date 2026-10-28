// Teste headless da simulação: um "jogador-robô" joga partidas completas contra o bot.
// Uso: node scripts/simtest.mjs [partidas]
import { gameConfig } from '../src/config/constants.js';
import { Match } from '../src/sim/Match.js';

const games = Number(process.argv[2] || 20);
const stats = { points: 0, reasons: {}, hits: { player: { normal: 0, perfect: 0 }, bot: { normal: 0, perfect: 0 } }, wins: { player: 0, bot: 0 }, maxRally: 0, apex: 0, minNet: 99 };

for (let g = 0; g < games; g += 1) {
  const cfg = JSON.parse(JSON.stringify(gameConfig));
  const m = new Match(cfg);
  m.start();
  const dt = 1 / 60;
  let rally = 0, guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 30) {
    const p = m.fighters.player, b = m.ball;
    const intent = { moveX: 0, moveZ: 0, press: false, aimX: (Math.random() * 2 - 1) * 4, aimZ: -3 - Math.random() * 7 };
    if (m.phase === 'serve' && m.state.server === 'player') intent.press = m.phaseTime > 0.5;
    if (m.rules.state === 'live' && m.rules.lastHitter === 'bot') {
      const s = b.predict(2.5).find((q) => q.bounces >= 1 && q.z > 1.5 && q.y < 2.2) || { x: b.x, z: 9 };
      const dx = s.x - p.x, dz = Math.min(s.z + 0.5, 11) - p.z;
      intent.moveX = Math.max(-1, Math.min(1, dx));
      intent.moveZ = Math.max(-1, Math.min(1, dz));
      const d = Math.hypot(b.x - p.x, b.y - 1.4, b.z - (p.z - 0.5));
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (b.z > 0 && d < 2.1 + sp * (0.12 + (Math.random() - 0.5) * 0.12)) intent.press = true;
    }
    m.update(dt, intent);
    for (const e of m.consumeEvents()) {
      if (e.type === 'hit') { stats.hits[e.who][e.quality] += 1; rally += 1; stats.apex = Math.max(stats.apex, e.y); }
      if (e.type === 'net') stats.minNet = Math.min(stats.minNet, e.y);
      if (e.type === 'point') { stats.points += 1; stats.reasons[`${e.winner}: ${e.reason}`] = (stats.reasons[`${e.winner}: ${e.reason}`] || 0) + 1; stats.maxRally = Math.max(stats.maxRally, rally); rally = 0; }
      if (e.type === 'matchOver') stats.wins[e.winner] += 1;
    }
  }
  if (m.phase !== 'over') { console.error('PARTIDA TRAVOU', m.state.score, m.phase, m.rules.state); process.exit(1); }
}
console.log(JSON.stringify(stats, null, 2));

// Trajetórias: apex máximo e folga sobre a barreira para vários tempos de voo.
const cfg = gameConfig;
const m = new Match(JSON.parse(JSON.stringify(cfg)));
m.start();
for (const sp of [13, 20, 30]) {
  for (const z0 of [10, 6, 2]) {
    const f = m.fighters.player;
    m.ball.x = 0; m.ball.y = 1.4; m.ball.z = z0; m.ball.speed = sp / 1.04;
    cfg.parry.scatterNormal = 0;
    const mm = new Match(JSON.parse(JSON.stringify(cfg)));
    mm.ball.x = 0; mm.ball.y = 1.4; mm.ball.z = z0; mm.ball.speed = sp / 1.04;
    mm.shoot(mm.fighters.player, 0, -8, 'normal', false);
    let apex = 0, netY = null, bounceZ = null;
    for (let i = 0; i < 600 && bounceZ === null; i += 1) {
      const r = mm.ball.step(1 / 120);
      apex = Math.max(apex, mm.ball.y);
      if (r.net) netY = r.netY;
      if (r.bounce) bounceZ = r.bz;
    }
    console.log(`vel ${sp} z0 ${z0}: apex ${apex.toFixed(2)} alturaNaRede ${netY?.toFixed(2)} quique em z=${bounceZ?.toFixed(2)} (alvo -8)`);
  }
}
