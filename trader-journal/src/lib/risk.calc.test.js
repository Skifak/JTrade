import { describe, it, expect } from 'vitest';
import {
  calculateTradeRisk,
  computeMaxRiskAmount,
  computeMaxDailyLossAmount,
  computeGoalAmount,
  suggestVolumeForRisk,
  parseNotesChecklist,
  getDisciplineScore,
  getStatsByBiasAlignment,
  getOpenRisk
} from './risk.js';

const profilePct = {
  initialCapital: 10_000,
  riskPerTradePercent: 1,
  riskMode: 'percent',
  dailyLossLimitPercent: 5,
  dailyLossLimitMode: 'percent',
  goalDayValue: 2,
  goalMode: 'percent',
  streakScalingEnabled: false
};

describe('computeMaxRiskAmount', () => {
  it('% от капитала', () => {
    expect(computeMaxRiskAmount(profilePct)).toBe(100);
  });

  it('фиксированная сумма', () => {
    expect(
      computeMaxRiskAmount({
        riskMode: 'amount',
        riskPerTradeAmount: 75,
        initialCapital: 10_000
      })
    ).toBe(75);
  });
});

describe('calculateTradeRisk', () => {
  it('EURUSD long SL ниже входа', () => {
    const r = calculateTradeRisk(
      {
        pair: 'EURUSD',
        direction: 'long',
        volume: 0.01,
        priceOpen: 1.1,
        sl: 1.09,
        tp: 1.12
      },
      profilePct
    );
    expect(r.hasSl).toBe(true);
    expect(r.units).toBeCloseTo(1000, 5);
    expect(r.riskAmount).toBeCloseTo(10, 5);
    expect(r.rewardAmount).toBeCloseTo(20, 5);
    expect(r.rrRatio).toBeCloseTo(2, 5);
    expect(r.riskPercentOfCapital).toBeCloseTo(0.1, 5);
  });

  it('без SL', () => {
    const r = calculateTradeRisk({ pair: 'EURUSD', volume: 0.01, priceOpen: 1.1 }, profilePct);
    expect(r.hasSl).toBe(false);
    expect(r.riskAmount).toBeNull();
  });
});

describe('suggestVolumeForRisk', () => {
  it('подбирает объём под лимит риска', () => {
    const trade = {
      pair: 'EURUSD',
      priceOpen: 1.1,
      sl: 1.09,
      volume: 0.5
    };
    const vol = suggestVolumeForRisk(trade, profilePct, { closedTrades: [] });
    expect(vol).not.toBeNull();
    expect(vol).toBeGreaterThanOrEqual(0.01);
  });
});

describe('parseNotesChecklist', () => {
  it('пропускает # и пустые строки', () => {
    expect(parseNotesChecklist('#ignored\n\n  x  \ny')).toEqual(['x', 'y']);
  });
});

describe('getDisciplineScore', () => {
  it('без сделок → 100%', () => {
    expect(getDisciplineScore([]).score).toBe(100);
  });

  it('учитывает ruleViolations', () => {
    const trades = [
      { status: 'closed', profit: 1 },
      { status: 'closed', profit: -1, ruleViolations: [{ code: 'x' }] }
    ];
    const d = getDisciplineScore(trades);
    expect(d.total).toBe(2);
    expect(d.clean).toBe(1);
    expect(d.score).toBe(50);
  });
});

describe('getStatsByBiasAlignment', () => {
  it('раскладывает по корзинам', () => {
    const trades = [{ profit: 10 }, { profit: -5 }, { profit: 3 }];
    const fn = (t) => (t.profit > 5 ? true : t.profit < 0 ? false : null);
    const b = getStatsByBiasAlignment(trades, fn);
    expect(b.aligned.count).toBe(1);
    expect(b.against.count).toBe(1);
    expect(b.unknown.count).toBe(1);
  });
});

describe('getOpenRisk', () => {
  it('суммирует риск по SL', () => {
    const openTrades = [
      { pair: 'EURUSD', volume: 0.01, priceOpen: 1.1, sl: 1.09 },
      { pair: 'EURUSD', volume: 0.01, priceOpen: 1.1 }
    ];
    const x = getOpenRisk(openTrades, profilePct);
    expect(x.withSlCount).toBe(1);
    expect(x.withoutSlCount).toBe(1);
    expect(x.totalRisk).toBeCloseTo(10, 4);
  });
});

describe('computeGoalAmount', () => {
  it('% цели дня', () => {
    expect(computeGoalAmount(profilePct, 'Day')).toBeCloseTo(200, 5);
  });
});
