import { describe, it, expect } from 'vitest';
import {
  tradeFormDraftFingerprint,
  meaningfulDraftAdd,
  meaningfulDraftEdit,
  validateDraftForApply,
  buildDraftPayload
} from './tradeFormDraft.js';

describe('tradeFormDraftFingerprint', () => {
  it('стабильный порядок полей', () => {
    const a = tradeFormDraftFingerprint({ pair: 'EURUSD', volume: 0.01 });
    const b = tradeFormDraftFingerprint({ pair: 'EURUSD', volume: 0.01 });
    expect(a).toBe(b);
  });

  it('разные пары → разный отпечаток', () => {
    expect(tradeFormDraftFingerprint({ pair: 'EURUSD' })).not.toBe(
      tradeFormDraftFingerprint({ pair: 'GBPUSD' })
    );
  });
});

describe('meaningfulDraftAdd', () => {
  it('дефолт EURUSD без полей → false', () => {
    expect(
      meaningfulDraftAdd({
        pair: 'EURUSD',
        volume: 0.01,
        priceOpen: 0,
        comment: '',
        tags: []
      })
    ).toBe(false);
  });

  it('комментарий → true', () => {
    expect(meaningfulDraftAdd({ pair: 'EURUSD', volume: 0.01, comment: 'x' })).toBe(true);
  });

  it('цена открытия → true', () => {
    expect(meaningfulDraftAdd({ pair: 'EURUSD', volume: 0.01, priceOpen: 1.08 })).toBe(true);
  });
});

describe('meaningfulDraftEdit', () => {
  it('совпадает с baseline → false', () => {
    const t = {
      pair: 'EURUSD',
      direction: 'long',
      volume: 0.01,
      priceOpen: 1,
      sl: null,
      tp: null,
      comment: '',
      tags: [],
      strategyId: null,
      playId: null,
      contractSize: null,
      dateOpen: '',
      killzone: null,
      commission: '',
      swap: ''
    };
    expect(meaningfulDraftEdit({ ...t }, t)).toBe(false);
  });

  it('изменён volume → true', () => {
    const base = {
      pair: 'EURUSD',
      direction: 'long',
      volume: 0.01,
      priceOpen: 1,
      sl: null,
      tp: null,
      comment: '',
      tags: [],
      strategyId: null,
      playId: null,
      contractSize: null,
      dateOpen: '',
      killzone: null,
      commission: '',
      swap: ''
    };
    expect(meaningfulDraftEdit({ ...base, volume: 0.02 }, base)).toBe(true);
  });
});

describe('validateDraftForApply', () => {
  it('принимает v=1 и совпадающий mode', () => {
    const raw = {
      v: 1,
      mode: 'add',
      tradeId: null,
      formData: { pair: 'EURUSD' }
    };
    expect(validateDraftForApply(raw, 'add', null)).toBe(true);
  });

  it('edit: другой tradeId → false', () => {
    const raw = { v: 1, mode: 'edit', tradeId: 'a', formData: {} };
    expect(validateDraftForApply(raw, 'edit', { id: 'b' })).toBe(false);
  });
});

describe('buildDraftPayload', () => {
  it('кладёт версию и mode', () => {
    const p = buildDraftPayload({
      formData: { pair: 'USDJPY' },
      useCurrentTime: true,
      useMarketPrice: false,
      acknowledgedChecklist: [],
      acknowledgedPlayRules: [],
      mode: 'add',
      tradeId: null
    });
    expect(p.v).toBe(1);
    expect(p.mode).toBe('add');
    expect(p.formData.pair).toBe('USDJPY');
  });
});
