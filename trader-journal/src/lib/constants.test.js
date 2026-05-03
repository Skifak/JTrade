import { describe, it, expect } from 'vitest';
import { normalizeSymbolKey } from './constants';

describe('normalizeSymbolKey', () => {
  it('uppercase и trim', () => {
    expect(normalizeSymbolKey(' eurusd ')).toBe('EURUSD');
  });

  it('суффиксы брокера .a и #mini', () => {
    expect(normalizeSymbolKey('EURUSD.a')).toBe('EURUSD');
    expect(normalizeSymbolKey('XAUUSD#micro')).toBe('XAUUSD');
  });

  it('пустое → ""', () => {
    expect(normalizeSymbolKey('')).toBe('');
    expect(normalizeSymbolKey(null)).toBe('');
  });
});
