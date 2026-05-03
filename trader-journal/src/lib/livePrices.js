/**
 * Стор живых цен по WebSocket (основной поток).
 *
 *   Крипта                          → Binance Spot WS  (bookTicker)
 *   FX (мажоры) / XAU→XAUT  → Kraken Spot WS (`ticker`); иначе — HTTP Frankfurter/Stooq.
 *
 * Использование:
 *   livePrices.setPairs(['EURUSD', 'BTCUSD']);   // подключает соответствующие WS
 *   livePrices.start();                          // активировать pинг-таймер
 *   livePrices.stop();
 *
 * Стор: { [normalizedKey]: { price, source, provider, timestamp, error?, loading? } }
 */
import { writable } from 'svelte/store';
import { normalizeSymbolKey } from './constants';
import { BinanceWs } from './binanceWs';
import { KrakenWs } from './krakenWs';
import { fetchMarketPrice } from './marketData.js';

/* ------------- классификация (как в marketData.js) -------------- */

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'DOGE', 'ADA', 'DOT', 'LINK',
  'AVAX', 'BNB', 'MATIC', 'TRX', 'SHIB', 'TON', 'UNI', 'ATOM', 'NEAR',
  'APT', 'SUI', 'ARB', 'OP', 'INJ', 'FIL', 'RUNE', 'AAVE', 'XLM', 'BCH',
  'ETC'
]);

function isCryptoKey(key) {
  if (!key) return false;
  if (key.endsWith('USDT') || key.endsWith('USDC')) {
    return CRYPTO_BASES.has(key.slice(0, -4));
  }
  if (key.endsWith('USD')) {
    return CRYPTO_BASES.has(key.slice(0, -3));
  }
  return false;
}

function toBinanceSymbol(key) {
  if (key.endsWith('USDT') || key.endsWith('USDC')) return key;
  if (key.endsWith('USD')) return key.slice(0, -3) + 'USDT';
  return key + 'USDT';
}

/* -------------------------- pingInfo --------------------------- */

/**
 * Состояние коннекта по провайдеру.
 *  - latencyMs: возраст последнего тика на момент его прихода (для Binance ~ network latency).
 *  - lastTickAt: когда был последний тик (для расчёта "возраст" в UI).
 *  - connected: открыт ли WS.
 *  - error: последняя ошибка коннекта.
 */
export const pingInfo = writable({
  binance: { latencyMs: null, lastTickAt: null, lastChangeAt: null, connected: false, error: null },
  kraken:  { latencyMs: null, lastTickAt: null, lastChangeAt: null, connected: false, error: null }
});

/** Часы — обновляется раз в 1 сек, чтобы UI пересчитывал «возраст» без дрожания
 *  (1с, 2с, 3с…). */
export const tickClock = writable(Date.now());

/**
 * Доп. пары, на которые временно подписываемся (нужно TradeForm для «📡 По
 * рынку»: пользователь может открыть форму на пару, по которой нет открытых
 * сделок). App.svelte мерджит этот стор с openPairs при вызове setPairs().
 *
 *   formPairs.set([formData.pair])  // подписаться
 *   formPairs.set([])               // отписаться
 */
export const formPairs = writable(/** @type {string[]} */ ([]));
const TICK_CLOCK_INTERVAL_MS = 1000;
// Возраст последнего ТИКА (любое сообщение от провайдера) — для статуса коннекта.
// Дёргаем UI не чаще раза в 5 сек, чтобы не плясал.
const PING_TICK_THROTTLE_MS = 5000;
// Возраст последнего ИЗМЕНЕНИЯ цены — обновляется только когда price действительно
// поменялась. Throttle небольшой (1с), потому что событий не много.
const PING_CHANGE_THROTTLE_MS = 1000;

/** Нет тика Kraken за это время → HTTP (Frankfurter/Stooq). */
const FX_HTTP_FALLBACK_DELAY_MS = 6500;
/** Пока WS молчит — периодический HTTP. */
const FX_HTTP_POLL_INTERVAL_MS = 22000;

/* ------------------------- основной стор ------------------------ */

