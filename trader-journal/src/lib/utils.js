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

// Расчет статистики
export function calculateStats(closedTrades) {
  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      totalProfit: 0,
      winRate: 0,
      avgProfit: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxProfit: 0,
      maxLoss: 0
    };
  }
  
  const profitable = closedTrades.filter(t => t.profit > 0);
  const losses = closedTrades.filter(t => t.profit < 0);
  
  const totalProfit = closedTrades.reduce((sum, t) => sum + t.profit, 0);
  const grossProfit = profitable.reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
  
  return {
    totalTrades: closedTrades.length,
    totalProfit: totalProfit,
    winRate: (profitable.length / closedTrades.length) * 100,
    avgProfit: profitable.length ? grossProfit / profitable.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    maxProfit: Math.max(...closedTrades.map(t => t.profit), 0),
    maxLoss: Math.min(...closedTrades.map(t => t.profit), 0)
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