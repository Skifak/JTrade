import { describe, it, expect } from 'vitest';
import { computeAnalyticsStances } from './tradingMentor.js';

/** Базовый «спокойный» контекст — все шкалы в ok. */
function baseCtx(patch = {}) {
  return {
    dailyStopHit: false,
    cooldownActive: false,
    profileLossStreakHit: false,
    streak: { kind: 'none', length: 0, sum: 0 },
    todayPnL: 0,
    overtradeRisk: false,
    discipline: { total: 0, score: 100 },
    nClosed: 0,
    journal7: 7,
    journal14: 14,
    openRisk: { withoutSlCount: 0, totalRisk: 0 },
    open: [],
    riskShareSl: 0,
    maxOpenProfile: 5,
    ddPct: 0,
    closed7: 0,
    maxPerDay: 10,
    weekPnL: 0,
    monthPnL: 0,
    capital: 10000,
    weekLossShare: 0,
    monthLossShare: 0,
    ...patch
  };
}

function lvl(id, stances) {
  return stances.find((s) => s.id === id)?.level;
}

describe('computeAnalyticsStances', () => {
  it('при спокойном контексте все уровни ok', () => {
    const s = computeAnalyticsStances(baseCtx());
    expect(s.map((x) => x.level).every((l) => l === 'ok')).toBe(true);
  });

  it('tilt → danger при стопе дня', () => {
    expect(lvl('impulse_tilt', computeAnalyticsStances(baseCtx({ dailyStopHit: true })))).toBe('danger');
  });

  it('tilt → danger при активном cooldown', () => {
    expect(lvl('impulse_tilt', computeAnalyticsStances(baseCtx({ cooldownActive: true })))).toBe('danger');
  });

  it('tilt учитывает серию минусов и красный день', () => {
    expect(
      lvl(
        'impulse_tilt',
        computeAnalyticsStances(
          baseCtx({
            streak: { kind: 'loss', length: 2, sum: -1 },
            todayPnL: -50,
            dailyStopHit: false
          })
        )
      )
    ).toBe('danger');
  });

  it('gambling → danger при переторговке и низкой дисциплине', () => {
    expect(
      lvl(
        'gambling_process',
        computeAnalyticsStances(
          baseCtx({
            overtradeRisk: true,
            discipline: { total: 12, score: 55 },
            closed7: 60,
            maxPerDay: 10
          })
        )
      )
    ).toBe('danger');
  });

  it('journal_slack → danger при выборке и пустом журнале', () => {
    expect(
      lvl(
        'journal_slack',
        computeAnalyticsStances(
          baseCtx({
            nClosed: 14,
            journal7: 0,
            journal14: 1
          })
        )
      )
    ).toBe('danger');
  });

  it('risk_load → danger если есть позиции без SL', () => {
    expect(
      lvl(
        'risk_load',
        computeAnalyticsStances(
          baseCtx({
            open: [{ id: '1' }],
            openRisk: { withoutSlCount: 1, totalRisk: 100 }
          })
        )
      )
    ).toBe('danger');
  });

  it('equity_stress → danger при глубокой просадке', () => {
    expect(lvl('equity_stress', computeAnalyticsStances(baseCtx({ ddPct: 20 })))).toBe('danger');
  });

  it('overload → danger при многих сделках и пустом журнале за 7 дн.', () => {
    expect(
      lvl(
        'overload',
        computeAnalyticsStances(
          baseCtx({
            closed7: 12,
            journal7: 1,
            nClosed: 16
          })
        )
      )
    ).toBe('danger');
  });
});
