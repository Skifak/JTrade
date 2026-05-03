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

/** Сводка по ISO-неделе по ключу вида «2026-W18». */
export function rollupIsoWeek(closedTrades, weekKeyStr, profitOf, dayJournalMap) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKeyStr || '').trim());
  if (!m) return null;
  const isoYear = parseInt(m[1], 10);
  const isoW = parseInt(m[2], 10);
  if (!Number.isFinite(isoYear) || !Number.isFinite(isoW)) return null;
  // 4 янв. всегда в ISO-неделе 1 своего ISO-года; без цепочки isoWeekYear→isoWeek (в части сборок ломается).
  const anchor = dayjs(`${isoYear}-01-04`);
  if (!anchor.isValid()) return null;
  const weekStart = anchor.isoWeek(isoW).startOf('isoWeek');
  return rollupWeek(closedTrades, weekStart, profitOf, dayJournalMap);
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

/** Закрытые сделки с dateClose внутри ISO-недели по ключу «YYYY-Www». */
export function closedTradesForIsoWeek(closedTrades, weekKeyStr, profitOf) {
  const rollup = rollupIsoWeek(closedTrades, weekKeyStr, profitOf, {});
  if (!rollup?.start || !rollup?.end) return [];
  const ws = dayjs(rollup.start).startOf('day');
  const we = dayjs(rollup.end).endOf('day');
  const getP = profitOf || ((t) => num(t?.profit));
  return closedInDateCloseRange(closedTrades, ws, we, getP).map(({ trade }) => trade);
}

function tradeEffectiveKzId(trade) {
  return trade?.killzone || primaryKillzone(trade?.dateOpen) || '_OUT';
}

