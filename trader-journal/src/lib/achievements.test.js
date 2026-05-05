import { describe, it, expect } from 'vitest';
import {
  materialCleanStreakFromNewest,
  chartAttachmentStreakFromNewest,
  journalCalendarStreak,
  getClosedSortedDesc,
  countProfitableIsoWeeks,
  countDayGoalHits,
  advanceAchievementState,
  migrateAchievementState,
  buildAchievementCards,
  defaultAchievementState,
  ACHIEVEMENT_CATALOG
} from './achievements.js';
import { POST_CLOSE_CHART_VIOLATION_CODE } from './risk.js';

const pUsd = (t) => Number(t.profit) || 0;

describe('achievements helpers', () => {
  it('materialCleanStreakFromNewest считает с последней сделки', () => {
    const rows = [
      { status: 'closed', dateClose: '2026-05-10', ruleViolations: [] },
      { status: 'closed', dateClose: '2026-05-09', ruleViolations: [{ severity: 'block', code: 'x' }] }
    ];
    expect(materialCleanStreakFromNewest(rows)).toBe(1);
  });

  it('post-close нарушение не рвёт material-clean streak', () => {
    const rows = [
      { status: 'closed', dateClose: '2026-05-10', ruleViolations: [{ code: POST_CLOSE_CHART_VIOLATION_CODE }] },
      { status: 'closed', dateClose: '2026-05-09', ruleViolations: [] }
    ];
    expect(materialCleanStreakFromNewest(rows)).toBe(2);
  });

  it('chartAttachmentStreakFromNewest', () => {
    const rows = [
      { status: 'closed', dateClose: '2026-05-03', attachments: ['x.png'] },
      { status: 'closed', dateClose: '2026-05-02', attachments: [] }
    ];
    expect(chartAttachmentStreakFromNewest(rows)).toBe(1);
  });

  it('journalCalendarStreak', () => {
    const map = {
      '2026-05-05': { plan: 'xxxxxxxxxxxxxxxx', review: '', lessons: '', mood: '', checklist: {} },
      '2026-05-04': { plan: 'yyyyyyyyyyyyyyyy', review: '', lessons: '', mood: '', checklist: {} }
    };
    expect(journalCalendarStreak(map, new Date('2026-05-05'))).toBe(2);
  });

  it('getClosedSortedDesc по dateClose', () => {
    const rows = [
      { status: 'closed', dateClose: '2026-05-01', profit: 1 },
      { status: 'closed', dateClose: '2026-05-03', profit: 2 },
      { status: 'closed', dateClose: '2026-05-02', profit: 3 }
    ];
    const s = getClosedSortedDesc(rows);
    expect(s.map((t) => t.profit)).toEqual([2, 3, 1]);
  });

  it('countProfitableIsoWeeks: плюс и ≥2 сделок', () => {
    const trades = [
      { status: 'closed', dateClose: '2026-05-04T10:00:00', profit: 10 },
      { status: 'closed', dateClose: '2026-05-05T10:00:00', profit: -3 },
      { status: 'closed', dateClose: '2026-05-06T10:00:00', profit: 5 }
    ];
    expect(countProfitableIsoWeeks(trades, pUsd)).toBe(1);
  });

  it('countProfitableIsoWeeks: одна сделка не считается', () => {
    const trades = [{ status: 'closed', dateClose: '2026-05-04T10:00:00', profit: 50 }];
    expect(countProfitableIsoWeeks(trades, pUsd)).toBe(0);
  });

  it('countDayGoalHits', () => {
    const profile = {
      goalMode: 'amount',
      goalDayValue: 40,
      initialCapital: 10_000
    };
    const trades = [
      { status: 'closed', dateClose: '2026-05-04T10:00:00', profit: 50 },
      { status: 'closed', dateClose: '2026-05-04T15:00:00', profit: -5 }
    ];
    expect(countDayGoalHits(trades, profile, pUsd)).toBe(1);
  });
});

describe('advanceAchievementState', () => {
  it('iron10: один раз пока streak ≥10, сброс при падении', () => {
    const st = defaultAchievementState();
    const hi = { materialCleanStreak: 10, chartStreak: 0, journalStreak: 0, winStreakLen: 0, winStreakKind: 'none', disciplineScore: 50, disciplineTotal: 1 };
    const r1 = advanceAchievementState(st, hi);
    expect(r1.unlocked.some((u) => u.id === 'iron_sequence')).toBe(true);
    expect(r1.next.bump.iron10).toBe(1);
    const r2 = advanceAchievementState(r1.next, hi);
    expect(r2.unlocked.length).toBe(0);
    const lo = { ...hi, materialCleanStreak: 3 };
    const r3 = advanceAchievementState(r2.next, lo);
    expect(r3.next.gates.iron10).toBe(false);
    const r4 = advanceAchievementState(r3.next, hi);
    expect(r4.unlocked.some((u) => u.id === 'iron_sequence')).toBe(true);
    expect(r4.next.bump.iron10).toBe(2);
  });

  it('discStar: повтор после провала ниже порога', () => {
    const st = defaultAchievementState();
    const up = { materialCleanStreak: 0, chartStreak: 0, journalStreak: 0, winStreakLen: 0, winStreakKind: 'none', disciplineScore: 91, disciplineTotal: 15 };
    const r1 = advanceAchievementState(st, up);
    expect(r1.unlocked.some((u) => u.id === 'discipline_star')).toBe(true);
    const mid = { ...up, disciplineScore: 88 };
    const r2 = advanceAchievementState(r1.next, mid);
    expect(r2.next.gates.discStar).toBe(false);
    const r3 = advanceAchievementState(r2.next, up);
    expect(r3.unlocked.some((u) => u.id === 'discipline_star')).toBe(true);
  });
});

describe('migrateAchievementState', () => {
  it('нормализует bump', () => {
    const m = migrateAchievementState({ gates: { iron10: true }, bump: { iron10: '2' } });
    expect(m.bump.iron10).toBe(2);
  });
});

describe('ACHIEVEMENT_CATALOG', () => {
  it('все id уникальны', () => {
    const ids = ACHIEVEMENT_CATALOG.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildAchievementCards', () => {
  it('marathon: при кратности 25 полоса заполнена', () => {
    const st = defaultAchievementState();
    const m = {
      closedCount: 25,
      closed: [],
      materialCleanStreak: 0,
      chartStreak: 0,
      journalStreak: 0,
      winStreakLen: 0,
      winStreakKind: 'none',
      disciplineScore: 100,
      disciplineTotal: 0,
      marathonFloor: 1,
      marathonRemainder: 0,
      profitableWeeks: 0,
      dayGoalHits: 0,
      dayGoalAmount: 0
    };
    const cards = buildAchievementCards(st, m);
    const mar = cards.find((c) => c.id === 'marathon_25');
    expect(mar?.wins).toBe(1);
    expect(mar?.segments.filter(Boolean).length).toBe(25);
  });
});
