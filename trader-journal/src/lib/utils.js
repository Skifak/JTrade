import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { DEFAULT_CONTRACT_SIZE_BY_SYMBOL, normalizeSymbolKey } from './constants';

export function getContractSize(symbol) {
  const key = normalizeSymbolKey(symbol);
  if (!key) return 1;

  if (Object.prototype.hasOwnProperty.call(DEFAULT_CONTRACT_SIZE_BY_SYMBOL, key)) {
    return DEFAULT_CONTRACT_SIZE_BY_SYMBOL[key];
  }

  // Metals (типичные CFD MT5).
  if (key.startsWith('XAU')) return 100;
  if (key.startsWith('XAG')) return 5000;

  // Крипто CFD: 1 монета на 1.0 лот (часто; уточняй у брокера).
  if (
    key.endsWith('USD') &&
    /^(BTC|ETH|LTC|XRP|SOL|DOGE|ADA|DOT|LINK|AVAX|BNB|MATIC|TRX|SHIB|TON|UNI|ATOM|NEAR|APT|SUI)/.test(key)
  ) {
    return 1;
  }

  // Классический спот-FX: ровно 6 латинских букв (после нормализации суффиксов).
  if (/^[A-Z]{6}$/.test(key)) return 100000;

  return 1;
}

function isFxSymbol(symbol) {
  const key = normalizeSymbolKey(symbol);
  return /^[A-Z]{6}$/.test(key);
}

// Генерация новой сделки
export function createNewTrade(template = null) {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  
  const baseTrade = {
    id: uuidv4(),
    dateOpen: now,
    dateOpenManual: false,
    pair: 'EURUSD',
    direction: 'long',
    volume: 0.01,
    priceOpen: 0,
    sl: null,
    tp: null,
    status: 'open',
    dateClose: null,
    priceClose: null,
    commission: 0,
    swap: 0,
    profit: null,
    /** Переопределение размера контракта на 1.0 лот; null = из справочника по паре */
    contractSize: null,
    tags: [],
    templateUsed: template?.name || null,
    comment: ''
  };
  
  if (template) {
    baseTrade.pair = template.pair;
    baseTrade.comment = template.comment;
  }
  
  return baseTrade;
}

/** Закрытая сделка из отчёта «История торговли» MT5 — колонка «Прибыль», не пересчёт из цен. */
export function isBrokerImportedTrade(trade) {
  return Array.isArray(trade?.tags) && trade.tags.includes('mt5-history-report');
}

/** Колонка прибыли MT5 в валюте депозита (не USD-flavor из calculateProfit). */
export function isMt5DepositCurrencyProfit(trade) {
  return (
    Array.isArray(trade?.tags) &&
    (trade.tags.includes('mt5-history-report') || trade.tags.includes('mt5-trade-report'))
  );
}

// Расчет прибыли
export function calculateProfit(trade) {
  if (trade.status !== 'closed' || !trade.priceClose) return null;

  const volume = Number(trade.volume) || 0;
  const priceOpen = Number(trade.priceOpen) || 0;
  const priceClose = Number(trade.priceClose) || 0;
  const commission = Number(trade.commission) || 0;
  const swap = Number(trade.swap) || 0;
  const pair = String(trade.pair || '').toUpperCase();
  const override = Number(trade.contractSize);
  const contractSize =
    Number.isFinite(override) && override > 0 ? override : getContractSize(pair);

  const directionMultiplier = trade.direction === 'short' ? -1 : 1;
  const units = volume * contractSize;
  const priceDiff = (priceClose - priceOpen) * directionMultiplier;
  let rawPnL = priceDiff * units;

  // Community-standard FX conversion to USD account currency:
  // - XXXUSD: profit already in USD
  // - USDXXX: profit in quote currency -> convert to USD by dividing by close
  // - XXXYYY: without YYYUSD feed cannot convert exactly in sync mode
  if (isFxSymbol(pair)) {
    const base = pair.slice(0, 3);
    const quote = pair.slice(3, 6);

    if (quote === 'USD') {
      // already USD
    } else if (base === 'USD') {
      rawPnL = priceClose !== 0 ? rawPnL / priceClose : 0;
    }
  }

  return rawPnL - commission - swap;
}

/**
 * Плавающий P/L открытой сделки по live-цене.
 * Если livePrice не задан — возвращает текущий trade.profit (импортировано из MT5)
 * либо null.
 */
