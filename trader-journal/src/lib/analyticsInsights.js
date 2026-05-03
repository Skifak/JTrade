/**
 * Сводные метрики для вкладок аналитики (неделя, дневник vs PnL, сетапы, контекст).
 */
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { primaryKillzone, killzoneLabel } from './killzones.js';
import { dayJournalHasContent } from './tradingMentor.js';
import { findPlay, findStrategy } from './playbooks.js';

dayjs.extend(isoWeek);

export { dayJournalHasContent };

const DOW_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Ключ календарной ISO-недели, напр. 2026-W18 */
export function isoWeekKey(date = new Date()) {
  const d = dayjs(date);
  return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
}

/** Старт текущей ISO-недели (понедельник 00:00 локально для dayjs + isoWeek). */
function startOfIsoWeekRef(ref = undefined) {
  return (ref !== undefined ? dayjs(ref) : dayjs()).startOf('isoWeek');
}

/** Закрытые сделки с dateClose в [start, end]. */
export function closedInDateCloseRange(closedTrades, start, end, profitOf) {
  const st = dayjs(start).startOf('day');
  const en = dayjs(end).endOf('day');
  const getP = profitOf || ((t) => num(t?.profit));
  const out = [];
  if (!Array.isArray(closedTrades)) return out;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    const dc = dayjs(t.dateClose);
    if (dc.isBefore(st) || dc.isAfter(en)) continue;
    out.push({ trade: t, pnl: getP(t) });
  }
  return out;
}

export function closedPnLInRange(closedTrades, start, end, profitOf) {
  return closedInDateCloseRange(closedTrades, start, end, profitOf).reduce((s, x) => s + x.pnl, 0);
}

/** Число дней с содержательным дневником в интервале [start, end] по календарным датам. */
export function journalDaysInRange(dayJournalMap, start, end) {
  const map = dayJournalMap && typeof dayJournalMap === 'object' ? dayJournalMap : {};
  let n = 0;
  let d = dayjs(start).startOf('day');
  const last = dayjs(end).startOf('day');
  while (!d.isAfter(last)) {
    const key = d.format('YYYY-MM-DD');
    if (dayJournalHasContent(map[key])) n += 1;
    d = d.add(1, 'day');
  }
  return n;
}

function rollupWeek(closedTrades, weekStart, profitOf, dayJournalMap) {
  const ws = weekStart.startOf('day');
  const we = ws.add(6, 'day').endOf('day');
  const rows = closedInDateCloseRange(closedTrades, ws, we, profitOf);
  let sum = 0;
  let wins = 0;
  for (const { pnl } of rows) {
    sum += pnl;
    if (pnl > 0) wins += 1;
  }
  return {
    weekKey: isoWeekKey(ws.toDate()),
    start: ws.format('YYYY-MM-DD'),
    end: we.format('YYYY-MM-DD'),
    trades: rows.length,
    pnl: sum,
    wins,
    losses: rows.length - wins,
    winRatePct: rows.length ? (100 * wins) / rows.length : 0,
    journalDays: journalDaysInRange(dayJournalMap, ws, we)
  };
}

/**
 * Сравнение текущей ISO-недели с предыдущей.
 * @returns {{ current: object; prev: object; deltas: Record<string, number> }}
 */
export function computeWeekOverWeek(closedTrades, dayJournalMap, profitOf) {
  const curStart = startOfIsoWeekRef();
  const prevStart = curStart.subtract(1, 'week');

  const current = rollupWeek(closedTrades, curStart, profitOf, dayJournalMap);
  const prev = rollupWeek(closedTrades, prevStart, profitOf, dayJournalMap);

  const deltas = {
    trades: current.trades - prev.trades,
    pnl: current.pnl - prev.pnl,
    wins: current.wins - prev.wins,
    winRatePct: current.winRatePct - prev.winRatePct,
    journalDays: current.journalDays - prev.journalDays
  };

  return { current, prev, deltas };
}

