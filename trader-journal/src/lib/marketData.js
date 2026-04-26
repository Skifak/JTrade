/**
 * Получение текущей рыночной цены по символу.
 *
 * - Крипто (BTCUSD, ETHUSD и т.п.) → Binance public API.
 * - FX (EURUSD, USDJPY и т.п.) и металлы (XAU/XAG) → FCSAPI (требует ключ).
 *
 * Возвращает: { price, source, symbol, timestamp }
 *   либо     : { error, source } при ошибке/нет ключа.
 */
import { normalizeSymbolKey } from './constants';

const CRYPTO_BASES = [
  'BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'DOGE', 'ADA', 'DOT', 'LINK',
  'AVAX', 'BNB', 'MATIC', 'TRX', 'SHIB', 'TON', 'UNI', 'ATOM', 'NEAR', 'APT', 'SUI'
];

function isCrypto(key) {
  if (!key.endsWith('USD') && !key.endsWith('USDT')) return false;
  return CRYPTO_BASES.some((base) => key.startsWith(base));
}

function isMetal(key) {
  return key.startsWith('XAU') || key.startsWith('XAG');
}

function isFx(key) {
  return /^[A-Z]{6}$/.test(key) && !isCrypto(key) && !isMetal(key);
}

function toBinanceSymbol(key) {
  if (key.endsWith('USDT')) return key;
  if (key.endsWith('USD')) return key.slice(0, -3) + 'USDT';
  return key;
}

function toFcsapiSymbol(key) {
  if (key.length === 6) return `${key.slice(0, 3)}/${key.slice(3, 6)}`;
  return key;
}

async function fetchFromBinance(key, apiKey) {
  const symbol = toBinanceSymbol(key);
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      apiKey ? { headers: { 'X-MBX-APIKEY': apiKey } } : undefined
    );
    if (!response.ok) {
      return { error: `Binance HTTP ${response.status}`, source: 'binance' };
    }
    const data = await response.json();
    const price = Number(data?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: 'Binance: некорректный ответ', source: 'binance' };
    }
    return { price, source: 'binance', symbol, timestamp: Date.now() };
  } catch (err) {
    return { error: `Binance: ${err?.message || 'сеть недоступна'}`, source: 'binance' };
  }
}

async function fetchFromFcsapi(key, apiKey) {
  if (!apiKey) {
    return { error: 'FCSAPI: ключ не задан в профиле', source: 'fcsapi' };
  }
  const symbol = toFcsapiSymbol(key);
  try {
    const response = await fetch(
      `https://fcsapi.com/api-v3/forex/latest?symbol=${encodeURIComponent(symbol)}&access_key=${encodeURIComponent(apiKey)}`
    );
    if (!response.ok) {
      return { error: `FCSAPI HTTP ${response.status}`, source: 'fcsapi' };
    }
    const data = await response.json();
    if (!data?.status) {
      return { error: `FCSAPI: ${data?.msg || 'ошибка ответа'}`, source: 'fcsapi' };
    }
    const item = Array.isArray(data.response) ? data.response[0] : null;
    const price = Number(item?.c);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: 'FCSAPI: цена не найдена в ответе', source: 'fcsapi' };
    }
    return { price, source: 'fcsapi', symbol, timestamp: Date.now() };
  } catch (err) {
    return { error: `FCSAPI: ${err?.message || 'сеть недоступна'}`, source: 'fcsapi' };
  }
}

/**
 * @param {string} pair
 * @param {{ binanceKey?: string, fcsapiKey?: string }} [keys]
 */
export async function fetchMarketPrice(pair, keys = {}) {
  const key = normalizeSymbolKey(pair);
  if (!key) return { error: 'Не указана пара', source: null };

  if (isCrypto(key)) return fetchFromBinance(key, keys.binanceKey);
  if (isFx(key) || isMetal(key)) return fetchFromFcsapi(key, keys.fcsapiKey);

  return { error: `Тип инструмента ${key} не поддерживается для live-цены`, source: null };
}