/** Минус-дни со сделками и доля с дневником на календарном интервале недели (по дате закрытия). */
function lossDayJournalStatsInCalendarRange(closedTradesInRange, dayJournalMap, startStr, endStr, profitOf) {
  const start = dayjs(startStr).startOf('day');
  const end = dayjs(endStr).startOf('day');
  const endDayEnd = dayjs(endStr).endOf('day');
  const getP = profitOf || ((t) => num(t?.profit));
  /** @type {Record<string, number>} */
  const byDayPnL = {};
  if (!Array.isArray(closedTradesInRange)) {
    return { lossDays: 0, journaledLossDays: 0, lossDayJournalPct: null };
  }
  for (const trade of closedTradesInRange) {
    if (trade?.status !== 'closed' || !trade?.dateClose) continue;
    const dc = dayjs(trade.dateClose);
    if (dc.isBefore(start) || dc.isAfter(endDayEnd)) continue;
    const k = dc.format('YYYY-MM-DD');
    byDayPnL[k] = (byDayPnL[k] || 0) + getP(trade);
  }
  let lossDays = 0;
  let journaledLossDays = 0;
  let d = start;
  while (!d.isAfter(end)) {
    const key = d.format('YYYY-MM-DD');
    const hasTrade = Object.prototype.hasOwnProperty.call(byDayPnL, key);
    const pnl = hasTrade ? byDayPnL[key] : 0;
    if (hasTrade && pnl < -1e-9) {
      lossDays += 1;
      if (dayJournalHasContent(dayJournalMap?.[key])) journaledLossDays += 1;
    }
    d = d.add(1, 'day');
  }
  const lossDayJournalPct = lossDays ? (100 * journaledLossDays) / lossDays : null;
  return { lossDays, journaledLossDays, lossDayJournalPct };
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
    title: 'Меньше сделок «между сессиями» — когда рынок не в твоих рабочих окнах',
    metricHint:
      'Считаем: сколько закрытых помечены «Вне KZ» и сколько раз сессия в сделке не совпала с тем, что приложение определило по времени открытия.',
    description:
      'В «Параметры журнала» ты задаёшь часы торговых сессий (Лондон, Нью-Йорк и т.д.). В таблице сделок в колонке «KZ» видно, в какое окно попал вход: либо ты выбрал сессию сам, либо приложение поставило её по времени. «Вне KZ» — вход вне любого из этих окон. Цель недели — уменьшить такие сделки и не торговать «на автопилоте» вне своего плана по времени.',
    when: ({ wow, ctx }) =>
      wow?.prev?.trades >= 4 &&
      wow?.current?.journalDays !== undefined &&
      wow.current.journalDays < 3
  },
  {
    key: 'journal_loss_days',
    title: 'Убыточный день — обязательно запиши в дневник, прежде чем снова активно торговать',
    metricHint:
      'Считаем: сколько дней за неделю закончились минусом по сумме сделок и в скольких из них есть нормальная запись в дневнике.',
    description:
      'Убыточный день здесь — это календарный день, когда у тебя были закрытия и сумма результата за этот день отрицательная (как если сложить все сделки за эту дату). Задача простая: не оставлять такие дни без разбора в дневнике — хотя бы коротко, что пошло не так. Приложение само покажет, сколько таких дней было и в скольких ты действительно написал дневник.',
    when: ({ jv }) => jv.lossDays >= 3 && jv.lossDayJournalPct < 50
  },
  {
    key: 'weekly_pnl_journal',
    title: 'После торговли — короткая запись в дневнике (что сработало / что убрать)',
    metricHint:
      'Считаем: сколько дней подряд недели ты реально заполнил дневник и сколько дней на неделе вообще были закрытия.',
    description:
      'Смысл в привычке: в день, когда ты торгуешь или закрываешь сделки, не заканчивать без одной честной строки в дневнике. Не нужно писать лонгрид — достаточно плана, итога или урока, как ты уже делаешь в разделе «Дневник». Приложение покажет, насколько часто дневник был в те дни, когда были сделки.',
    when: ({ wow }) => wow?.deltas?.journalDays !== undefined && wow.deltas.journalDays <= 0
  },
  {
    key: 'playbook_under_tagged',
    title: 'В каждой сделке указывай стратегию и сетап из плейбука — чтобы статистика не врала',
    metricHint:
      'Считаем: какая доля закрытых за неделю с полностью заполненными полями «стратегия» и «сетап» в форме сделки.',
    description:
      'В форме сделки можно выбрать связку из раздела «Плейбуки»: какая это стратегия и какой конкретный сетап. Если их не ставить, в аналитике невозможно понять, какой сценарий реально работает. Цель недели — привыкнуть заполнять оба поля у большинства закрытых сделок.',
    when: ({ edge, wow }) =>
      (wow?.prev?.trades || 0) + (wow?.current?.trades || 0) >= 12 &&
      (edge.length <= 2 ||
        edge.every((x) => x.expectancy <= 0 && x.count <= 15))
  },
  {
    key: 'reduce_overtrade_week',
    title: 'Снизить темп: не превращать неделю в гонку за количеством сделок',
    metricHint:
      'Считаем: сколько сделок закрыто за текущую неделю и (если смотришь эту же неделю в аналитике) насколько это больше или меньше, чем на прошлой.',
    description:
      'Иногда проблема не в «новой идее», а в том, что слишком много входов за короткий срок. Фокус — осознанно удержать или снизить число закрытий по сравнению с прошлой неделей, не добавляя новых сетапов, пока не стабилизируется дисциплина. Цифры сравнения видны здесь и на вкладке «Неделя» в аналитике.',
    when: ({ wow }) =>
      wow?.deltas?.trades !== undefined &&
      wow.deltas.trades >= 5 &&
      (wow?.current?.trades ?? 0) >= 10
  },
  {
    key: 'steady_process_default',
    title: 'Один простой критерий недели и ежедневная отметка в дневнике',
    metricHint:
      'Считаем автоматически: сколько закрытий за неделю, сколько дней с записями в дневнике и суммарный результат недели в деньгах. Сам критерий качества формулируешь ты.',
    description:
      'Универсальный вариант, если не хочется «под капот». Придумай одну понятную тебе метрику недели — например «не входил без плана», «только два сетапа» или пункт из чеклиста дня — и каждый вечер отмечай в дневнике, выдержал или нет. Сверху приложение покажет базовые цифры недели (сделки, дневник, итог в деньгах), чтобы было с чем свериться.',
    when: () => true
  }
];

/**
 * Развёрнутое описание фокуса недели для карточки аналитики.
 */
export function experimentLongDescription(key) {
  const d = EXPERIMENT_DEFS.find((x) => x.key === key);
  return d?.description || d?.metricHint || '';
}

/** @param {number} n @returns {number} */
function clampProgressPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Оценка итога недели эксперимента по сводке rollup и фактическим сделкам недели.
 * @param {string} experimentKey
 * @param {object} rollup
 * @param {{ tradesInWeek?: any[]; dayJournalMap?: Record<string, unknown>; wow?: object; profitOf?: (t: unknown) => number }} [ctx]
 * @returns {{ verdict: 'up'|'flat'|'down'|'manual'; lines: string[]; progress: { pct: number | null; caption: string } }}
 */
