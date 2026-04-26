/**
 * Рыночные цены без API-ключей.
 *
 *   Крипта                 → Binance public  (https://api.binance.com)
 *   FX / Металлы / Сырьё /
 *   Индексы / акции        → Stooq CSV       (https://stooq.com)
 *
 * Оба источника отдают `Access-Control-Allow-Origin: *`, работают
 * напрямую из браузера, не требуют регистрации/ключей.
 *
 * Возвращает: { price, source, symbol, timestamp }
 *      либо : { error, source } при ошибке.
 */
import { normalizeSymbolKey } from './constants';

/* ---------------------- классификация символа ---------------------- */

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'DOGE', 'ADA', 'DOT', 'LINK',
  'AVAX', 'BNB', 'MATIC', 'TRX', 'SHIB', 'TON', 'UNI', 'ATOM', 'NEAR',
  'APT', 'SUI', 'ARB', 'OP', 'INJ', 'FIL', 'RUNE', 'AAVE', 'XLM', 'BCH',
  'ETC'
]);

const METAL_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

/** MT5-тикеры сырья → символы Stooq (фьючерсы). */
const COMMODITY_TO_STOOQ = {
  USOIL: 'cl.f', WTIUSD: 'cl.f', WTI: 'cl.f', XTIUSD: 'cl.f', CRUDE: 'cl.f', OILUSD: 'cl.f',
  UKOIL: 'b.f', BRENT: 'b.f', XBRUSD: 'b.f', BRENTUSD: 'b.f',
  NATGAS: 'ng.f', NGUSD: 'ng.f', XNGUSD: 'ng.f',
  COPPER: 'hg.f', XCUUSD: 'hg.f',
  COCOAUSD: 'cc.f', COFFEEUSD: 'kc.f', SUGARUSD: 'sb.f', WHEATUSD: 'zw.f', CORNUSD: 'zc.f'
};

/** MT5-тикеры индексов → символы Stooq. */
const INDEX_TO_STOOQ = {
  US500: '^spx', SPX500: '^spx', SP500: '^spx',
  US100: '^ndx', NAS100: '^ndx', NASDAQ100: '^ndx',
  US30: '^dji', DJ30: '^dji', US30CASH: '^dji',
  GER40: '^dax', DE40: '^dax', GER30: '^dax',
  UK100: '^ftm', FTSE100: '^ftm',
  JPN225: '^nkx', JP225: '^nkx',
  HK50: '^hsi', HKG33: '^hsi'
};

function isCryptoKey(key) {
  if (!key) return false;
  if (key.endsWith('USDT') || key.endsWith('USDC')) {
    const base = key.slice(0, key.length - 4);
    if (CRYPTO_BASES.has(base)) return true;
  }
  if (key.endsWith('USD')) {
    const base = key.slice(0, -3);
    if (CRYPTO_BASES.has(base)) return true;
  }
  return false;
}

function isMetalKey(key) {
  if (!key) return false;
  return [...METAL_BASES].some((b) => key.startsWith(b));
}

function isFxKey(key) {
  return /^[A-Z]{6}$/.test(key) && !isCryptoKey(key) && !isMetalKey(key);
}

/** Какой провайдер обслуживает символ. */
function providerForKey(key) {
  if (isCryptoKey(key)) return 'binance';
  return 'stooq';
}

/** AbortSignal с таймаутом (Polyfill для старых браузеров). */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  return c.signal;
}

const REQUEST_TIMEOUT_MS = 10_000;

/* -------------------------- Binance --------------------------- */

function toBinanceSymbol(key) {
  if (key.endsWith('USDT') || key.endsWith('USDC')) return key;
  if (key.endsWith('USD')) return key.slice(0, -3) + 'USDT';
  return key + 'USDT';
}

async function fetchFromBinance(key) {
  const result = await fetchBinanceBatch([{ key, display: key }]);
  return result.get(key) || { error: 'Binance: не найдено', provider: 'binance', source: 'binance' };
}

