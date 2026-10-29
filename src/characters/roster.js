/**
 * Elenco jogável. Cada mago pode ter um modelo GLTF/GLB em /public/models/.
 * Se o arquivo não existir, o jogo usa o mago procedural (placeholder) com o mesmo
 * contrato de animação: idle, run, swing, win, lose.
 *
 * clips: nomes (ou trechos de nome, sem diferenciar maiúsculas) das animações do GLB.
 */
export const ROSTER = {
  ignis: {
    id: 'ignis',
    name: 'Ignis',
    element: 'Fogo',
    color: '#d8341c',
    accent: '#ffb347',
    model: '/models/ignis.glb',
    scale: 1,
    yawOffset: 0,            // gire (em rad) se o GLB não olhar para +Z
    clips: { idle: 'idle', run: 'run', swing: 'swing', win: 'win', lose: 'lose' },
  },
  glacia: {
    id: 'glacia',
    name: 'Glacia',
    element: 'Gelo',
    color: '#2f7fd8',
    accent: '#9be8ff',
    model: '/models/glacia.glb',
    scale: 1,
    yawOffset: 0,
    clips: { idle: 'idle', run: 'run', swing: 'swing', win: 'win', lose: 'lose' },
  },
};

// No MVP: o jogador é o Ignis e o rival usa o visual da Glacia (sem habilidades).
export const MVP_MATCHUP = { player: 'ignis', bot: 'glacia' };