function createLivePrices() {
  const { subscribe, update } = writable(/** @type {Record<string, any>} */ ({}));

  /** @type {BinanceWs|null} */
  let binanceWs = null;
  /** @type {KrakenWs|null} */
  let krakenWs = null;

  /** map binanceSymbol(USDT) → internalKey(BTCUSD), чтобы при тиках вернуть наш ключ. */
  const binSymToKey = new Map();
  let clockTimer = null;

  let fxStooqWatchKeys = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let fxStooqDelayTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let fxStooqPollTimer = null;

  function clearFxStooqTimers() {
    if (fxStooqDelayTimer) clearTimeout(fxStooqDelayTimer);
    fxStooqDelayTimer = null;
    if (fxStooqPollTimer) clearInterval(fxStooqPollTimer);
    fxStooqPollTimer = null;
    fxStooqWatchKeys = [];
  }

  async function applyStooqForFxKeys(keys) {
    for (const k of keys) {
      let skip = false;
      update((map) => {
        const prev = map[k];
        if (prev?.provider === 'kraken' && Number(prev?.price) > 0) skip = true;
        return map;
      });
      if (skip) continue;
      try {
        const r = await fetchMarketPrice(k);
        if (!r || r.error || r.price == null || !Number.isFinite(Number(r.price))) continue;
        const price = Number(r.price);
        const ts = r.timestamp || Date.now();
        update((map) => {
          const prev = map[k];
          if (prev?.provider === 'kraken' && Number(prev?.price) > 0) return map;
          return {
            ...map,
            [k]: {
              loading: false,
              price,
              source: `${r.source || 'HTTP'} · без потока Kraken`,
              provider: r.provider || 'frankfurter',
              timestamp: ts,
              lastChangeAt: ts,
              error: null
            }
          };
        });
      } catch (_) {}
    }
  }

  function scheduleFxStooqFallback(keysArr) {
    clearFxStooqTimers();
    fxStooqWatchKeys = [...keysArr];
    fxStooqDelayTimer = setTimeout(() => {
      fxStooqDelayTimer = null;
      void applyStooqForFxKeys(fxStooqWatchKeys);
    }, FX_HTTP_FALLBACK_DELAY_MS);
    fxStooqPollTimer = setInterval(() => {
      void applyStooqForFxKeys(fxStooqWatchKeys);
    }, FX_HTTP_POLL_INTERVAL_MS);
  }

  // Троттлинги апдейтов pingInfo, чтобы пилюля не плясала.
  const tickThrottle = { binance: 0, kraken: 0 };
  const changeThrottle = { binance: 0, kraken: 0 };

  function patchPing(provider, mut) {
    pingInfo.update((p) => ({ ...p, [provider]: { ...p[provider], ...mut } }));
  }
  function updatePingTick(provider, mut) {
    const now = Date.now();
    if (now - tickThrottle[provider] < PING_TICK_THROTTLE_MS) return;
    tickThrottle[provider] = now;
    patchPing(provider, mut);
  }
  function updatePingChange(provider, mut) {
    const now = Date.now();
    if (now - changeThrottle[provider] < PING_CHANGE_THROTTLE_MS) return;
    changeThrottle[provider] = now;
    patchPing(provider, mut);
  }

  function ensureBinance() {
    if (binanceWs) return binanceWs;
    binanceWs = new BinanceWs({
      onTick: ({ symbol, price, eventTime, latencyMs }) => {
        const internalKey = binSymToKey.get(symbol);
        if (!internalKey) return;

        let priceChanged = false;
        update((map) => {
          const prev = map[internalKey];
          priceChanged = !prev || Number(prev.price) !== Number(price);
          return {
            ...map,
            [internalKey]: {
              loading: false,
              price,
              source: `Binance · ${symbol}`,
              provider: 'binance',
              timestamp: eventTime,
              lastChangeAt: priceChanged ? eventTime : (prev?.lastChangeAt ?? eventTime),
              error: null
            }
          };
        });

        updatePingTick('binance', {
          latencyMs,
          lastTickAt: Date.now(),
          connected: true,
          error: null
        });
        if (priceChanged) {
          updatePingChange('binance', { lastChangeAt: eventTime });
        }
      },
      onStatus: ({ connected, error }) => {
        patchPing('binance', { connected, error: error || null });
      }
    });
    return binanceWs;
  }

  function ensureKraken() {
    if (krakenWs) return krakenWs;
    krakenWs = new KrakenWs({
      onTick: ({ symbol, price, eventTime, latencyMs }) => {
        let priceChanged = false;
        update((map) => {
          const prev = map[symbol];
          priceChanged = !prev || Number(prev.price) !== Number(price);
          return {
            ...map,
            [symbol]: {
              loading: false,
              price,
              source: `Kraken · ${symbol}`,
              provider: 'kraken',
              timestamp: eventTime,
              lastChangeAt: priceChanged ? eventTime : (prev?.lastChangeAt ?? eventTime),
              error: null
            }
          };
        });

        updatePingTick('kraken', {
          latencyMs,
          lastTickAt: Date.now(),
          connected: true,
          error: null
        });
        if (priceChanged) {
          updatePingChange('kraken', { lastChangeAt: eventTime });
        }
      },
      onStatus: ({ connected, error }) => {
        patchPing('kraken', { connected, error: error || null });
      }
    });
    return krakenWs;
  }

  function setPairs(pairs) {
    /** @type {Set<string>} */
    const cryptoKeys = new Set();
    /** @type {Set<string>} */
    const otherKeys = new Set();

    for (const p of pairs) {
      const key = normalizeSymbolKey(p);
      if (!key) continue;
      if (isCryptoKey(key)) cryptoKeys.add(key);
      else otherKeys.add(key);
    }

    // Bin: маппинг внутренний → биржевой
    binSymToKey.clear();
    const binSymbols = [];
    for (const k of cryptoKeys) {
      const sym = toBinanceSymbol(k);
      binSymToKey.set(sym, k);
      binSymbols.push(sym);
    }

    // Загрузочное состояние, чтобы UI показал "…" пока WS не присылал тик
    update((map) => {
      const next = { ...map };
      for (const k of [...cryptoKeys, ...otherKeys]) {
        if (!next[k] || next[k].price == null) {
          next[k] = { ...(next[k] || {}), loading: true, error: null };
        }
      }
      return next;
    });

    if (binSymbols.length > 0) {
      ensureBinance().setSymbols(binSymbols);
    } else if (binanceWs) {
      binanceWs.close();
      binanceWs = null;
      pingInfo.update((p) => ({ ...p, binance: { ...p.binance, connected: false } }));
    }

    if (otherKeys.size > 0) {
      ensureKraken().setSymbols([...otherKeys]);
      scheduleFxStooqFallback([...otherKeys]);
    } else {
      clearFxStooqTimers();
      if (krakenWs) {
        krakenWs.close();
        krakenWs = null;
        pingInfo.update((p) => ({ ...p, kraken: { ...p.kraken, connected: false } }));
      }
    }
  }

  function start() {
    if (clockTimer) return;
    clockTimer = setInterval(() => tickClock.set(Date.now()), TICK_CLOCK_INTERVAL_MS);
  }

  function stop() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
    clearFxStooqTimers();
    if (binanceWs) { binanceWs.close(); binanceWs = null; }
    if (krakenWs) { krakenWs.close(); krakenWs = null; }
  }

  return {
    subscribe,
    setPairs,
    start,
    stop,
    _debug: () => ({
      binanceConnected: !!binanceWs?.ws,
      krakenConnected: !!krakenWs?.ws,
      binSymToKey: Object.fromEntries(binSymToKey),
      krakenKeys: krakenWs ? [...krakenWs.keys] : [],
      krakenPairMap: krakenWs ? Object.fromEntries(krakenWs.pairToKey) : {}
    })
  };
}

export const livePrices = createLivePrices();

// Глобальная диагностика: открой консоль → `__livePrices.snapshot()`
// Доступно только в dev-сборке, чтобы не светить внутреннее API в проде.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  let lastSnap = {};
  livePrices.subscribe((m) => { lastSnap = m; });
  let lastPing = {};
  pingInfo.subscribe((p) => { lastPing = p; });
  // @ts-ignore
  window.__livePrices = {
    snapshot: () => lastSnap,
    ping: () => lastPing,
    debug: () => livePrices._debug(),
    enableLog: () => {
      try { localStorage.setItem('debugWs', '1'); } catch (_) {}
      console.log('debugWs включён, перезагрузи страницу');
    },
    disableLog: () => {
      try { localStorage.removeItem('debugWs'); } catch (_) {}
      console.log('debugWs выключен, перезагрузи страницу');
    }
  };
}