/**
 * Один batch-запрос к Binance: `?symbols=["BTCUSDT","ETHUSDT"]`.
 * @param {{key:string, display:string}[]} items
 * @returns {Promise<Map<string, any>>}
 */
async function fetchBinanceBatch(items) {
  if (items.length === 0) return new Map();
  const symbols = items.map((it) => toBinanceSymbol(it.key));
  const isSingle = symbols.length === 1;
  const url = isSingle
    ? `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbols[0])}`
    : `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;

  const t0 = performance.now();
  const out = new Map();
  try {
    const res = await fetch(url, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
    const pingMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      for (const it of items) {
        out.set(it.key, {
          error: `Binance HTTP ${res.status}`,
          source: 'binance', provider: 'binance', pingMs
        });
      }
      return out;
    }
    const data = await res.json();
    const priceMap = new Map();
    if (Array.isArray(data)) {
      for (const row of data) priceMap.set(row.symbol, Number(row.price));
    } else if (data?.symbol) {
      priceMap.set(data.symbol, Number(data.price));
    }
    for (const it of items) {
      const sym = toBinanceSymbol(it.key);
      const price = priceMap.get(sym);
      if (!Number.isFinite(price) || price <= 0) {
        out.set(it.key, {
          error: `Binance: нет данных по ${sym}`,
          source: 'binance', provider: 'binance', pingMs
        });
        continue;
      }
      out.set(it.key, {
        price,
        source: `Binance · ${sym}`,
        provider: 'binance',
        symbol: sym,
        timestamp: Date.now(),
        pingMs
      });
    }
    return out;
  } catch (err) {
    const pingMs = Math.round(performance.now() - t0);
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const msg = isTimeout ? 'таймаут 10 сек' : err?.message || 'сеть недоступна';
    for (const it of items) {
      out.set(it.key, {
        error: `Binance: ${msg}`,
        source: 'binance', provider: 'binance', pingMs
      });
    }
    return out;
  }
}

/* --------------------------- Stooq ---------------------------- */

function toStooqSymbol(key) {
  if (Object.prototype.hasOwnProperty.call(COMMODITY_TO_STOOQ, key)) {
    return COMMODITY_TO_STOOQ[key];
  }
  if (Object.prototype.hasOwnProperty.call(INDEX_TO_STOOQ, key)) {
    return INDEX_TO_STOOQ[key];
  }
  return key.toLowerCase();
}

/** Парсит CSV вида (multi-row): Symbol,Date,Time,Open,High,Low,Close,Volume */
function parseStooqCsvMulti(text) {
  const out = new Map();
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return out;
  const headers = lines[0].split(',').map((s) => s.trim().toLowerCase());
  const idxOf = (name) => headers.indexOf(name);
  const iSym = idxOf('symbol');
  const iDate = idxOf('date');
  const iTime = idxOf('time');
  const iClose = idxOf('close');
  if (iSym < 0 || iClose < 0) return out;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((s) => s.trim());
    const sym = String(cells[iSym] || '').toUpperCase();
    if (!sym) continue;
    const close = Number(cells[iClose]);
    if (!Number.isFinite(close) || close <= 0) {
      out.set(sym, { price: null });
      continue;
    }
    let timestamp = Date.now();
    const date = iDate >= 0 ? cells[iDate] : null;
    const time = iTime >= 0 ? cells[iTime] : null;
    if (date && date !== 'N/D') {
      const t = time && time !== 'N/D' ? time : '00:00:00';
      const parsed = Date.parse(`${date}T${t}Z`);
      if (Number.isFinite(parsed)) timestamp = parsed;
    }
    out.set(sym, { price: close, timestamp });
  }
  return out;
}

async function fetchFromStooq(key) {
  const result = await fetchStooqBatch([{ key, display: key }]);
  return result.get(key) || { error: 'Stooq: не найдено', provider: 'stooq', source: 'stooq' };
}

/**
 * Один batch-запрос к Stooq: `?s=eurusd,btcusd,xauusd`.
 * @param {{key:string, display:string}[]} items
 * @returns {Promise<Map<string, any>>}
 */
async function fetchStooqBatch(items) {
  if (items.length === 0) return new Map();
  const symbols = items.map((it) => toStooqSymbol(it.key));
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbols.join(','))}&f=sd2t2ohlcv&h&e=csv`;

  const t0 = performance.now();
  const out = new Map();
  try {
    const res = await fetch(url, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
    const pingMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      for (const it of items) {
        out.set(it.key, {
          error: `Stooq HTTP ${res.status}`,
          source: 'stooq', provider: 'stooq', pingMs
        });
      }
      return out;
    }
    const text = await res.text();
    const parsed = parseStooqCsvMulti(text);
    for (const it of items) {
      const sym = toStooqSymbol(it.key);
      const row = parsed.get(sym.toUpperCase());
      if (!row || !Number.isFinite(row.price) || row.price <= 0) {
        out.set(it.key, {
          error: `Stooq: нет данных по «${sym}»`,
          source: 'stooq', provider: 'stooq', pingMs
        });
        continue;
      }
      out.set(it.key, {
        price: row.price,
        source: `Stooq · ${sym.toUpperCase()}`,
        provider: 'stooq',
        symbol: sym,
        timestamp: row.timestamp,
        pingMs
      });
    }
    return out;
  } catch (err) {
    const pingMs = Math.round(performance.now() - t0);
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const msg = isTimeout ? 'таймаут 10 сек' : err?.message || 'сеть недоступна';
    for (const it of items) {
      out.set(it.key, {
        error: `Stooq: ${msg}`,
        source: 'stooq', provider: 'stooq', pingMs
      });
    }
    return out;
  }
}