export function calculateFloatingProfit(trade, livePrice) {
  if (!trade) return null;
  const price = Number(livePrice);
  if (!Number.isFinite(price) || price <= 0) {
    return trade.profit != null ? Number(trade.profit) : null;
  }
  return calculateProfit({ ...trade, status: 'closed', priceClose: price });
}

// Закрытие сделки
export function closeTrade(trade, closePrice) {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const updatedTrade = {
    ...trade,
    status: 'closed',
    priceClose: closePrice,
    dateClose: now,
    profit: 0
  };
  updatedTrade.profit = calculateProfit(updatedTrade);
  return updatedTrade;
}

// Расчет статистики (расширенный, как в отчете MT5)
export function calculateStats(closedTrades, options = {}) {
  const initialCapital = Number(options.initialCapital) || 0;
  const profitOf =
    typeof options.profitOf === 'function' ? options.profitOf : (t) => Number(t?.profit) || 0;

  const emptyStats = {
    totalTrades: 0,
    totalProfit: 0,
    netProfit: 0,
    grossProfit: 0,
    grossLoss: 0,
    sumCommission: 0,
    sumSwap: 0,
    winRate: 0,
    winningCount: 0,
    losingCount: 0,
    avgProfit: 0,
    avgLoss: 0,
    profitFactor: 0,
    expectancy: 0,
    maxProfit: 0,
    maxLoss: 0,
    longCount: 0,
    longWinCount: 0,
    longWinRate: 0,
    shortCount: 0,
    shortWinCount: 0,
    shortWinRate: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    maxConsecutiveWinAmount: 0,
    maxConsecutiveLossAmount: 0,
    avgConsecutiveWins: 0,
    avgConsecutiveLosses: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    recoveryFactor: 0,
    sharpeRatio: 0,
    firstDate: null,
    lastDate: null
  };

  if (!Array.isArray(closedTrades) || closedTrades.length === 0) return emptyStats;

  const sorted = [...closedTrades].sort((a, b) => {
    const da = new Date(a.dateClose || a.dateOpen || 0).getTime();
    const db = new Date(b.dateClose || b.dateOpen || 0).getTime();
    return da - db;
  });

  const profits = sorted.map((t) => profitOf(t));
  const profitable = sorted.filter((t) => profitOf(t) > 0);
  const losses = sorted.filter((t) => profitOf(t) < 0);

  const totalProfit = profits.reduce((s, p) => s + p, 0);
  const grossProfit = profitable.reduce((s, t) => s + profitOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + profitOf(t), 0));
  const sumCommission = sorted.reduce((s, t) => s + (Number(t.commission) || 0), 0);
  const sumSwap = sorted.reduce((s, t) => s + (Number(t.swap) || 0), 0);

  const longs = sorted.filter((t) => t.direction === 'long');
  const shorts = sorted.filter((t) => t.direction === 'short');
  const longWins = longs.filter((t) => profitOf(t) > 0).length;
  const shortWins = shorts.filter((t) => profitOf(t) > 0).length;

  // Серии (по знаку profit). 0-сделки игнорируем как нейтральные.
  const winSeries = [];
  const lossSeries = [];
  let curWinLen = 0;
  let curWinSum = 0;
  let curLossLen = 0;
  let curLossSum = 0;
  for (const p of profits) {
    if (p > 0) {
      if (curLossLen > 0) {
        lossSeries.push({ len: curLossLen, sum: curLossSum });
        curLossLen = 0;
        curLossSum = 0;
      }
      curWinLen += 1;
      curWinSum += p;
    } else if (p < 0) {
      if (curWinLen > 0) {
        winSeries.push({ len: curWinLen, sum: curWinSum });
        curWinLen = 0;
        curWinSum = 0;
      }
      curLossLen += 1;
      curLossSum += p;
    }
  }
  if (curWinLen > 0) winSeries.push({ len: curWinLen, sum: curWinSum });
  if (curLossLen > 0) lossSeries.push({ len: curLossLen, sum: curLossSum });

  const maxBy = (arr, key) => arr.reduce((m, x) => (x[key] > m ? x[key] : m), 0);
  const minBy = (arr, key) => arr.reduce((m, x) => (x[key] < m ? x[key] : m), 0);
  const avg = (arr, key) =>
    arr.length ? arr.reduce((s, x) => s + x[key], 0) / arr.length : 0;

  // Просадка по эквити: equity[i] = initialCapital + sum(profit[0..i])
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const p of profits) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Sharpe (упрощенно): mean(profit) / stddev(profit). MT5 даёт похожий порядок.
  const meanProfit = totalProfit / profits.length;
  const variance =
    profits.reduce((s, p) => s + (p - meanProfit) ** 2, 0) / profits.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? meanProfit / stdDev : 0;

  const datesOpen = sorted
    .map((t) => t.dateOpen)
    .filter(Boolean)
    .sort();
  const datesClose = sorted
    .map((t) => t.dateClose)
    .filter(Boolean)
    .sort();

  return {
    totalTrades: sorted.length,
    totalProfit,
    netProfit: totalProfit,
    grossProfit,
    grossLoss,
    sumCommission,
    sumSwap,
    winRate: (profitable.length / sorted.length) * 100,
    winningCount: profitable.length,
    losingCount: losses.length,
    avgProfit: profitable.length ? grossProfit / profitable.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancy: totalProfit / sorted.length,
    maxProfit: Math.max(...profits, 0),
    maxLoss: Math.min(...profits, 0),
    longCount: longs.length,
    longWinCount: longWins,
    longWinRate: longs.length ? (longWins / longs.length) * 100 : 0,
    shortCount: shorts.length,
    shortWinCount: shortWins,
    shortWinRate: shorts.length ? (shortWins / shorts.length) * 100 : 0,
    maxConsecutiveWins: maxBy(winSeries, 'len'),
    maxConsecutiveLosses: maxBy(lossSeries, 'len'),
    maxConsecutiveWinAmount: maxBy(winSeries, 'sum'),
    maxConsecutiveLossAmount: minBy(lossSeries, 'sum'),
    avgConsecutiveWins: avg(winSeries, 'len'),
    avgConsecutiveLosses: avg(lossSeries, 'len'),
    maxDrawdown,
    maxDrawdownPercent,
    recoveryFactor: maxDrawdown > 0 ? totalProfit / maxDrawdown : 0,
    sharpeRatio,
    firstDate: datesOpen[0] || null,
    lastDate: datesClose[datesClose.length - 1] || null
  };
}

