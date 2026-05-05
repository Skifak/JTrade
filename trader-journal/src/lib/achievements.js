/**
 * Достижения журнала: только метрики из сделок, дневника и профиля.
 * Значение WIN и bump хранятся в achievementProgress_v1 (по счёту).
 */
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { writable } from 'svelte/store';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';
import {
  hasMaterialRuleViolations,
  tradeHasChartAttachment,
  computeGoalAmount,
  getCurrentStreak,
  getDisciplineScore
} from './risk.js';
import { dayJournalHasContent } from './tradingMentor.js';

dayjs.extend(isoWeek);

const STORAGE_KEY = 'achievementProgress_v1';

/** @typedef {{ id: string, title: string, body: string }} AchievementUnlock */

export const ACHIEVEMENT_CATALOG = [
  {
    id: 'first_fix',
    title: 'Первая фиксация',
    body: 'Появилась первая закрытая сделка в журнале. Без фиксации нет ни edge, ни честного разбора — это старт измеримой торговли.',
    steps: 1,
    gateKey: null
  },
  {
    id: 'marathon_25',
    title: 'Квартал сделок',
    body: 'Каждые 25 закрытых сделок — отдельный цикл обратной связи: статистика начинает говорить громче случайных выбросов.',
    steps: 25,
    gateKey: null
  },
  {
    id: 'iron_sequence',
    title: 'Железная серия',
    body: 'Десять закрытий подряд без материальных нарушений гейта. Ты удержал план по входу и риску на всей цепочке — это редкость и сила дисциплины.',
    steps: 10,
    gateKey: 'iron10'
  },
  {
    id: 'week_in_green',
    title: 'Неделя в плюсе',
    body: 'ISO-неделя с положительным суммарным результатом и минимум двумя сделками — не одна удачная точка, а устойчивый плюс.',
    steps: 1,
    gateKey: null
  },
  {
    id: 'diary_chain',
    title: 'Нить дневника',
    body: 'Семь календарных дней подряд с содержательной записью в дневнике. Текст фиксирует контекст так же, как свечи — без этого ревью превращается в догадки.',
    steps: 7,
    gateKey: 'diary7'
  },
  {
    id: 'target_day',
    title: 'День по плану',
    body: 'Закрытый дневной PnL достиг или превысил твою числовую цель дня из профиля. Метка того, что цель была реалистичной и рынок её отдал.',
    steps: 1,
    gateKey: null
  },
  {
    id: 'chart_trail',
    title: 'Скрин за скрином',
    body: 'Пятнадцать закрытий подряд с изображением графика во вложениях. Визуал убирает «переписывание» истории при разборе недели спустя.',
    steps: 15,
    gateKey: 'chart15'
  },
  {
    id: 'win_streak_5',
    title: 'Пять побед подряд',
    body: 'Пять прибыльных закрытий подряд (нули пропускаются). Показывает фазу, где исполнение и сетап совпали — не лицензия на переразгон.',
    steps: 5,
    gateKey: 'win5'
  },
  {
    id: 'discipline_star',
    title: 'Стабильная дисциплина',
    body: 'Не меньше 15 закрытых и средняя метрика дисциплины ≥90%: мало «тяжёлых» нарушений относительно объёма выборки.',
    steps: 1,
    gateKey: 'discStar'
  }
];

function weekKeyFromClose(dateClose) {
  return dayjs(dateClose).startOf('isoWeek').format('YYYY-MM-DD');
}

export function getClosedSortedDesc(closedTrades) {
  if (!Array.isArray(closedTrades)) return [];
  return [...closedTrades]
    .filter((t) => t?.status === 'closed' && t?.dateClose)
    .sort((a, b) => new Date(b.dateClose).getTime() - new Date(a.dateClose).getTime());
}

export function materialCleanStreakFromNewest(closedDesc) {
  let n = 0;
  for (const t of closedDesc) {
    if (hasMaterialRuleViolations(t)) break;
    n += 1;
  }
  return n;
}

export function chartAttachmentStreakFromNewest(closedDesc) {
  let n = 0;
  for (const t of closedDesc) {
    if (!tradeHasChartAttachment(t)) break;
    n += 1;
  }
  return n;
}

export function journalCalendarStreak(dayJournalMap, end = new Date()) {
  if (!dayJournalMap || typeof dayJournalMap !== 'object') return 0;
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const key = dayjs(end).subtract(i, 'day').format('YYYY-MM-DD');
    if (dayJournalHasContent(dayJournalMap[key])) n += 1;
    else break;
  }
  return n;
}

export function profitByCloseDay(closedTrades, profitOf) {
  const map = new Map();
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t.dateClose) continue;
    const day = dayjs(t.dateClose).format('YYYY-MM-DD');
    map.set(day, (map.get(day) || 0) + profitOf(t));
  }
  return map;
}

