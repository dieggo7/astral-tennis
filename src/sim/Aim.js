/**
 * Sistema de mira com risco (puro). A precisão depende de DOIS fatores:
 *   (a) o quão longe do timing ideal foi o golpe  -> timingFactor (0 = perfeito)
 *   (b) o quão extrema é a mira dentro da região-alvo -> risco (centro seguro, bordas arriscadas)
 * desvio (graus) = timingFactor * risco * maxDeviation, aplicado como ângulo aleatório.
 * Parry perfeito => timingFactor 0 => a bola vai exatamente onde você mirou.
 */
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** Região do alvo no rali: a metade da quadra do adversário. */
export function rallyRegion(court, hitterSign) {
  return { cx: 0, cz: -hitterSign * court.length / 4, hx: court.width / 2, hz: court.length / 4 };
}

/** Região do alvo no saque: a caixa de saque diagonal. */
export function boxRegion(box) {
  return {
    cx: (box.xMin + box.xMax) / 2, cz: (box.zMin + box.zMax) / 2,
    hx: (box.xMax - box.xMin) / 2, hz: (box.zMax - box.zMin) / 2,
  };
}

/** 0 no centro da região, 1 nas bordas (ou além). */
export function extremity(ax, az, r) {
  return clamp(Math.max(Math.abs(ax - r.cx) / r.hx, Math.abs(az - r.cz) / r.hz), 0, 1);
}

/** Curva de risco por extremidade: riskBase no centro, 1 nas linhas. */
export function riskAt(ax, az, region, A) {
  const e = extremity(ax, az, region);
  return A.riskBase + (1 - A.riskBase) * Math.pow(e, A.riskCurve);
}

/** 0 para Parry perfeito; senão cresce com o erro de timing (em s) até 1. */
export function timingFactor(errorSeconds, quality, A) {
  if (quality === 'perfect') return 0;
  return clamp(Math.abs(errorSeconds) / A.timingErrorMax, 0.2, 1);
}

export function deviationDeg(tf, risk, A, mult = 1) {
  return tf * risk * A.maxDeviation * mult;
}

/** Mantém o ponto dentro da caixa de saque (com folga das linhas). */
export function clampToBox(ax, az, box, margin = 0.4) {
  return [
    clamp(ax, box.xMin + margin, box.xMax - margin),
    clamp(az, box.zMin + margin, box.zMax - margin),
  ];
}
