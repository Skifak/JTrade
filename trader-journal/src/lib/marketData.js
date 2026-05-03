/**
 * Рыночные цены без API-ключей.
 *
 *   Крипта → Binance public (https://api.binance.com)
 *   FX → Frankfurter (https://api.frankfurter.dev/v1 — без редиректа, иначе Firefox ломает CORS на 301 с .app)
 *   Индексы / сырьё / металлы (не XAU*) → Yahoo Chart API (JSON); при ошибке → Stooq CSV.
 *   Золото XAU* → Binance PAXGUSDT (≈ золото), затем Yahoo GC=F, затем Stooq.
 *
 * Stooq не отдаёт Access-Control-Allow-Origin — в браузере fetch режется.
 * В Tauri вызывается `tauri_fetch_allowed_http_get` (обход CORS).
 *
 * Возвращает: { price, source, symbol, timestamp }
 *      либо : { error, source } при ошибке.
 */
import { normalizeSymbolKey } from './constants';
import { isTauriApp } from './attachmentApi.js';

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

/** MT5-тикеры → Yahoo Finance chart (индексы / фьючи); обычно доступно из браузера по CORS. */
const KEY_TO_YAHOO = {
  US500: '^GSPC', SPX500: '^GSPC', SP500: '^GSPC',
  US100: '^IXIC', NAS100: '^IXIC', NASDAQ100: '^IXIC',
  US30: '^DJI', DJ30: '^DJI', US30CASH: '^DJI',
  GER40: '^GDAXI', DE40: '^GDAXI', GER30: '^GDAXI',
  UK100: '^FTSE', FTSE100: '^FTSE',
  JPN225: '^N225', JP225: '^N225',
  HK50: '^HSI', HKG33: '^HSI',
  USOIL: 'CL=F', WTIUSD: 'CL=F', WTI: 'CL=F', XTIUSD: 'CL=F', CRUDE: 'CL=F', OILUSD: 'CL=F',
  UKOIL: 'BZ=F', BRENT: 'BZ=F', XBRUSD: 'BZ=F', BRENTUSD: 'BZ=F',
  NATGAS: 'NG=F', NGUSD: 'NG=F', XNGUSD: 'NG=F',
  COPPER: 'HG=F', XCUUSD: 'HG=F',
  COCOAUSD: 'CC=F', COFFEEUSD: 'KC=F', SUGARUSD: 'SB=F', WHEATUSD: 'ZW=F', CORNUSD: 'ZC=F',
  XAGUSD: 'SI=F', XPTUSD: 'PL=F', XPDUSD: 'PA=F'
};

function keyToYahooSymbol(key) {
  const k = String(key || '').toUpperCase();
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(KEY_TO_YAHOO, k)) return KEY_TO_YAHOO[k];
  if (k.startsWith('XAG')) return 'SI=F';
  if (k.startsWith('XPT')) return 'PL=F';
  if (k.startsWith('XPD')) return 'PA=F';
  return null;
}

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

/** Какой провайдер обслуживает символ (для batch). */
function providerForKey(key) {
  if (isCryptoKey(key)) return 'binance';
  if (isFxKey(key)) return 'frankfurter';
  return 'stooq';
}

