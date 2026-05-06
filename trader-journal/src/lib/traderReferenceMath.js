/**
 * Справочная математика для вкладки «Трейдеру» (может использоваться в тестах / других расчётах).
 *
 * Марковская модель: независимые исходы, win с вероятностью winRate; событие — «в серии из n сделок
 * встретилась хотя бы одна цепочка из streakLen подряд убытков» (точная P для i.i.d.).
 */

/**
 * Вероятность того, что в серии из n сделок ни разу не случилось streakLen подряд убытков.
 */
export function probNoLossStreakOfLengthOrMore(n, streakLen, winRate) {
  const p = Math.min(1, Math.max(0, Number(winRate) || 0));
  const q = 1 - p;
  const L = Math.max(1, Math.floor(Number(streakLen) || 0));
  const steps = Math.max(0, Math.floor(Number(n) || 0));

  if (steps === 0) return 1;
  if (L === 1) return Math.pow(p, steps);

  let dp = Array(L).fill(0);
  dp[0] = 1;

  for (let t = 0; t < steps; t++) {
    const sum = dp.reduce((a, b) => a + b, 0);
    const next = Array(L).fill(0);
    next[0] += p * sum;
    for (let s = 0; s < L; s++) {
      if (dp[s] === 0) continue;
      if (s + 1 < L) next[s + 1] += q * dp[s];
    }
    dp = next;
  }

  return dp.reduce((a, b) => a + b, 0);
}

/** P — хотя бы одна серия streakLen подряд убытков среди n сделок, [0..1]. */
export function probAtLeastOneLossStreakOfLengthOrMore(n, streakLen, winRate) {
  return 1 - probNoLossStreakOfLengthOrMore(n, streakLen, winRate);
}
