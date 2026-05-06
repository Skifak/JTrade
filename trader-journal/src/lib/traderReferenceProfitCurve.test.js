import { describe, it, expect } from 'vitest';
import {
  buildCumulativeReturnPctSeries,
  pctAtOrBefore,
  monthBandsFromProfitCurve,
  profitCurveSuggestedMinWidth
} from './traderReferenceProfitCurve.js';

describe('traderReferenceProfitCurve', () => {
  it('buildCumulativeReturnPctSeries', () => {
    const prof = (t) => Number(t.profit) || 0;
    const trades = [
      { dateClose: '2024-01-10T12:00:00Z', profit: 50 },
      { dateClose: '2024-02-10T12:00:00Z', profit: -20 }
    ];
    const s = buildCumulativeReturnPctSeries(trades, 1000, prof);
    expect(s.length).toBe(3);
    expect(s[0].pct).toBe(0);
    expect(s[1].pct).toBe(5);
    expect(s[2].pct).toBe(3);
  });

  it('pctAtOrBefore', () => {
    const s = [
      { ts: 0, pct: 0 },
      { ts: 10, pct: 5 },
      { ts: 20, pct: 3 }
    ];
    expect(pctAtOrBefore(s, 5)).toBe(0);
    expect(pctAtOrBefore(s, 15)).toBe(5);
    expect(pctAtOrBefore(s, 20)).toBe(3);
  });

  it('monthBandsFromProfitCurve суммируют дельту месяцев до конца серии', () => {
    const start = new Date('2024-07-15T10:00:00Z').getTime();
    const series = [
      { ts: start - 1, pct: 0 },
      { ts: new Date('2024-07-20T10:00:00Z').getTime(), pct: 4 },
      { ts: new Date('2024-08-25T10:00:00Z').getTime(), pct: 8 }
    ];
    const bands = monthBandsFromProfitCurve(series);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    const j = bands.find((b) => /июл/i.test(b.monthTitle));
    const au = bands.find((b) => /авг/i.test(b.monthTitle));
    expect(j).toBeTruthy();
    expect(au).toBeTruthy();
    if (j && au) {
      expect(j.deltaPct + au.deltaPct).toBeCloseTo(8, 5);
    }
  });

  it('profitCurveSuggestedMinWidth растёт с длиной и временем', () => {
    const short = [
      { ts: 0, pct: 0 },
      { ts: 86400000 * 3, pct: 1 }
    ];
    const long = [];
    for (let i = 0; i <= 50; i++) {
      long.push({ ts: i * 86400000 * 2, pct: i * 0.1 });
    }
    expect(profitCurveSuggestedMinWidth(short)).toBeGreaterThanOrEqual(640);
    expect(profitCurveSuggestedMinWidth(long)).toBeGreaterThan(profitCurveSuggestedMinWidth(short));
  });
});
