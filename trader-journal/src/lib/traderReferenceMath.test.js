import { describe, it, expect } from 'vitest';
import { probAtLeastOneLossStreakOfLengthOrMore, probNoLossStreakOfLengthOrMore } from './traderReferenceMath.js';

describe('traderReferenceMath — loss streak Markov', () => {
  it('L=1 equals 1 - win^n', () => {
    const p = 0.5;
    const n = 10;
    expect(probAtLeastOneLossStreakOfLengthOrMore(n, 1, p)).toBeCloseTo(1 - Math.pow(p, n), 8);
  });

  it('never hit L in 0 trials', () => {
    expect(probNoLossStreakOfLengthOrMore(0, 5, 0.5)).toBe(1);
    expect(probAtLeastOneLossStreakOfLengthOrMore(0, 5, 0.5)).toBe(0);
  });

  it('snapshot n=90, p=0.5 Markov', () => {
    const n = 90;
    expect(100 * probAtLeastOneLossStreakOfLengthOrMore(n, 6, 0.5)).toBeGreaterThan(50);
    expect(100 * probAtLeastOneLossStreakOfLengthOrMore(n, 6, 0.5)).toBeLessThan(52);
    expect(100 * probAtLeastOneLossStreakOfLengthOrMore(n, 11, 0.5)).toBeGreaterThan(1.5);
    expect(100 * probAtLeastOneLossStreakOfLengthOrMore(n, 11, 0.5)).toBeLessThan(2.2);
  });

  it('край винрейта', () => {
    const n = 50;
    expect(100 * probAtLeastOneLossStreakOfLengthOrMore(n, 2, 0.05)).toBeCloseTo(100, 5);
    const x95 = 100 * probAtLeastOneLossStreakOfLengthOrMore(n, 2, 0.95);
    expect(x95).toBeGreaterThan(10.5);
    expect(x95).toBeLessThan(12);
  });
});