export function countProfitableIsoWeeks(closedTrades, profitOf) {
  const bucket = new Map();
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t.dateClose) continue;
    const wk = weekKeyFromClose(t.dateClose);
    const cur = bucket.get(wk) || { pnl: 0, n: 0 };
    cur.pnl += profitOf(t);
    cur.n += 1;
    bucket.set(wk, cur);
  }
  let wins = 0;
  for (const v of bucket.values()) {
    if (v.pnl > 0 && v.n >= 2) wins += 1;
  }
  return wins;
}

export function countDayGoalHits(closedTrades, profile, profitOf) {
  const goal = computeGoalAmount(profile, 'Day');
  if (!goal || goal <= 0) return 0;
  const byDay = profitByCloseDay(closedTrades, profitOf);
  let n = 0;
  for (const v of byDay.values()) {
    if (v >= goal) n += 1;
  }
  return n;
}

/**
 * @param {any[]} tradesAll
 * @param {any[]} closedDesc
 * @param {Record<string, unknown>} dayJournalMap
 * @param {any} profile
 * @param {(t: any) => number} profitOf
 */
export function buildJournalMetrics(tradesAll, closedDesc, dayJournalMap, profile, profitOf) {
  const closed = closedDesc.length ? closedDesc : getClosedSortedDesc(tradesAll);
  const disc = getDisciplineScore(Array.isArray(tradesAll) ? tradesAll : []);
  const streak = getCurrentStreak(Array.isArray(tradesAll) ? tradesAll : []);
  const winLen = streak.kind === 'win' ? streak.length : 0;

  return {
    closed,
    closedCount: closed.length,
    materialCleanStreak: materialCleanStreakFromNewest(closed),
    chartStreak: chartAttachmentStreakFromNewest(closed),
    journalStreak: journalCalendarStreak(dayJournalMap),
    winStreakLen: winLen,
    winStreakKind: streak.kind,
    disciplineScore: disc.score,
    disciplineTotal: disc.total,
    marathonFloor: Math.floor(closed.length / 25),
    marathonRemainder: closed.length % 25,
    profitableWeeks: countProfitableIsoWeeks(closed, profitOf),
    dayGoalHits: countDayGoalHits(closed, profile, profitOf),
    dayGoalAmount: computeGoalAmount(profile, 'Day')
  };
}

export function defaultAchievementState() {
  return {
    gates: {
      iron10: false,
      chart15: false,
      diary7: false,
      win5: false,
      discStar: false
    },
    bump: {
      iron10: 0,
      chart15: 0,
      diary7: 0,
      win5: 0,
      discStar: 0
    }
  };
}

