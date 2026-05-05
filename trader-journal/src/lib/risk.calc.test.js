import { describe, it, expect } from 'vitest';
import {
  calculateTradeRisk,
  computeMaxRiskAmount,
  computeMaxDailyLossAmount,
  computeMaxWeeklyLossAmount,
  computeGoalAmount,
  suggestVolumeForRisk,
  parseNotesChecklist,
  getDisciplineScore,
  getStatsByBiasAlignment,
  getOpenRisk,
  evaluateTradeRules,
  getCurrentRiskScale,
  hasMaterialRuleViolations,
  getEquityCurve,
  POST_CLOSE_CHART_VIOLATION_CODE
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

describe('getCurrentRiskScale — сетка anti-martingale', () => {
  const loss = (i) => ({
    status: 'closed',
    profit: -10,
    dateClose: `2026-05-${String(i + 1).padStart(2, '0')} 10:00:00`
  });

  it('выкл → 1', () => {
    expect(
      getCurrentRiskScale([loss(0), loss(1)], {
        streakScalingEnabled: false,
        streakScalingMultipliers: [0.5]
      })
    ).toBe(1);
  });

  it('дефолтная сетка: 2 уб. → ×0.5, 3 → ×0.25, 4+ → ×0.125', () => {
    const prof = {
      streakScalingEnabled: true,
      streakScalingApplyFromLossCount: 2,
      streakScalingMultipliers: [0.5, 0.25, 0.125]
    };
    expect(getCurrentRiskScale([loss(0), loss(1)], prof)).toBeCloseTo(0.5, 5);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2)], prof)).toBeCloseTo(0.25, 5);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2), loss(3)], prof)).toBeCloseTo(0.125, 5);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2), loss(3), loss(4)], prof)).toBeCloseTo(0.125, 5);
  });

  it('кастом: с 3 убытков и сеткой [0.7, 0.4]', () => {
    const prof = {
      streakScalingEnabled: true,
      streakScalingApplyFromLossCount: 3,
      streakScalingMultipliers: [0.7, 0.4]
    };
    expect(getCurrentRiskScale([loss(0), loss(1)], prof)).toBe(1);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2)], prof)).toBeCloseTo(0.7, 5);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2), loss(3)], prof)).toBeCloseTo(0.4, 5);
    expect(getCurrentRiskScale([loss(0), loss(1), loss(2), loss(3), loss(4)], prof)).toBeCloseTo(0.4, 5);
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

  it('взвешивает warn без severity как WARN', () => {
    const trades = [
      { status: 'closed', profit: 1 },
      { status: 'closed', profit: -1, ruleViolations: [{ code: 'x' }] }
    ];
    const d = getDisciplineScore(trades);
    expect(d.total).toBe(2);
    expect(d.clean).toBe(1);
    expect(d.warnViolationItems).toBe(1);
    expect(d.blockViolationItems).toBe(0);
    expect(d.score).toBeCloseTo((100 + (100 - 12)) / 2, 5);
  });

  it('block сильнее warn за запись', () => {
    const a = getDisciplineScore([
      { status: 'closed', profit: 1, ruleViolations: [{ severity: 'warn', code: 'w' }] }
    ]).score;
    const b = getDisciplineScore([
      { status: 'closed', profit: 1, ruleViolations: [{ severity: 'block', code: 'b' }] }
    ]).score;
    expect(b).toBeLessThan(a);
  });
});

describe('hasMaterialRuleViolations + equity disciplined', () => {
  const t1 = {
    status: 'closed',
    profit: 100,
    dateClose: '2026-05-01 10:00:00',
    ruleViolations: [{ severity: 'warn', code: POST_CLOSE_CHART_VIOLATION_CODE }]
  };
  const t2 = {
    status: 'closed',
    profit: 50,
    dateClose: '2026-05-02 10:00:00',
    ruleViolations: [{ severity: 'block', code: 'risk-cap' }]
  };

  it('только post-close → не материальное', () => {
    expect(hasMaterialRuleViolations(t1)).toBe(false);
  });

  it('post-close + block → материальное', () => {
    expect(
      hasMaterialRuleViolations({
        ruleViolations: [
          { code: POST_CLOSE_CHART_VIOLATION_CODE },
          { severity: 'block', code: 'x' }
        ]
      })
    ).toBe(true);
  });

  it('пунктир equity считает PnL при одном мягком нарушении', () => {
    const curve = getEquityCurve([t1], 1000);
    const last = curve[curve.length - 1];
    expect(last.real).toBe(1100);
    expect(last.disciplined).toBe(1100);
  });

  it('пунктир отстает при материальном нарушении', () => {
    const curve = getEquityCurve([t2], 1000);
    const last = curve[curve.length - 1];
    expect(last.real).toBe(1050);
    expect(last.disciplined).toBe(1000);
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

describe('evaluateTradeRules — exposure-cap', () => {
  const prof = {
    initialCapital: 10_000,
    riskMode: 'percent',
    riskPerTradePercent: 1,
    dailyLossLimitMode: 'percent',
    dailyLossLimitPercent: 10,
    maxOpenTrades: 3,
    maxTradesPerDay: 0,
    maxConsecutiveLosses: 0,
    streakScalingEnabled: false
  };

  it('блокирует, если Σ риска открытых + новая сделка > лимит × число позиций', () => {
    const openTrades = [
      { id: 'a', pair: 'EURUSD', volume: 0.015, priceOpen: 1.1, sl: 1.0, direction: 'long' }
    ];
    const newTrade = {
      pair: 'GBPUSD',
      direction: 'long',
      volume: 0.016,
      priceOpen: 1.25,
      sl: 1.15
    };
    const v = evaluateTradeRules(newTrade, prof, { openTrades, closedTrades: [] });
    const cap = v.find((x) => x.code === 'exposure-cap');
    expect(cap).toBeDefined();
    expect(cap?.severity).toBe('block');
  });

  it('пускает на границе бюджета экспозиции', () => {
    const openTrades = [
      { id: 'a', pair: 'EURUSD', volume: 0.01, priceOpen: 1.1, sl: 1.09, direction: 'long' }
    ];
    const newTrade = {
      pair: 'GBPUSD',
      direction: 'long',
      volume: 0.01,
      priceOpen: 1.25,
      sl: 1.24
    };
    const v = evaluateTradeRules(newTrade, prof, { openTrades, closedTrades: [] });
    expect(v.some((x) => x.code === 'exposure-cap')).toBe(false);
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

describe('computeMaxWeeklyLossAmount + флаг weeklyLossLimitEnabled', () => {
  it('выключен явно → 0 даже при ненулевых полях', () => {
    expect(
      computeMaxWeeklyLossAmount({
        weeklyLossLimitEnabled: false,
        weeklyLossLimitMode: 'percent',
        weeklyLossLimitPercent: 5,
        initialCapital: 10_000
      })
    ).toBe(0);
  });

  it('включён → считается как раньше', () => {
    expect(
      computeMaxWeeklyLossAmount({
        weeklyLossLimitEnabled: true,
        weeklyLossLimitMode: 'percent',
        weeklyLossLimitPercent: 2,
        initialCapital: 10_000
      })
    ).toBe(200);
  });
});

describe('computeGoalAmount', () => {
  it('% цели дня', () => {
    expect(computeGoalAmount(profilePct, 'Day')).toBeCloseTo(200, 5);
  });
});