/** Чекбокс «По рынку» в форме — только FX и крипта (live через WS в livePrices). */
export function supportsFormMarketFill(pair) {
  const key = normalizeSymbolKey(pair);
  if (!key) return false;
  return isCryptoKey(key) || isFxKey(key);
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

/**
 * Браузерный fetch; при ошибке (в т.ч. CORS) в Tauri — повтор через Rust по allowlist.
 */
async function fetchTextBrowserThenTauri(url) {
  try {
    const res = await fetch(url, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (first) {
    if (typeof window !== 'undefined' && isTauriApp()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('tauri_fetch_allowed_http_get', { url });
    }
    throw first;
  }
}

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

/* ------------------------ Frankfurter (FX, CORS) ----------------- */

const FRANKFURTER_LATEST = 'https://api.frankfurter.dev/v1/latest';

/**
 * Курсы ECB (обновление рабочими днями, не тик).
 * Только api.frankfurter.dev/v1 — не api.frankfurter.app: там 301 без ACAO, Firefox режет preflight.
 * @param {{key:string, display:string}[]} items
 * @returns {Promise<Map<string, any>>}
 */
async function fetchFrankfurterBatch(items) {
  const out = new Map();
  if (items.length === 0) return out;

  /** base (3 буквы) → quote → список внутренних ключей с такой парой */
  const byBase = new Map();
  for (const it of items) {
    const key = it.key;
    const base = key.slice(0, 3);
    const quote = key.slice(3, 6);
    if (!byBase.has(base)) byBase.set(base, new Map());
    const qm = byBase.get(base);
    if (!qm.has(quote)) qm.set(quote, []);
    qm.get(quote).push(key);
  }

  for (const [base, quoteMap] of byBase) {
    const quotes = [...quoteMap.keys()].sort().join(',');
    const url = `${FRANKFURTER_LATEST}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quotes)}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
      const pingMs = Math.round(performance.now() - t0);
      if (!res.ok) {
        for (const keys of quoteMap.values()) {
          for (const k of keys) {
            out.set(k, {
              error: `Frankfurter HTTP ${res.status}`,
              provider: 'frankfurter',
              source: 'Frankfurter',
              pingMs
            });
          }
        }
        continue;
      }
      const data = await res.json();
      const rates = data?.rates || {};
      const dateStr = data?.date || '';
      let timestamp = Date.now();
      if (dateStr) {
        const p = Date.parse(`${dateStr}T12:00:00Z`);
        if (Number.isFinite(p)) timestamp = p;
      }
      for (const [quote, keys] of quoteMap) {
        const price = Number(rates[quote]);
        if (!Number.isFinite(price) || price <= 0) {
          for (const k of keys) {
            out.set(k, {
              error: `Frankfurter: нет ${base}/${quote}`,
              provider: 'frankfurter',
              source: 'Frankfurter',
              pingMs
            });
          }
          continue;
        }
        for (const k of keys) {
          out.set(k, {
            price,
            source: `Frankfurter · ${base}/${quote}`,
            provider: 'frankfurter',
            symbol: `${base}${quote}`,
            timestamp,
            pingMs
          });
        }
      }
    } catch (err) {
      const pingMs = Math.round(performance.now() - t0);
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const msg = isTimeout ? 'таймаут 10 сек' : err?.message || 'сеть недоступна';
      for (const keys of quoteMap.values()) {
        for (const k of keys) {
          out.set(k, {
            error: `Frankfurter: ${msg}`,
            provider: 'frankfurter',
            source: 'Frankfurter',
            pingMs
          });
        }
      }
    }
  }
  return out;
}

async function fetchFromFrankfurter(key) {
  const m = await fetchFrankfurterBatch([{ key, display: key }]);
  return m.get(key) || { error: 'Frankfurter: нет данных', provider: 'frankfurter', source: 'Frankfurter' };
}

/* ---------------- Yahoo chart (+ индексы / сырьё без Stooq в браузере) ---------------- */

function parseYahooChartJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Yahoo: не JSON' };
  }
  const cerr = data?.chart?.error;
  if (cerr) {
    const desc = cerr.description || cerr.code || 'chart error';
    return { error: `Yahoo: ${desc}` };
  }
  const result = data?.chart?.result?.[0];
  if (!result) return { error: 'Yahoo: нет result' };
  const meta = result.meta || {};
  let price = Number(meta.regularMarketPrice);
  let timestamp = Number(meta.regularMarketTime) * 1000;
  if (!Number.isFinite(timestamp) || timestamp <= 0) timestamp = Date.now();

  if (!Number.isFinite(price) || price <= 0) {
    const q = result?.indicators?.quote?.[0];
    const closes = Array.isArray(q?.close) ? q.close : null;
    if (closes) {
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = Number(closes[i]);
        if (Number.isFinite(c) && c > 0) {
          price = c;
          break;
        }
      }
    }
  }
  if (!Number.isFinite(price) || price <= 0) {
    price = Number(meta.previousClose);
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Yahoo: нет цены' };
  }
  return { price, timestamp };
}

async function fetchYahooChartRow(yahooSym) {
  const enc = encodeURIComponent(yahooSym);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=5m&range=5d`;
  const t0 = performance.now();
  try {
    const text = await fetchTextBrowserThenTauri(url);
    const pingMs = Math.round(performance.now() - t0);
    const parsed = parseYahooChartJson(text);
    if (parsed.error) {
      return { error: parsed.error, provider: 'yahoo', source: 'Yahoo', pingMs };
    }
    return {
      price: parsed.price,
      source: `Yahoo · ${yahooSym}`,
      provider: 'yahoo',
      timestamp: parsed.timestamp,
      pingMs
    };
  } catch (err) {
    const pingMs = Math.round(performance.now() - t0);
    const msg = err?.message || 'сеть недоступна';
    return { error: `Yahoo: ${msg}`, provider: 'yahoo', source: 'Yahoo', pingMs };
  }
}

/**
 * Индексы / сырьё / металлы: XAU* → Binance PAXGUSDT; затем Yahoo; иначе Stooq (в Tauri без CORS).
 * @param {{key:string, display:string}[]} items
 */
async function fetchMacroAssetsBatch(items) {
  const out = new Map();
  if (items.length === 0) return out;

  const xauItems = items.filter((it) => it.key.startsWith('XAU'));
  const rest = items.filter((it) => !it.key.startsWith('XAU'));

  if (xauItems.length > 0) {
    const m = await fetchBinanceBatch([{ key: 'PAXGUSD', display: 'PAXGUSD' }]);
    const row = m.get('PAXGUSD');
    for (const it of xauItems) {
      if (!row?.error && row?.price != null && Number.isFinite(Number(row.price))) {
        out.set(it.key, {
          price: Number(row.price),
          source: `Binance · PAXGUSDT ≈ ${it.key}`,
          provider: 'binance-proxy',
          symbol: it.key,
          timestamp: row.timestamp ?? Date.now(),
          pingMs: row.pingMs
        });
      }
    }
  }

  /** @type {{key:string, display:string}[]} */
  const forStooq = [];
  const yahooGroups = new Map();

  for (const it of rest) {
    const ys = keyToYahooSymbol(it.key);
    if (!ys) {
      forStooq.push(it);
      continue;
    }
    if (!yahooGroups.has(ys)) yahooGroups.set(ys, []);
    yahooGroups.get(ys).push(it);
  }

  for (const [ysym, group] of yahooGroups) {
    const yr = await fetchYahooChartRow(ysym);
    if (!yr.error && yr.price != null) {
      for (const it of group) {
        out.set(it.key, {
          price: yr.price,
          source: `Yahoo · ${ysym}`,
          provider: 'yahoo',
          symbol: it.key,
          timestamp: yr.timestamp,
          pingMs: yr.pingMs
        });
      }
    } else {
      forStooq.push(...group);
    }
  }

  const missingXau = xauItems.filter((it) => !out.has(it.key));
  if (missingXau.length > 0) {
    const yr = await fetchYahooChartRow('GC=F');
    if (!yr.error && yr.price != null) {
      for (const it of missingXau) {
        out.set(it.key, {
          price: yr.price,
          source: 'Yahoo · GC=F',
          provider: 'yahoo',
          symbol: it.key,
          timestamp: yr.timestamp,
          pingMs: yr.pingMs
        });
      }
    } else {
      forStooq.push(...missingXau);
    }
  }

  if (forStooq.length === 0) return out;

  const seen = new Set();
  const stooqDedup = [];
  for (const it of forStooq) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    stooqDedup.push(it);
  }

  const sm = await fetchStooqBatch(stooqDedup);
  for (const [k, v] of sm) out.set(k, v);
  return out;
}

async function fetchMacroAssetSingle(key) {
  const m = await fetchMacroAssetsBatch([{ key, display: key }]);
  return m.get(key) || { error: 'Нет данных', provider: 'stooq', source: 'stooq' };
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
    const text = await fetchTextBrowserThenTauri(url);
    const pingMs = Math.round(performance.now() - t0);
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

  if (isFxKey(key)) {
    const fr = await fetchFromFrankfurter(key);
    if (!fr.error && fr.price != null && Number.isFinite(Number(fr.price))) return fr;
    return fetchFromStooq(key);
  }

  return fetchMacroAssetSingle(key);
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
  const groups = { binance: [], frankfurter: [], stooq: [] };

  const seen = new Set();
  for (const p of pairs) {
    const key = normalizeSymbolKey(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    groups[providerForKey(key)].push({ key, display: p });
  }

  const total =
    (groups.binance.length ? 1 : 0) +
    (groups.frankfurter.length ? 1 : 0) +
    (groups.stooq.length ? 1 : 0);
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
  if (groups.frankfurter.length) {
    tasks.push(
      fetchFrankfurterBatch(groups.frankfurter).then((m) => {
        for (const [k, v] of m) out.set(k, v);
        done++;
        onProgress({ provider: 'frankfurter', done, total });
      })
    );
  }
  if (groups.stooq.length) {
    tasks.push(
      fetchMacroAssetsBatch(groups.stooq).then((m) => {
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