export function migrateAchievementState(raw) {
  const base = defaultAchievementState();
  if (!raw || typeof raw !== 'object') return base;
  const gates = { ...base.gates, ...(raw.gates && typeof raw.gates === 'object' ? raw.gates : {}) };
  const bump = { ...base.bump, ...(raw.bump && typeof raw.bump === 'object' ? raw.bump : {}) };
  for (const k of Object.keys(base.bump)) {
    const v = Number(bump[k]);
    bump[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  for (const k of Object.keys(base.gates)) {
    gates[k] = !!gates[k];
  }
  return { gates, bump };
}

/**
 * Обновить гейты; вернуть новое состояние и список разблокировок.
 * @param {ReturnType<typeof migrateAchievementState>} state
 * @param {ReturnType<typeof buildJournalMetrics>} m
 * @returns {{ next: typeof state, unlocked: AchievementUnlock[] }}
 */
export function advanceAchievementState(state, m) {
  const next = migrateAchievementState(state);
  const unlocked = /** @type {AchievementUnlock[]} */ ([]);
  const gates = { ...next.gates };
  const bump = { ...next.bump };

  const fire = (gateKey, id, title, body) => {
    if (!gates[gateKey]) {
      gates[gateKey] = true;
      bump[gateKey] = (bump[gateKey] || 0) + 1;
      unlocked.push({ id, title, body });
    }
  };

  const release = (gateKey) => {
    gates[gateKey] = false;
  };

  if (m.materialCleanStreak >= 10) {
    fire('iron10', 'iron_sequence', ACHIEVEMENT_CATALOG.find((x) => x.id === 'iron_sequence').title, ACHIEVEMENT_CATALOG.find((x) => x.id === 'iron_sequence').body);
  } else {
    release('iron10');
  }

  if (m.chartStreak >= 15) {
    fire('chart15', 'chart_trail', ACHIEVEMENT_CATALOG.find((x) => x.id === 'chart_trail').title, ACHIEVEMENT_CATALOG.find((x) => x.id === 'chart_trail').body);
  } else {
    release('chart15');
  }

  if (m.journalStreak >= 7) {
    fire('diary7', 'diary_chain', ACHIEVEMENT_CATALOG.find((x) => x.id === 'diary_chain').title, ACHIEVEMENT_CATALOG.find((x) => x.id === 'diary_chain').body);
  } else {
    release('diary7');
  }

  if (m.winStreakKind === 'win' && m.winStreakLen >= 5) {
    fire('win5', 'win_streak_5', ACHIEVEMENT_CATALOG.find((x) => x.id === 'win_streak_5').title, ACHIEVEMENT_CATALOG.find((x) => x.id === 'win_streak_5').body);
  } else {
    release('win5');
  }

  if (m.disciplineScore >= 90 && m.disciplineTotal >= 15) {
    fire('discStar', 'discipline_star', ACHIEVEMENT_CATALOG.find((x) => x.id === 'discipline_star').title, ACHIEVEMENT_CATALOG.find((x) => x.id === 'discipline_star').body);
  } else {
    release('discStar');
  }

  return { next: { gates, bump }, unlocked };
}

function catalogRow(id) {
  return ACHIEVEMENT_CATALOG.find((x) => x.id === id);
}

/**
 * Карточки для UI: wins, сегменты, подписи прогресса.
 * @param {ReturnType<typeof migrateAchievementState>} state
 * @param {ReturnType<typeof buildJournalMetrics>} m
 */
export function buildAchievementCards(state, m) {
  const st = migrateAchievementState(state);
  const cards = [];

  const closedN = m.closedCount;
  const firstWins = closedN >= 1 ? 1 : 0;
  cards.push({
    ...catalogRow('first_fix'),
    wins: firstWins,
    progressLabel: `${Math.min(1, closedN)}/1`,
    segments: Array.from({ length: 1 }, (_, i) => i < Math.min(1, closedN))
  });

  const marathonFill = closedN > 0 && m.marathonRemainder === 0 ? 25 : m.marathonRemainder;
  cards.push({
    ...catalogRow('marathon_25'),
    wins: m.marathonFloor,
    progressLabel:
      closedN > 0 && m.marathonRemainder === 0 ? `25/25` : `${m.marathonRemainder}/25`,
    segments: Array.from({ length: 25 }, (_, i) => i < marathonFill)
  });

  const ironProg = Math.min(10, m.materialCleanStreak);
  cards.push({
    ...catalogRow('iron_sequence'),
    wins: st.bump.iron10 || 0,
    progressLabel: `${ironProg}/10`,
    segments: Array.from({ length: 10 }, (_, i) => i < ironProg)
  });

  const wk = m.profitableWeeks;
  cards.push({
    ...catalogRow('week_in_green'),
    wins: wk,
    progressLabel: `${wk}`,
    segments: [wk > 0]
  });

  const jn = Math.min(7, m.journalStreak);
  cards.push({
    ...catalogRow('diary_chain'),
    wins: st.bump.diary7 || 0,
    progressLabel: `${jn}/7`,
    segments: Array.from({ length: 7 }, (_, i) => i < jn)
  });

  const dg = m.dayGoalAmount;
  const dgh = m.dayGoalHits;
  cards.push({
    ...catalogRow('target_day'),
    wins: dgh,
    progressLabel: dg > 0 ? `${dgh} дн.` : '— цель дня 0',
    segments: [dgh > 0]
  });

  const ch = Math.min(15, m.chartStreak);
  cards.push({
    ...catalogRow('chart_trail'),
    wins: st.bump.chart15 || 0,
    progressLabel: `${ch}/15`,
    segments: Array.from({ length: 15 }, (_, i) => i < ch)
  });

  const w5 = Math.min(5, m.winStreakKind === 'win' ? m.winStreakLen : 0);
  cards.push({
    ...catalogRow('win_streak_5'),
    wins: st.bump.win5 || 0,
    progressLabel: `${w5}/5`,
    segments: Array.from({ length: 5 }, (_, i) => i < w5)
  });

  const discReady = m.disciplineScore >= 90 && m.disciplineTotal >= 15 ? 1 : 0;
  cards.push({
    ...catalogRow('discipline_star'),
    wins: st.bump.discStar || 0,
    progressLabel: `${m.disciplineTotal} сделок · ${Math.round(m.disciplineScore)}%`,
    segments: [discReady > 0]
  });

  for (const c of cards) {
    c.hasWonEver = c.wins > 0;
  }

  return cards;
}

function saveState(data) {
  saveAccountData(STORAGE_KEY, data);
}

function loadState() {
  return migrateAchievementState(loadAccountData(STORAGE_KEY, null));
}

function createAchievementStore() {
  const initial = loadState();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    rehydrate() {
      set(loadState());
    },
    /**
     * Пересчитать гейты и сохранить.
     * @returns {AchievementUnlock[]}
     */
    tick(tradesAll, dayJournalMap, profile, profitOf) {
      const closedDesc = getClosedSortedDesc(tradesAll.filter((t) => t?.status === 'closed'));
      const m = buildJournalMetrics(tradesAll, closedDesc, dayJournalMap, profile, profitOf);
      let unlocked = [];
      update((prev) => {
        const { next, unlocked: u } = advanceAchievementState(prev, m);
        unlocked = u;
        saveState(next);
        return next;
      });
      return unlocked;
    }
  };
}

export const achievementProgress = createAchievementStore();

activeJournalAccountId.subscribe(() => {
  achievementProgress.rehydrate();
});
