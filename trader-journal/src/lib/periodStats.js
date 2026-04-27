/**
 * Срезы закрытых сделок по календарным периодам (dayjs) + мини-equity внутри периода.
 */
import dayjs from 'dayjs';
import { convertUsd } from './fxRate';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function filterClosedInPeriod(closedTrades, period /* 'week'|'month'|'year' */, now = new Date()) {
  if (!Array.isArray(closedTrades)) return [];
  const start = dayjs(now).startOf(period);
  const end = dayjs(now).endOf(period);
  return closedTrades.filter((t) => {
    if (t?.status !== 'closed' || !t?.dateClose) return false;
    const d = dayjs(t.dateClose);
    if (!d.isValid()) return false;
    return !d.isBefore(start) && !d.isAfter(end);
  });
}

/** Баланс (equity) на начало периода: капитал + все закрытые сделки до start. */
export function equityBeforePeriod(closedTrades, period, initialCapital, now = new Date()) {
  const start = dayjs(now).startOf(period);
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
  let eq = num(initialCapital);
  for (const t of sorted) {
    if (dayjs(t.dateClose).isBefore(start)) eq += num(t.profit);
    else break;
  }
  return eq;
}

/**
 * Точки equity внутри периода (для спарклайна): [{ t, equity }] — «сырой» mix USD PnL + капитал в валюте счёта (как старый getEquityCurve).
 * @deprecated для UI предпочтительнее getPeriodEquityStepsAccount
 */
export function getPeriodEquitySteps(closedTrades, period, initialCapital, now = new Date()) {
  const start = dayjs(now).startOf(period);
  const end = dayjs(now).endOf(period);
  let eq = equityBeforePeriod(closedTrades, period, initialCapital, now);
  const inPeriod = filterClosedInPeriod(closedTrades, period, now).sort(
    (a, b) => new Date(a.dateClose) - new Date(b.dateClose)
  );
  const points = [{ t: start.valueOf(), equity: eq }];
  for (const t of inPeriod) {
    eq += num(t.profit);
    points.push({ t: new Date(t.dateClose).getTime(), equity: eq });
  }
  if (points.length === 1) {
    points.push({ t: end.valueOf(), equity: eq });
  }
  return points;
}

/**
 * Equity в валюте счёта: initialCapital + convertUsd(Σ USD PnL до точки).
 * Согласовано с RiskHud.
 */
export function getPeriodEquityStepsAccount(closedTrades, period, initialCapital, rateState, now = new Date()) {
  const start = dayjs(now).startOf(period);
  const end = dayjs(now).endOf(period);
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
  let usdBefore = 0;
  for (const t of sorted) {
    const dc = dayjs(t.dateClose);
    if (!dc.isValid()) continue;
    if (dc.isBefore(start)) usdBefore += num(t.profit);
    else break;
  }
  const cap = num(initialCapital);
  const inPeriod = filterClosedInPeriod(closedTrades, period, now).sort(
    (a, b) => new Date(a.dateClose) - new Date(b.dateClose)
  );
  const points = [{ t: start.valueOf(), equity: cap + convertUsd(usdBefore, rateState) }];
  let usdIn = 0;
  for (const t of inPeriod) {
    usdIn += num(t.profit);
    points.push({ t: new Date(t.dateClose).getTime(), equity: cap + convertUsd(usdBefore + usdIn, rateState) });
  }
  if (points.length === 1) {
    points.push({ t: end.valueOf(), equity: cap + convertUsd(usdBefore, rateState) });
  }
  return points;
}

export function maxDrawdownFromEquitySteps(points) {
  if (!points?.length) return 0;
  let peak = points[0].equity;
  let maxDd = 0;
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

/**
 * Подсчёт ruleViolations по коду за набор сделок.
 * @returns [code, count][]
 */
export function aggregateViolationCodes(trades) {
  const map = new Map();
  for (const t of trades) {
    const arr = t?.ruleViolations;
    if (!Array.isArray(arr)) continue;
    for (const v of arr) {
      const code =
        v && typeof v === 'object' && v.code != null && String(v.code).trim()
          ? String(v.code).trim()
          : '_other';
      map.set(code, (map.get(code) || 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
