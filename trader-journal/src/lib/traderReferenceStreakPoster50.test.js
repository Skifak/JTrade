import { describe, it, expect } from 'vitest';
import {
  LOSS_STREAK_POSTER_50_ROWS,
  LOSS_STREAK_POSTER_50_WIN_RATES_PCT,
  LOSS_STREAK_POSTER_50_STREAK_KEYS
} from './traderReferenceStreakPoster50.js';

describe('traderReferenceStreakPoster50', () => {
  it('размеры и опорные ячейки как на постере', () => {
    expect(LOSS_STREAK_POSTER_50_WIN_RATES_PCT.length).toBe(LOSS_STREAK_POSTER_50_ROWS.length);
    expect(LOSS_STREAK_POSTER_50_STREAK_KEYS.length).toBe(10);
    for (const row of LOSS_STREAK_POSTER_50_ROWS) {
      expect(row.length).toBe(10);
    }

    const row50 = LOSS_STREAK_POSTER_50_ROWS[9];
    expect(row50[0]).toBe(100.0);
    expect(row50[4]).toBe(50.8);
    expect(row50[9]).toBe(1.9);

    const row70 = LOSS_STREAK_POSTER_50_ROWS[13];
    expect(row70[0]).toBe(99.0);
    expect(row70[2]).toBe(31.8);

    const row95 = LOSS_STREAK_POSTER_50_ROWS[18];
    expect(row95[0]).toBe(11.5);
    expect(row95[1]).toBe(0.6);
  });
});
