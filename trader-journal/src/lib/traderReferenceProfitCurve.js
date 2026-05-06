/**
 * Кумулятивная доходность к депозиту (%) по закрытым сделкам — для справочника / кривой прибыльности.
 */
import dayjs from 'dayjs';

function monthYearLabelRu(d) {
  const raw = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(dayjs(d).toDate());
  return raw.length ? raw[0].toUpperCase() + raw.slice(1) : raw;
}

/**
 * Бинарный поиск: последняя точка с ts ≤ t.
 * @param {{ ts: number; pct: number }[]} series возрастающая по ts
 */
export function pctAtOrBefore(series, t) {
  if (!series.length) return 0;
  let lo = 0;
  let hi = series.length - 1;
  let ans = series[0].pct;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts <= t) {
      ans = series[mid].pct;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * @param {*} closedTrades
 * @param {number} initialCapital
 * @param {(t: *) => number} profitOf закрытый net PnL в валюте отображения
 * @returns {{ ts: number; pct: number }[]}
 */
export function buildCumulativeReturnPctSeries(closedTrades, initialCapital, profitOf) {
  const ic = Number(initialCapital);
  if (!Array.isArray(closedTrades) || !closedTrades.length || !Number.isFinite(ic) || ic <= 0)
    return [];
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(a.dateClose).getTime() - new Date(b.dateClose).getTime());
  if (!sorted.length) return [];

  let cum = 0;
  const headTs = new Date(sorted[0].dateClose).getTime() - 1;
  const out = [{ ts: headTs, pct: 0 }];
  for (const t of sorted) {
    cum += Number(profitOf(t)) || 0;
    out.push({
      ts: new Date(t.dateClose).getTime(),
      pct: (cum / ic) * 100
    });
  }
  return out;
}

/**
 * Календарные месяцы в диапазоне первой закрывающей даты серии до последней: дельта % на месяц.
 */
export function monthBandsFromProfitCurve(series) {
  if (!series || series.length < 2) return [];
  const t0 = series[1]?.ts ?? series[0].ts;
  const t1 = series[series.length - 1].ts;
  let cur = dayjs(t0).startOf('month');
  const endM = dayjs(t1).endOf('month');
  const bands = [];
  while (cur.valueOf() <= endM.valueOf()) {
    const startMs = cur.startOf('month').valueOf();
    const endMs = cur.endOf('month').valueOf();
    const startPct = pctAtOrBefore(series, startMs - 1);
    const endPct = pctAtOrBefore(series, endMs);
    const deltaPct = Math.round((endPct - startPct) * 10) / 10;
    const monthTitle = monthYearLabelRu(cur);
    bands.push({
      startMs,
      endMs,
      deltaPct,
      monthTitle,
      favorable: deltaPct >= 0
    });
    cur = cur.add(1, 'month');
  }
  return bands;
}

/**
 * Локальные экстремумы для подписей на графике; отфильтрованы по минимальному зазору по времени.
 */
export function pickCurveExtremaForLabels(series, minGapMs = 10 * 24 * 60 * 60 * 1000, maxPick = 10) {
  if (!series || series.length < 3) return [];
  /** @type {typeof series} */
  const ext = [];
  for (let i = 2; i < series.length - 1; i++) {
    const a = series[i - 1];
    const b = series[i];
    const c = series[i + 1];
    if ((b.pct > a.pct && b.pct > c.pct) || (b.pct < a.pct && b.pct < c.pct)) {
      ext.push(b);
    }
  }
  if (!ext.length) return [];

  let lastTs = -Infinity - 1;
  const sorted = [...ext].sort((u, v) => u.ts - v.ts);

  let globalMax = series[1];
  let globalMin = series[1];
  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    if (p.pct > globalMax.pct) globalMax = p;
    if (p.pct < globalMin.pct) globalMin = p;
  }

  const must = [];
  const seen = new Set();
  function add(p) {
    if (!p || seen.has(p.ts)) return;
    must.push(p);
    seen.add(p.ts);
  }
  add(series[series.length - 1]);
  add(globalMax);
  add(globalMin);

  const merged = [...must.map((x) => ({ ...x, _prio: true })), ...sorted.map((x) => ({ ...x, _prio: false }))]
    .filter((item, ix, arr) => arr.findIndex((o) => o.ts === item.ts) === ix)
    .sort((x, y) => {
      if (x._prio !== y._prio) return x._prio ? -1 : 1;
      return x.ts - y.ts;
    });

  const out = [];
  for (const p of merged) {
    if (!p._prio && p.ts - lastTs < minGapMs) continue;
    out.push({ ts: p.ts, pct: p.pct });
    lastTs = p.ts;
    if (out.length >= maxPick) break;
  }
  const byTs = [...out].sort((a, b) => a.ts - b.ts);

  const last = series[series.length - 1];
  if (last && !byTs.some((x) => x.ts === last.ts)) {
    if (last.ts - lastTs >= minGapMs * 0.5 || !byTs.length) byTs.push({ ts: last.ts, pct: last.pct });
  }
  return byTs;
}

/** Мин. ширина canvas по числу точек и длительности (пикселей), чтобы «увидеть дистанцию». */
export function profitCurveSuggestedMinWidth(series) {
  if (!series?.length || series.length < 2) return 640;
  const spanMs = Math.max(
    series[series.length - 1].ts - series[0].ts,
    60 * 24 * 60 * 60 * 1000
  );
  const byPoints = Math.max(640, (series.length - 1) * 14);
  const byTime = Math.min(5600, 480 + spanMs / (24 * 60 * 60 * 1000) * 48);
  return Math.min(Math.max(byPoints, byTime), 5600);
}
