import { describe, it, expect } from 'vitest';
import {
  getContractSize,
  calculateProfit,
  calculateFloatingProfit,
  snapshotTradeTemplateFields,
  normalizeStoredTradeTemplate
} from './utils';

describe('getContractSize', () => {
  it('FX major из справочника', () => {
    expect(getContractSize('EURUSD')).toBe(100_000);
  });

  it('крипта — 1 ед. на лот', () => {
    expect(getContractSize('BTCUSD')).toBe(1);
  });

  it('US500 из DEFAULT_CONTRACT_SIZE_BY_SYMBOL', () => {
    expect(getContractSize('US500')).toBe(1);
  });
});

describe('calculateProfit', () => {
  it('EURUSD long: прибыль в USD', () => {
    const t = {
      status: 'closed',
      pair: 'EURUSD',
      direction: 'long',
      volume: 1,
      priceOpen: 1.085,
      priceClose: 1.086,
      commission: 2,
      swap: 0,
      contractSize: 100_000
    };
    const pnl = calculateProfit(t);
    expect(pnl).toBeCloseTo(98, 5);
  });

  it('нет закрытия → null', () => {
    expect(
      calculateProfit({ status: 'open', pair: 'EURUSD', priceOpen: 1, priceClose: null })
    ).toBeNull();
  });
});

describe('calculateFloatingProfit', () => {
  it('без live — profit из сделки', () => {
    const t = { status: 'open', pair: 'EURUSD', profit: 12.5, priceOpen: 1, volume: 0.01 };
    expect(calculateFloatingProfit(t, null)).toBe(12.5);
  });
});

describe('шаблоны сделок', () => {
  it('snapshotTradeTemplateFields', () => {
    const s = snapshotTradeTemplateFields({
      pair: 'GBPUSD',
      direction: 'short',
      volume: 0.02,
      comment: 'x',
      tags: ['a'],
      strategyId: null,
      playId: null,
      contractSize: null
    });
    expect(s.pair).toBe('GBPUSD');
    expect(s.direction).toBe('short');
    expect(s.volume).toBe(0.02);
    expect(s.tags).toEqual(['a']);
  });

  it('normalizeStoredTradeTemplate заполняет id', () => {
    const n = normalizeStoredTradeTemplate({
      id: 't1',
      name: '  A  ',
      pair: 'EURUSD',
      direction: 'long',
      volume: 0.01
    });
    expect(n?.id).toBe('t1');
    expect(n?.name).toBe('A');
  });
});
