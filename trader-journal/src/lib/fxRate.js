/**
 * Реактивный курс USD → валюта счёта пользователя.
 *
 * Зачем: внутри приложения PnL по сделкам считается в USD (`calculateProfit`),
 * а профиль/лимиты/цели хранятся в выбранной валюте счёта. Чтобы UI не врал
 * («10 USD» под ярлыком €), все суммы PnL, флоат, стрики проходят через
 * `formatMoney(usdAmount, $fxRate)` или `convertUsd(usdAmount, $fxRate)`.
 *
 *   subscribe → { rate, source, target, updatedAt, loading }
 *
 *   rate     — множитель: amountInTarget = amountInUsd * rate
 *   target   — валюта счёта (UPPERCASE)
 *   source   — 'identity' | 'live' | 'binance' | 'binance+frankfurter' | 'usdt-proxy' | 'unavailable'
 *
 * Курс обновляется:
 *  - при смене `userProfile.accountCurrency`
 *  - принудительно через `fxRate.refresh()`
 *  - раз в FX_REFRESH_MS, чтобы не устаревал в долгоживущей сессии
 */
import { writable, get } from 'svelte/store';
import { userProfile } from './stores';
import { getConversionQuote, isMt5DepositCurrencyProfit, isMt5HistoryImportedTrade } from './utils';

const FX_REFRESH_MS = 5 * 60 * 1000;

const _state = writable({
  rate: 1,
  source: 'identity',
  target: 'USD',
  updatedAt: null,
  loading: false
});

let inflight = null;
let lastTarget = null;

async function fetchAndSet(target) {
  if (!target) target = 'USD';
  if (target === 'USD') {
    _state.set({ rate: 1, source: 'identity', target: 'USD', updatedAt: Date.now(), loading: false });
    return;
  }
  _state.update((s) => ({ ...s, loading: true }));
  const quote = await getConversionQuote('USD', target);
  if (quote && Number.isFinite(quote.rate) && quote.rate > 0) {
    _state.set({
      rate: quote.rate,
      source: quote.source,
      target,
      updatedAt: Date.now(),
      loading: false
    });
  } else {
    _state.set({
      rate: 1,
      source: 'unavailable',
      target,
      updatedAt: Date.now(),
      loading: false
    });
  }
}

function refresh(target) {
  const t = target || lastTarget || 'USD';
  if (inflight) return inflight;
  inflight = fetchAndSet(t).finally(() => {
    inflight = null;
  });
  return inflight;
}

// Подписка на смену валюты в профиле.
userProfile.subscribe((p) => {
  const next = (p?.accountCurrency || 'USD').toUpperCase();
  if (next !== lastTarget) {
    lastTarget = next;
    refresh(next);
  }
});

// Периодический рефреш — чтобы за день курс не убежал.
if (typeof window !== 'undefined') {
  setInterval(() => refresh(lastTarget), FX_REFRESH_MS);
}

export const fxRate = {
  subscribe: _state.subscribe,
  refresh: () => refresh(lastTarget),
  /** Один раз получить snapshot (для функций вне Svelte-реактивности). */
  snapshot: () => get(_state)
};

/** USD-сумму перевести в валюту счёта. NaN/null → 0. */
export function convertUsd(usdAmount, rateState) {
  const a = Number(usdAmount);
  if (!Number.isFinite(a)) return 0;
  const r = Number(rateState?.rate);
  return a * (Number.isFinite(r) && r > 0 ? r : 1);
}

/**
 * Сумма из trade для отображения / эквити в валюте счёта:
 * - MT5 history: колонка «Прибыль» + комиссия + своп (как движение баланса / «Средства»).
 * - MT5 trade (открытые): только «Прибыль» в депозите; своп обычно уже в плавающей или отдельно — без двойного сложения.
 * - Остальное: USD из calculateProfit → × курс.
 */
export function tradeProfitDisplayUnits(trade, rateState) {
  if (isMt5HistoryImportedTrade(trade)) {
    const p = Number(trade?.profit);
    const base = Number.isFinite(p) ? p : 0;
    const c = Number(trade?.commission) || 0;
    const s = Number(trade?.swap) || 0;
    return base + c + s;
  }
  const p = Number(trade?.profit);
  if (!Number.isFinite(p)) return 0;
  if (isMt5DepositCurrencyProfit(trade)) return p;
  return convertUsd(p, rateState);
}

const SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'Fr',
  CAD: 'C$',
  AUD: 'A$',
  NZD: 'NZ$',
  USDT: 'USDT',
  BTC: '₿'
};

export function currencySymbol(code) {
  if (!code) return '$';
  return SYMBOLS[String(code).toUpperCase()] || code;
}

/** Сколько знаков после запятой имеет смысл показывать для валюты. */
export function decimalsFor(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'BTC') return 6;
  if (c === 'JPY') return 0;
  return 2;
}

/**
 * Отформатировать USD-сумму в валюту счёта строкой "12.34 €".
 * `rateState` = $fxRate (или fxRate.snapshot()).
 */
export function formatMoney(usdAmount, rateState, opts = {}) {
  const target = rateState?.target || 'USD';
  const decimals = opts.decimals != null ? opts.decimals : decimalsFor(target);
  const value = convertUsd(usdAmount, rateState);
  const sign = opts.signed && value > 0 ? '+' : '';
  const sym = currencySymbol(target);
  return `${sign}${value.toFixed(decimals)} ${sym}`;
}

/**
 * Перевести сумму, ИЗНАЧАЛЬНО заданную в валюте счёта (например лимит риска
 * из профиля), в строковое представление с символом. Без конвертации —
 * нужна для единообразия отображения.
 */
export function formatAccountMoney(amount, rateState, opts = {}) {
  const target = rateState?.target || 'USD';
  const decimals = opts.decimals != null ? opts.decimals : decimalsFor(target);
  const value = Number(amount) || 0;
  const sign = opts.signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)} ${currencySymbol(target)}`;
}
