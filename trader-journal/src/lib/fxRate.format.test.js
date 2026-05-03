import { describe, it, expect } from 'vitest';
import { convertUsd, currencySymbol, decimalsFor, formatMoney, formatAccountMoney } from './fxRate.js';

describe('convertUsd', () => {
  it('identity при rate 1', () => {
    expect(convertUsd(100, { rate: 1 })).toBe(100);
  });

  it('перевод по rate', () => {
    expect(convertUsd(50, { rate: 0.92 })).toBeCloseTo(46, 5);
  });

  it('NaN → 0', () => {
    expect(convertUsd(NaN, { rate: 1 })).toBe(0);
  });
});

describe('currencySymbol / decimalsFor', () => {
  it('EUR и JPY', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(decimalsFor('JPY')).toBe(0);
  });

  it('неизвестный код возвращается как есть', () => {
    expect(currencySymbol('XXX')).toBe('XXX');
  });
});

describe('formatMoney', () => {
  it('конвертирует USD в целевую валюту', () => {
    const s = formatMoney(100, { rate: 1.1, target: 'EUR' });
    expect(s).toContain('110');
    expect(s).toContain('€');
  });
});

describe('formatAccountMoney', () => {
  it('без конвертации суммы', () => {
    const s = formatAccountMoney(42.5, { target: 'USD' });
    expect(s).toMatch(/42\.50/);
  });
});
