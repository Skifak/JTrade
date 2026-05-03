import { describe, it, expect } from 'vitest';
import { mapKeyToKrakenPair } from './krakenWs';

describe('mapKeyToKrakenPair', () => {
  it('мажорные FX из whitelist', () => {
    expect(mapKeyToKrakenPair('EURUSD')).toBe('EUR/USD');
    expect(mapKeyToKrakenPair('GBPUSD')).toBe('GBP/USD');
    expect(mapKeyToKrakenPair('USDJPY')).toBe('USD/JPY');
  });

  it('кросс вне whitelist Kraken → null', () => {
    expect(mapKeyToKrakenPair('GBPJPY')).toBeNull();
    expect(mapKeyToKrakenPair('NZDUSD')).toBeNull();
  });

  it('золото → XAUT/USD', () => {
    expect(mapKeyToKrakenPair('XAUUSD')).toBe('XAUT/USD');
  });

  it('индексы / сырьё не 6 букв → null', () => {
    expect(mapKeyToKrakenPair('US500')).toBeNull();
    expect(mapKeyToKrakenPair('USOIL')).toBeNull();
  });
});
