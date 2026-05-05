/** Дефолтная сетка = прежняя логика ×½ на шаг до плато 0.125. */
export const DEFAULT_STREAK_SCALING_MULTIPLIERS = Object.freeze([0.5, 0.25, 0.125]);

/**
 * Сетка множителей anti-martingale: только (0, 1], минимум один шаг.
 */
export function normalizeStreakScalingMultipliers(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_STREAK_SCALING_MULTIPLIERS];
  const out = [];
  for (const x of raw) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0 && n <= 1) {
      const r = Math.round(n * 10_000) / 10_000;
      if (r > 0) out.push(r);
    }
  }
  return out.length ? out : [...DEFAULT_STREAK_SCALING_MULTIPLIERS];
}