// Форматирование чисел
export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return '-';
  return Number(num).toFixed(decimals);
}

/**
 * Адаптивный формат цены в зависимости от величины актива.
 *  ≥ 1000   (BTC, индексы, US30) → 2 знака
 *  ≥ 100    (золото, нефть)      → 3 знака
 *  ≥ 10     (нефть, акции)       → 4 знака
 *  ≥ 1      (FX major: EURUSD)   → 5 знаков
 *  ≥ 0.01   (мини-крипта)        → 6 знаков
 *  меньше                        → 8 знаков
 */
export function formatPrice(num) {
  if (num === null || num === undefined || !Number.isFinite(Number(num))) return '-';
  const v = Math.abs(Number(num));
  let d;
  if (v >= 1000) d = 2;
  else if (v >= 100) d = 3;
  else if (v >= 10) d = 4;
  else if (v >= 1) d = 5;
  else if (v >= 0.01) d = 6;
  else d = 8;
  return Number(num).toFixed(d);
}

// Форматирование даты
export function formatDate(date, format = 'DD.MM.YYYY HH:mm') {
  if (!date) return '-';
  return dayjs(date).format(format);
}

/** Длительность между двумя датами в человекочитаемой форме. */
export function formatDuration(start, end) {
  if (!start) return '-';
  const startMs = dayjs(start).valueOf();
  const endMs = end ? dayjs(end).valueOf() : Date.now();
  const diff = Math.max(0, endMs - startMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}м`;
  const hr = Math.floor(min / 60);
  const restMin = min - hr * 60;
  if (hr < 24) return restMin ? `${hr}ч ${restMin}м` : `${hr}ч`;
  const days = Math.floor(hr / 24);
  const restHr = hr - days * 24;
  return restHr ? `${days}д ${restHr}ч` : `${days}д`;
}

/** Размер пипса по символу (для конвертации движения цены в "пункты"). */
export function getPipSize(symbol) {
  const key = normalizeSymbolKey(symbol);
  if (!key) return 1;
  if (key.startsWith('XAU')) return 0.1;
  if (key.startsWith('XAG')) return 0.01;
  if (/^(BTC|ETH|LTC|XRP|SOL|DOGE|ADA|DOT|LINK|AVAX|BNB|MATIC|TRX)/.test(key)) return 1;
  if (/^[A-Z]{6}$/.test(key)) {
    const quote = key.slice(3, 6);
    return quote === 'JPY' ? 0.01 : 0.0001;
  }
  return 1;
}

/** Движение цены в пипсах с учётом направления (положительно = в плюс). */
export function calculatePips(trade) {
  if (!trade?.priceClose) return null;
  const open = Number(trade.priceOpen) || 0;
  const close = Number(trade.priceClose) || 0;
  const dir = trade.direction === 'short' ? -1 : 1;
  const pip = getPipSize(trade.pair);
  if (!pip) return null;
  return ((close - open) * dir) / pip;
}

/** Движение цены в процентах с учётом направления. */
export function calculatePricePercent(trade) {
  if (!trade?.priceClose) return null;
  const open = Number(trade.priceOpen) || 0;
  if (open === 0) return null;
  const close = Number(trade.priceClose) || 0;
  const dir = trade.direction === 'short' ? -1 : 1;
  return ((close - open) * dir / open) * 100;
}

/** Происхождение сделки: 'mt5-history' | 'mt5-trade' | 'manual'. */
export function getTradeSource(trade) {
  const tags = Array.isArray(trade?.tags) ? trade.tags : [];
  if (tags.includes('mt5-history-report')) return 'mt5-history';
  if (tags.includes('mt5-trade-report')) return 'mt5-trade';
  return 'manual';
}

// Получение FX-курса только из live-источника
export async function getConversionRate(fromCurrency, toCurrency) {
  const quote = await getConversionQuote(fromCurrency, toCurrency);
  return quote?.rate ?? null;
}

/**
 * Универсальный конвертер курса между валютами.
 *
 *   USD ↔ USDT       → 1:1 (стейбл)
 *   BTC ↔ USD/USDT   → BTCUSDT с Binance REST
 *   BTC ↔ fiat       → BTC*USD * USD→fiat (комбо Binance + Frankfurter)
 *   fiat ↔ fiat      → Frankfurter
 *
 * Возвращает { rate, source } или null если курс получить не удалось.
 */
export async function getConversionQuote(fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency) return { rate: 1, source: 'identity' };

  const from = String(fromCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  if (from === to) return { rate: 1, source: 'identity' };

  // USDT ≈ USD: 1:1.
  const sFrom = from === 'USDT' ? 'USD' : from;
  const sTo = to === 'USDT' ? 'USD' : to;
  if (sFrom === sTo) return { rate: 1, source: 'usdt-proxy' };

  // BTC требует биржевой источник.
  if (sFrom === 'BTC' || sTo === 'BTC') {
    const btcUsd = await fetchBtcUsdRate();
    if (!btcUsd) return null;

    if (sFrom === 'BTC' && sTo === 'USD') return { rate: btcUsd, source: 'binance' };
    if (sFrom === 'USD' && sTo === 'BTC') return { rate: 1 / btcUsd, source: 'binance' };

    // Кросс с другим фиатом — через USD-прокси.
    if (sFrom === 'BTC') {
      const usdToFiat = await fetchFrankfurterRate('USD', sTo);
      if (!usdToFiat) return null;
      return { rate: btcUsd * usdToFiat, source: 'binance+frankfurter' };
    }
    // sTo === 'BTC'
    const fiatToUsd = await fetchFrankfurterRate(sFrom, 'USD');
    if (!fiatToUsd) return null;
    return { rate: fiatToUsd / btcUsd, source: 'frankfurter+binance' };
  }

  // Pure fiat ↔ fiat.
  const r = await fetchFrankfurterRate(sFrom, sTo);
  if (r == null) return null;
  return {
    rate: r,
    source: sFrom !== from || sTo !== to ? 'live-proxy-usdt' : 'live'
  };
}

async function fetchBtcUsdRate() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (!res.ok) return null;
    const data = await res.json();
    const p = Number(data?.price);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch (_) {
    return null;
  }
}

async function fetchFrankfurterRate(from, to) {
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[to];
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (_) {
    return null;
  }
}

export function convertAmount(amount, rate, decimals = 2) {
  const numericAmount = Number(amount) || 0;
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) return numericAmount;
  const factor = 10 ** decimals;
  return Math.round((numericAmount * numericRate) * factor) / factor;
}