import { describe, it, expect, vi } from 'vitest';

vi.mock('./attachmentApi.js', () => ({
  isTauriApp: () => false
}));

import { supportsFormMarketFill } from './marketData.js';

describe('supportsFormMarketFill', () => {
  it('FX и крипта', () => {
    expect(supportsFormMarketFill('EURUSD')).toBe(true);
    expect(supportsFormMarketFill('BTCUSD')).toBe(true);
    expect(supportsFormMarketFill('ETHUSDT')).toBe(true);
  });

  it('металлы / индексы / сырьё — false', () => {
    expect(supportsFormMarketFill('XAUUSD')).toBe(false);
    expect(supportsFormMarketFill('US500')).toBe(false);
    expect(supportsFormMarketFill('USOIL')).toBe(false);
  });

  it('пустая пара', () => {
    expect(supportsFormMarketFill('')).toBe(false);
  });
});