export function evaluateWeeklyExperimentOutcome(experimentKey, rollup, ctx = {}) {
  const r = rollup && typeof rollup === 'object' ? rollup : {};
  const jd = Number(r.journalDays) || 0;
  const tr = Number(r.trades) || 0;
  const pnl = Number(r.pnl) || 0;
  const lines = [];
  const trades = Array.isArray(ctx.tradesInWeek) ? ctx.tradesInWeek : [];
  const djMap = ctx.dayJournalMap && typeof ctx.dayJournalMap === 'object' ? ctx.dayJournalMap : {};
  const wow = ctx.wow;
  const profitOf = ctx.profitOf || ((t) => num(t?.profit));
  const wowAligned =
    wow?.current?.weekKey && r.weekKey && String(wow.current.weekKey) === String(r.weekKey);

  switch (experimentKey) {
    case 'journal_loss_days': {
      lines.push(`Дней с нормальной записью в дневнике за эту неделю: ${jd}.`);
      let lossDays = 0;
      let jl = 0;
      let pct = null;
      if (r.start && r.end) {
        const st = lossDayJournalStatsInCalendarRange(trades, djMap, r.start, r.end, profitOf);
        lossDays = st.lossDays;
        jl = st.journaledLossDays;
        pct = st.lossDayJournalPct;
      }
      if (lossDays > 0 && pct != null) {
        lines.push(
          `Дней, когда сумма сделок за день вышла в минус: ${lossDays}. В скольких из них есть дневник: ${jl} (это ${pct.toFixed(0)}% таких дней).`
        );
      } else if (tr > 0 && lossDays === 0) {
        lines.push('За эту неделю не было дней с отрицательным итогом по сделкам за календарный день.');
      }
      let verdict = 'flat';
      if (lossDays >= 2 && pct != null) {
        if (pct >= 55) verdict = 'up';
        else if (pct >= 30) verdict = 'flat';
        else verdict = 'down';
      } else if (jd >= 4) verdict = 'up';
      else if (jd >= 2) verdict = 'flat';
      else verdict = 'down';
      /** @type {{ pct: number | null; caption: string }} */
      let progress;
      if (lossDays >= 2 && pct != null) {
        progress = {
          pct: clampProgressPct(pct),
          caption: `Минус-дни с разбором в дневнике: ${pct.toFixed(0)}%`
        };
      } else if (tr > 0 && lossDays === 0) {
        progress = {
          pct: clampProgressPct(78 + jd * 3),
          caption: 'Убыточных календарных дней не было'
        };
      } else {
        progress = {
          pct: clampProgressPct((jd / 6) * 100),
          caption: `Содержательных дней дневника: ${jd}`
        };
      }
      return { verdict, lines, progress };
    }
    case 'weekly_pnl_journal': {
      const dayKeys = new Set(trades.map((t) => dayjs(t.dateClose).format('YYYY-MM-DD')));
      const tradeDays = dayKeys.size;
      lines.push(`Дней с заполненным дневником за неделю: ${jd}.`);
      lines.push(`Дней, когда была хотя бы одна закрытая сделка: ${tradeDays}.`);
      let verdict = 'flat';
      if (jd >= 4) verdict = 'up';
      else if (jd >= 2) verdict = 'flat';
      else verdict = 'down';
      /** @type {{ pct: number | null; caption: string }} */
      const progress =
        tradeDays <= 0
          ? {
              pct: clampProgressPct((jd / 7) * 100),
              caption: `Дней с дневником: ${jd} (ещё без закрытых за неделю)`
            }
          : {
              pct: clampProgressPct(Math.min(100, (jd / tradeDays) * 100)),
              caption: `Дневник: ${jd} дн. при ${tradeDays} дн. со сделками`
            };
      return { verdict, lines, progress };
    }
    case 'reduce_overtrade_week': {
      lines.push(`Закрытых сделок за эту неделю: ${tr}.`);
      if (wowAligned && wow?.prev?.trades != null) {
        const prev = Number(wow.prev.trades) || 0;
        const delta = tr - prev;
        lines.push(`На прошлой неделе закрыто было: ${prev}. Разница с прошлой неделей: ${delta >= 0 ? '+' : ''}${delta}.`);
        let verdict = 'flat';
        if (delta <= 0 || tr < prev) verdict = 'up';
        else if (delta <= 3) verdict = 'flat';
        else verdict = 'down';
        const pacePct =
          delta <= 0 ? 92 : delta <= 2 ? 68 : delta <= 5 ? 48 : delta <= 10 ? 28 : 12;
        const progress = {
          pct: clampProgressPct(pacePct),
          caption: `К прошлой неделе: ${delta >= 0 ? '+' : ''}${delta} закрытых`
        };
        return { verdict, lines, progress };
      }
      if (tr <= 10) lines.push('Темп недели умеренный. Полное сравнение с прошлой неделей — на вкладке «Неделя», когда открыта текущая неделя.');
      else if (tr <= 16) lines.push('Темп высокий — загляни во вкладку «Неделя» и проверь, не раздувается ли количество входов.');
      else lines.push('Очень много закрытий за неделю — имеет смысл сознательно снизить число сделок до следующей недели.');
      const verdict = tr <= 12 ? 'up' : tr <= 18 ? 'flat' : 'down';
      const progress = {
        pct: clampProgressPct(100 - Math.max(0, tr - 8) * 4.8),
        caption: `Закрыто за неделю: ${tr} (ожидание — умеренный темп)`
      };
      return { verdict, lines, progress };
    }
    case 'playbook_under_tagged': {
      let tagged = 0;
      for (const t of trades) {
        if (t?.strategyId && t?.playId) tagged += 1;
      }
      lines.push(`Всего закрытых за неделю: ${tr}.`);
      if (tr === 0) {
        return {
          verdict: 'flat',
          lines,
          progress: {
            pct: null,
            caption: 'Пока нет закрытых — шкала появится после первых сделок'
          }
        };
      }
      const pct = (100 * tagged) / tr;
      lines.push(`Из них с выбранными в форме стратегией и сетапом из плейбука: ${tagged} (${pct.toFixed(0)}%).`);
      let verdict = 'flat';
      if (pct >= 85) verdict = 'up';
      else if (pct >= 55) verdict = 'flat';
      else verdict = 'down';
      const progress = {
        pct: clampProgressPct(pct),
        caption: `${pct.toFixed(0)}% сделок со стратегией и сетапом из плейбука`
      };
      return { verdict, lines, progress };
    }
    case 'kz_outside_reduction': {
      let outN = 0;
      let mismatch = 0;
      for (const t of trades) {
        if (tradeEffectiveKzId(t) === '_OUT') outN += 1;
        const pk = primaryKillzone(t?.dateOpen);
        if (t?.killzone && pk && String(t.killzone) !== String(pk)) mismatch += 1;
      }
      const outPct = tr ? (100 * outN) / tr : 0;
      const misPct = tr ? (100 * mismatch) / tr : 0;
      lines.push(`Всего закрытых за неделю: ${tr}.`);
      lines.push(
        `Помечены как «Вне KZ» (время входа не попало ни в одну твою сессию из настроек): ${outN} (${outPct.toFixed(0)}%).`
      );
      lines.push(
        `Ты сам указал другую сессию, чем приложение по времени открытия: ${mismatch} сделок (${misPct.toFixed(0)}%) — проверь, не ошибка ли это или сознательный выбор.`
      );
      if (tr === 0) {
        return {
          verdict: 'flat',
          lines,
          progress: {
            pct: null,
            caption: 'Нет закрытых за неделю — нечего оценивать по окнам'
          }
        };
      }
      let verdict = 'flat';
      if (outPct <= 15 && tr >= 3) verdict = 'up';
      else if (outPct <= 35) verdict = 'flat';
      else verdict = 'down';
      const insidePct = clampProgressPct(100 - outPct);
      const progress = {
        pct: insidePct,
        caption: `${insidePct.toFixed(0)}% входов внутри своих рабочих окон (не «Вне KZ»)`
      };
      return { verdict, lines, progress };
    }
    case 'steady_process_default': {
      lines.push(
        `За неделю: закрытых сделок ${tr}; дней с дневником ${jd}; суммарный результат по закрытым за неделю ${pnl.toFixed(2)} у.е.`
      );
      lines.push('Свой обещанный критерий недели проверь по карточкам дней в разделе «Дневник».');
      let verdict = 'flat';
      if (jd >= 4 && tr <= 24) verdict = 'up';
      else if (jd >= 2) verdict = 'flat';
      else verdict = 'down';
      const jdScore = clampProgressPct((jd / 7) * 100);
      const trScore = tr <= 18 ? 100 : tr <= 26 ? 72 : 45;
      const progress = {
        pct: clampProgressPct(jdScore * 0.58 + trScore * 0.42),
        caption: `Дневник ${jd}/7 дн. · закрытий ${tr}`
      };
      return { verdict, lines, progress };
    }
    default:
      lines.push(`За неделю: закрытых ${tr}, дней с дневником ${jd}, сумма по закрытым ${pnl.toFixed(2)} у.е.`);
      lines.push('Сверься с вкладкой «Неделя» в аналитике и со своей формулировкой цели.');
      return {
        verdict: 'manual',
        lines,
        progress: {
          pct: null,
          caption: 'Своя цель недели — оценка только у тебя; ниже базовые цифры в списке'
        }
      };
  }
}

export function experimentMetricHint(key) {
  const d = EXPERIMENT_DEFS.find((x) => x.key === key);
  return d?.metricHint || '';
}

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
    rationale: chosen.description || chosen.metricHint,
    metricHint: chosen.metricHint,
    description: chosen.description || ''
  };
}

export function experimentLabelForKey(key) {
  const d = EXPERIMENT_DEFS.find((x) => x.key === key);
  return d?.title || String(key || '');
}
