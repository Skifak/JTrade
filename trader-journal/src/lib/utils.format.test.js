import { describe, it, expect } from 'vitest';
import { formatNumber, formatPrice, isBrokerImportedTrade } from './utils.js';

describe('formatNumber', () => {
  it('null / undefined → "-"', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });

  it('fixed decimals', () => {
    expect(formatNumber(1.2345, 2)).toBe('1.23');
  });
});

describe('formatPrice', () => {
  it('FX-подобная цена — больше знаков', () => {
    expect(formatPrice(1.08251)).not.toBe('-');
    expect(formatPrice(1.08251)).toContain('.');
  });

  it('невалидное → "-"', () => {
    expect(formatPrice(NaN)).toBe('-');
  });
});

describe('isBrokerImportedTrade', () => {
  it('тег mt5-history-report', () => {
    expect(isBrokerImportedTrade({ tags: ['mt5-history-report'] })).toBe(true);
    expect(isBrokerImportedTrade({ tags: ['manual'] })).toBe(false);
  });
});