function fmtSigned(n, digits = 2) {
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(digits)}`;
}

/** Короткие строки-буллеты по дельтам недели. */
export function buildWeeklyDeltaLines(weekOverWeek) {
  if (!weekOverWeek) return [];
  const { current, prev, deltas } = weekOverWeek;
  const lines = [
    `Недели: ${prev.weekKey} → ${current.weekKey}`,
    `Сделки: было ${prev.trades}, сейчас ${current.trades} (${fmtSigned(deltas.trades, 0)}).`,
    `PnL окна: было ${prev.pnl.toFixed(2)}, сейчас ${current.pnl.toFixed(2)} (${fmtSigned(deltas.pnl)}) у.е.`,
    `Дни с содержательным дневником: было ${prev.journalDays}, сейчас ${current.journalDays} (${fmtSigned(deltas.journalDays, 0)} дн.).`,
    `Винрейт в окне: было ${prev.winRatePct.toFixed(1)}%, сейчас ${current.winRatePct.toFixed(1)}% (${fmtSigned(deltas.winRatePct, 1)} п.п.).`
  ];
  return lines;
}

/** Сводка «дневник vs торговые дни» за последние `days` календарных дней (включая сегодня). */
export function computeJournalVsPnL(closedTrades, dayJournalMap, days = 28, profitOf) {
  const getP = profitOf || ((t) => num(t?.profit));
  const end = dayjs().startOf('day');
  const start = end.subtract(days - 1, 'day');

  let calendarDays = 0;
  let tradeDays = 0;
  let journalDays = 0;
  let Both = 0;
  let profitDays = 0;
  let lossDays = 0;
  let flatDays = 0;

  /** @type {Record<string, number>} */
  const byDayPnL = {};
  const arr = closedInDateCloseRange(closedTrades, start, end, getP);
  for (const { trade, pnl } of arr) {
    const k = dayjs(trade.dateClose).format('YYYY-MM-DD');
    byDayPnL[k] = (byDayPnL[k] || 0) + pnl;
  }

  let journaledLossDays = 0;
  let d = start;
  while (!d.isAfter(end)) {
    calendarDays += 1;
    const key = d.format('YYYY-MM-DD');
    const j = dayJournalHasContent(dayJournalMap?.[key]);
    const hasTrade = Object.prototype.hasOwnProperty.call(byDayPnL, key);
    const pnl = hasTrade ? byDayPnL[key] : 0;
    if (hasTrade) {
      tradeDays += 1;
      if (pnl > 1e-9) profitDays += 1;
      else if (pnl < -1e-9) {
        lossDays += 1;
        if (j) journaledLossDays += 1;
      } else flatDays += 1;
    }
    if (j) journalDays += 1;
    if (j && hasTrade) Both += 1;
    d = d.add(1, 'day');
  }

  const journalOnTradeDaysPct = tradeDays ? (100 * Both) / tradeDays : 0;
  const lossDayJournalPct = lossDays ? (100 * journaledLossDays) / lossDays : 0;

  return {
    windowDays: days,
    calendarDays,
    tradeDays,
    journalDays,
    bothTradeAndJournalDays: Both,
    profitDays,
    lossDays,
    flatDays,
    journalOnTradeDaysPct,
    lossDayJournalPct,
    headline:
      tradeDays === 0
        ? `За ${days} дн. не было ни одной даты закрытия — сравнить с дневником нельзя по сделкам.`
        : `Из ${tradeDays} дн. со сделками в ${journalOnTradeDaysPct.toFixed(
            0
          )}% был содержательный дневник. На минус-днях: ${lossDayJournalPct.toFixed(
            0
          )}% с записью (минус-дней всего ${lossDays}).`,
    tradedWithoutJournal: Math.max(0, tradeDays - Both)
  };
}

/** Короткая подпись ISO-недели для осей графика: «2026-W05» → «W05». */
export function shortIsoWeekLabel(weekKey) {
  const s = String(weekKey || '');
  const m = /W(\d{2})$/.exec(s);
  return m ? `W${m[1]}` : s.slice(-8) || '—';
}

/**
 * Последние `days` календарных дней: дневной net PnL (если были закрытия) и флаги.
 * Для столбчатого графика «PnL по дням» в аналитике.
 */
export function journalPnLDailyBars(closedTrades, dayJournalMap, days = 28, profitOf) {
  const getP = profitOf || ((t) => num(t?.profit));
  const end = dayjs().startOf('day');
  const start = end.subtract(days - 1, 'day');
  /** @type {Record<string, number>} */
  const byDayPnL = {};
  for (const { trade, pnl } of closedInDateCloseRange(closedTrades, start, end, getP)) {
    const k = dayjs(trade.dateClose).format('YYYY-MM-DD');
    byDayPnL[k] = (byDayPnL[k] || 0) + pnl;
  }
  /** @type {{ key: string; label: string; pnl: number | null; hasTrade: boolean; hasJournal: boolean }[]} */
  const out = [];
  let d = start;
  while (!d.isAfter(end)) {
    const key = d.format('YYYY-MM-DD');
    const hasTrade = Object.prototype.hasOwnProperty.call(byDayPnL, key);
    const pnl = hasTrade ? byDayPnL[key] : null;
    const hasJournal = dayJournalHasContent(dayJournalMap?.[key]);
    out.push({
      key,
      label: d.format('D.MM'),
      pnl,
      hasTrade,
      hasJournal
    });
    d = d.add(1, 'day');
  }
  return out;
}

/**
 * Агрегат по связанным (strategyId+playId) сделкам.
 * `strategiesList` — значение из store strategies.
 */
export function computePlaybookEdge(closedTrades, strategiesList, profitOf) {
  const getP = profitOf || ((t) => num(t?.profit));
  if (!Array.isArray(closedTrades)) return [];
  const playMeta = {};
  for (const s of strategiesList || []) {
    for (const p of s?.plays || []) {
      playMeta[`${s.id}:${p.id}`] = {
        strategyName: s.name || '?',
        playName: p.name || '?'
      };
    }
  }
  const map = new Map();
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.strategyId || !t?.playId) continue;
    const key = `${t.strategyId}:${t.playId}`;
    const p = findPlay(strategiesList, t.strategyId, t.playId);
    const strat = findStrategy(strategiesList, t.strategyId);
    if (!map.has(key)) {
      map.set(key, {
        key,
        strategyId: t.strategyId,
        playId: t.playId,
        strategyName: strat?.name || playMeta[key]?.strategyName || '?',
        playName: p?.name || playMeta[key]?.playName || '?',
        count: 0,
        wins: 0,
        losses: 0,
        sum: 0,
        grossWin: 0,
        grossLoss: 0
      });
    }
    const b = map.get(key);
    const pr = getP(t);
    b.count += 1;
    b.sum += pr;
    if (pr > 0) {
      b.wins += 1;
      b.grossWin += pr;
    } else if (pr < 0) {
      b.losses += 1;
      b.grossLoss += -pr;
    }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      winRate: b.count ? (100 * b.wins) / b.count : 0,
      expectancy: b.count ? b.sum / b.count : 0,
      profitFactor: b.grossLoss ? b.grossWin / b.grossLoss : b.grossWin ? Infinity : 0
    }))
    .sort((a, b) => {
      const ea = a.count >= 5 ? a.expectancy : -Infinity;
      const eb = b.count >= 5 ? b.expectancy : -Infinity;
      if (ea !== eb) return eb - ea;
      return b.sum - a.sum;
    });
}

/** Теплокарты по primary killzone (настройки TZ из журнала) и по ISO-дню недели. */
export function computeContextHeatmaps(closedTrades, profitOf, _killzoneTz) {
  const getP = profitOf || ((t) => num(t?.profit));
  /** @type {Map<string | null, { id: string | null; count: number; sum: number; wins: number }>} */
  const kzMap = new Map();
  /** @type {Record<number, { dow: number; label: string; count: number; sum: number; wins: number }>} */
  const dow = {};

  function bumpKz(id, pnl) {
    const k = id === undefined ? null : id;
    const cur = kzMap.get(k) || { id: k, count: 0, sum: 0, wins: 0 };
    cur.count += 1;
    cur.sum += pnl;
    if (pnl > 0) cur.wins += 1;
    kzMap.set(k, cur);
  }

  if (!Array.isArray(closedTrades)) {
    return {
      killzones: [],
      weekdays: [],
      tzNote:
        typeof _killzoneTz === 'string' && _killzoneTz
          ? `Killzones: TZ ${_killzoneTz}`
          : 'Killzones из настроек журнала'
    };
  }

  for (let i = 0; i < closedTrades.length; i++) {
    const t = closedTrades[i];
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    const pnl = getP(t);
    const ref = t.dateOpen || t.dateClose;
    const kz = primaryKillzone(ref);
    bumpKz(kz, pnl);
    const jd = dayjs(t.dateClose);
    const dow0 = jd.day() === 0 ? 7 : jd.day(); // 1..7 Mon-Sun для сортировки
    const label = DOW_RU[dow0 - 1];
    if (!dow[dow0]) dow[dow0] = { dow: dow0, label, count: 0, sum: 0, wins: 0 };
    dow[dow0].count += 1;
    dow[dow0].sum += pnl;
    if (pnl > 0) dow[dow0].wins += 1;
  }

  const killzones = [...kzMap.entries()]
    .map(([, v]) => ({
      ...v,
      label: killzoneLabel(v.id),
      winRatePct: v.count ? (100 * v.wins) / v.count : 0,
      avgPnL: v.count ? v.sum / v.count : 0
    }))
    .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));

  const weekdays = Object.values(dow)
    .sort((a, b) => a.dow - b.dow)
    .map((v) => ({
      ...v,
      winRatePct: v.count ? (100 * v.wins) / v.count : 0,
      avgPnL: v.count ? v.sum / v.count : 0
    }));

  const tzHint =
    typeof _killzoneTz === 'string' && _killzoneTz
      ? `Классификация сессии: TZ «${_killzoneTz}».`
      : 'Классификация сессии: TZ из настроек журнала (fallback America/New_York).';

  return { killzones, weekdays, tzNote: tzHint };
}

const EXPERIMENT_DEFS = [
  {
    key: 'kz_outside_reduction',
    title: 'Сократить торговлю вне primary KZ на неделю',
    when: ({ wow, ctx }) =>
      wow?.prev?.trades >= 4 &&
      wow?.current?.journalDays !== undefined &&
      wow.current.journalDays < 3
  },
  {
    key: 'journal_loss_days',
    title: 'В минус-день — обязательная запись перед новой сделкой следующего дня',
    when: ({ jv }) => jv.lossDays >= 3 && jv.lossDayJournalPct < 50
  },
  {
    key: 'weekly_pnl_journal',
    title: 'Раз в неделю — одна строка «что я перестал делать» в дневнике после сессии',
    when: ({ wow }) => wow?.deltas?.journalDays !== undefined && wow.deltas.journalDays <= 0
  },
  {
    key: 'playbook_under_tagged',
    title:
      'Проставлять strategy/play в каждой сделке — привязки мало или дисперсия по сетапам огромная',
    when: ({ edge, wow }) =>
      (wow?.prev?.trades || 0) + (wow?.current?.trades || 0) >= 12 &&
      (edge.length <= 2 ||
        edge.every((x) => x.expectancy <= 0 && x.count <= 15))
  },
  {
    key: 'reduce_overtrade_week',
    title: 'Не добавлять новых сетапов, пока не нормализован темп недели (+ сравни с предыдущей)',
    when: ({ wow }) =>
      wow?.deltas?.trades !== undefined &&
      wow.deltas.trades >= 5 &&
      (wow?.current?.trades ?? 0) >= 10
  },
  {
    key: 'steady_process_default',
    title: 'Выписать один параметр качества недели и отслеживать его каждый день в одной строке',
    when: () => true
  }
];

/** Выбираем один фокус эксперимента на основе WOOW, журнал ↔ PnL и среза по рядам playbook. */
export function pickWeeklyExperiment(weekOverWeek, journalVsPnlSummary, playbookEdgeRows) {
  const jv =
    journalVsPnlSummary && typeof journalVsPnlSummary === 'object'
      ? journalVsPnlSummary
      : { lossDays: 0, lossDayJournalPct: 100, tradeDays: 0 };
  const edge = Array.isArray(playbookEdgeRows) ? playbookEdgeRows : [];

  const chosen = EXPERIMENT_DEFS.find((def) =>
    typeof def.when === 'function'
      ? def.when({ wow: weekOverWeek, jv, edge, ctx: {} })
      : false
  );

  return {
    experimentKey: chosen.key,
    title: chosen.title,
    rationale:
      'Недельный эксперимент — одно изменение процесса, которое можно проверить следующей сводкой WOOW.'
  };
}

export function experimentLabelForKey(key) {
  const d = EXPERIMENT_DEFS.find((x) => x.key === key);
  return d?.title || String(key || '');
}