/* --------------------- Публичный фасад ------------------------ */

/**
 * @param {string} pair - например 'EURUSD', 'BTCUSD', 'XAUUSD', 'USOIL', 'US500'
 * @returns {Promise<{price?:number, source?:string, symbol?:string, timestamp?:number, error?:string}>}
 */
export async function fetchMarketPrice(pair) {
  const key = normalizeSymbolKey(pair);
  if (!key) return { error: 'Не указана пара', source: null };

  if (isCryptoKey(key)) return fetchFromBinance(key);

  // Всё остальное (FX, металлы, сырьё, индексы, акции) → Stooq.
  return fetchFromStooq(key);
}

/**
 * Batch-загрузка цен. Группирует по провайдеру, делает по одному запросу
 * на провайдера. Возвращает Map<normalizedKey, result>.
 *
 * @param {string[]} pairs
 * @param {{ onProgress?: (info:{provider:string, done:number, total:number}) => void }} [opts]
 */
export async function fetchMarketPricesBatch(pairs, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const groups = { binance: [], stooq: [] };

  const seen = new Set();
  for (const p of pairs) {
    const key = normalizeSymbolKey(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    groups[providerForKey(key)].push({ key, display: p });
  }

  const total = (groups.binance.length ? 1 : 0) + (groups.stooq.length ? 1 : 0);
  let done = 0;
  const out = new Map();

  const tasks = [];
  if (groups.binance.length) {
    tasks.push(
      fetchBinanceBatch(groups.binance).then((m) => {
        for (const [k, v] of m) out.set(k, v);
        done++;
        onProgress({ provider: 'binance', done, total });
      })
    );
  }
  if (groups.stooq.length) {
    tasks.push(
      fetchStooqBatch(groups.stooq).then((m) => {
        for (const [k, v] of m) out.set(k, v);
        done++;
        onProgress({ provider: 'stooq', done, total });
      })
    );
  }
  await Promise.allSettled(tasks);
  return out;
}

/** Чтобы проверить из консоли в дев-режиме. В проде не вешаем на window. */
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__fetchMarketPrice = fetchMarketPrice;
  window.__fetchMarketPricesBatch = fetchMarketPricesBatch;
}
