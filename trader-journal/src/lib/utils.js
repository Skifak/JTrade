import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { DEFAULT_CONTRACT_SIZE_BY_SYMBOL, normalizeSymbolKey } from './constants';

function getContractSize(symbol) {
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

  const profits = sorted.map((t) => Number(t.profit) || 0);
  const profitable = sorted.filter((t) => (Number(t.profit) || 0) > 0);
  const losses = sorted.filter((t) => (Number(t.profit) || 0) < 0);

  const totalProfit = profits.reduce((s, p) => s + p, 0);
  const grossProfit = profitable.reduce((s, t) => s + (Number(t.profit) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (Number(t.profit) || 0), 0));
  const sumCommission = sorted.reduce((s, t) => s + (Number(t.commission) || 0), 0);
  const sumSwap = sorted.reduce((s, t) => s + (Number(t.swap) || 0), 0);

  const longs = sorted.filter((t) => t.direction === 'long');
  const shorts = sorted.filter((t) => t.direction === 'short');
  const longWins = longs.filter((t) => (Number(t.profit) || 0) > 0).length;
  const shortWins = shorts.filter((t) => (Number(t.profit) || 0) > 0).length;

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
  return num.toFixed(decimals);
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

export async function getConversionQuote(fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency) return { rate: 1, source: 'identity' };
  if (fromCurrency === toCurrency) return { rate: 1, source: 'identity' };

  const from = String(fromCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  const normalizedFrom = from === 'USDT' ? 'USD' : from;
  const normalizedTo = to === 'USDT' ? 'USD' : to;

  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(normalizedFrom)}&symbols=${encodeURIComponent(normalizedTo)}`
    );
    if (response.ok) {
      const payload = await response.json();
      const rate = payload?.rates?.[normalizedTo];
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        return {
          rate,
          source: normalizedFrom !== from || normalizedTo !== to ? 'live-proxy-usdt' : 'live'
        };
      }
    }
  } catch (_) {
    // Ошибка сети/сервиса - без локального fallback по требованию.
  }

  return null;
}

export function convertAmount(amount, rate, decimals = 2) {
  const numericAmount = Number(amount) || 0;
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) return numericAmount;
  const factor = 10 ** decimals;
  return Math.round((numericAmount * numericRate) * factor) / factor;
}