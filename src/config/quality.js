// Presets de qualidade gráfica. O jogo começa em "high" e desce sozinho
// (Game.autoQuality) se o FPS ficar baixo. Também dá para forçar com ?quality=low|medium|high
// ou alternar com a tecla G.
export const QUALITY_TIERS = ["low", "medium", "high"];

export const QUALITY = {
  low: {
    pixelRatioCap: 1, // limite do devicePixelRatio
    renderScale: 0.75, // 0.75 = renderiza em 75% da resolução e estica na tela
    shadowMapSize: 0, // 0 = sem sombras projetadas (a sombra do orbe no chão continua)
    bloom: false,
    msaa: 0, // amostras de antialiasing do composer
    galaxy: 0, // 0 = céu simples, 1 = médio, 2 = completo
  },
  medium: {
    pixelRatioCap: 1.25,
    renderScale: 1,
    shadowMapSize: 1024,
    bloom: true,
    msaa: 0,
    galaxy: 1,
  },
  high: {
    pixelRatioCap: 2,
    renderScale: 1,
    shadowMapSize: 2048,
    bloom: true,
    msaa: 4,
    galaxy: 2,
  },
};

export const resolvePixelRatio = (q, dpr = 1) => Math.min(dpr, q.pixelRatioCap) * q.renderScale;

// Auto-ajuste: janela de medição em segundos e FPS mínimo aceitável.
export const AUTO_QUALITY = { windowSeconds: 2, minFps: 45, warmupWindows: 1 };
