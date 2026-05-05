import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TEMPLATES } from './constants';
import { removeScopeDir } from './attachmentApi';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';
import { migrateTemplatesList } from './utils.js';
import { normalizeStreakScalingMultipliers } from './streakScaling.js';

function loadData(key, defaultValue) {
  return loadAccountData(key, defaultValue);
}

function saveData(key, data) {
  return saveAccountData(key, data);
}

function normalizeTrade(trade) {
  const safeTrade = trade && typeof trade === 'object' ? trade : {};
  const att = Array.isArray(safeTrade.attachments)
    ? safeTrade.attachments.map((p) => String(p).trim()).filter(Boolean)
    : [];
  const batchRaw =
    safeTrade.journalImportBatchId != null ? String(safeTrade.journalImportBatchId).trim() : '';
  const base = {
    ...safeTrade,
    id: safeTrade.id || uuidv4(),
    attachments: att
  };
  if (batchRaw) base.journalImportBatchId = batchRaw;
  else delete base.journalImportBatchId;
  return base;
}

const DEFAULT_USER_PROFILE = {
  traderName: '',
  accountCurrency: 'USD',
  initialCapital: 10000,
  riskMode: 'percent',
  riskPerTradePercent: 1,
  riskPerTradeAmount: 100,
  dailyLossLimitMode: 'percent',
  dailyLossLimitPercent: 3,
  dailyLossLimitAmount: 300,
  goalMode: 'percent',
  goalDayValue: 1,
  goalWeekValue: 2,
  goalMonthValue: 5,
  goalYearValue: 20,
  maxOpenTrades: 3,
  maxConsecutiveLosses: 3,
  commissionPerLot: 0,
  notes: '',
  cooldownAfterLossMin: 0,
  streakScalingEnabled: false,
  /** С какого количества убытков подряд применять первый множитель (≥1). */
  streakScalingApplyFromLossCount: 2,
  /** Множители лимита риска по шагам; последний повторяется при длинной серии. */
  streakScalingMultipliers: [0.5, 0.25, 0.125],
  dailyReviewEnabled: true,
  /** Напоминание закрыть день в дневнике (после локального часа, если запись за сегодня пустая). */
  journalDayReminderEnabled: true,
  /** 0–23, локальное время */
  journalDayReminderHourLocal: 21,
  /** Напоминание / мягкое правило: скрин графика после закрытия сделки */
  postCloseChartReminderEnabled: true,
  lastDailyReviewDate: null,
  /** 0 — без лимита */
  maxTradesPerDay: 0,
  /** ISO-неделя: лимит убытка, % или сумма; 0 — выкл */
  weeklyLossLimitMode: 'percent',
  weeklyLossLimitPercent: 0,
  weeklyLossLimitAmount: 0,
  /** Потолок дневной прибыли: при достижении блок новых входов; 0 — выкл */
  dailyProfitLockMode: 'percent',
  dailyProfitLockPercent: 0,
  dailyProfitLockAmount: 0,
  /** 0 — выкл; 1–23 локальный час: с этого часа новые сделки не оформляются */
  noNewTradesAfterHourLocal: 0,
  /** Минимум минут между закрытием и новым входом; 0 — выкл */
  minMinutesBetweenTrades: 0,
  /** Жёсткий блок сделок с R:R ниже порога (если SL и TP заданы) */
  minRiskRewardHardBlock: false,
  minRiskRewardRatio: 1.5,
  /** Явное включение опциональных лимитов (чекбоксы у полей на вкладке правил) */
  weeklyLossLimitEnabled: false,
  dailyProfitLockEnabled: false,
  afterHoursCutoffEnabled: false,
  minTradeIntervalEnabled: false,
  /** Галочки в форме сделки по строкам из «Заметки к профилю» */
  profileNotesChecklistEnabled: true,
  nextWeekFocus: '',
  nextMonthFocus: ''
};

// Создаем хранилище для сделок
function createTradesStore() {
  const initialState = loadData('trades', []).map(normalizeTrade);
  const { subscribe, set, update } = writable(initialState);
  
  return {
    subscribe,
    addTrade: (trade) => update(trades => {
      const newTrades = [...trades, normalizeTrade(trade)];
      saveData('trades', newTrades);
      return newTrades;
    }),
    updateTrade: (id, updatedTrade) => update(trades => {
      const newTrades = trades.map(t => t.id === id ? { ...t, ...updatedTrade } : t);
      saveData('trades', newTrades);
      return newTrades;
    }),
    deleteTrade: (targetTrade) => update(trades => {
      if (targetTrade?.id) {
        void removeScopeDir('trades', String(targetTrade.id));
      }
      const newTrades = trades.filter((t) => {
        if (targetTrade?.id && t.id) return t.id !== targetTrade.id;
        return !(
          t.dateOpen === targetTrade?.dateOpen &&
          t.pair === targetTrade?.pair &&
          t.priceOpen === targetTrade?.priceOpen &&
          t.volume === targetTrade?.volume &&
          t.status === targetTrade?.status
        );
      });
      saveData('trades', newTrades);
      return newTrades;
    }),
    importTrades: (trades) => {
      const normalizedTrades = Array.isArray(trades) ? trades.map(normalizeTrade) : [];
      set(normalizedTrades);
      saveData('trades', normalizedTrades);
    },
    /** Удалить сделки с меткой пакета импорта (= id строки в истории импортов счёта). */
    removeTradesByJournalImportBatch(batchId) {
      const bid = String(batchId || '').trim();
      if (!bid) return;
      update((rows) => {
        const next = [];
        for (const t of rows) {
          const tb = t?.journalImportBatchId != null ? String(t.journalImportBatchId).trim() : '';
          if (tb === bid) {
            if (t?.id) void removeScopeDir('trades', String(t.id));
          } else {
            next.push(t);
          }
        }
        saveData('trades', next);
        return next;
      });
    },
    exportTrades: () => {
      let trades;
      subscribe(t => trades = t)();
      return trades;
    },
    rehydrate() {
      set(loadData('trades', []).map(normalizeTrade));
    }
  };
}

// Хранилище для шаблонов
function createTemplatesStore() {
  const initialState = migrateTemplatesList(loadData('templates', DEFAULT_TEMPLATES));
  const { subscribe, set, update } = writable(initialState);
  
  return {
    subscribe,
    addTemplate: (template) => update(templates => {
      const newTemplates = [...templates, template];
      saveData('templates', newTemplates);
      return newTemplates;
    }),
    updateTemplate: (id, updatedTemplate) => update(templates => {
      const newTemplates = templates.map(t => t.id === id ? { ...t, ...updatedTemplate } : t);
      saveData('templates', newTemplates);
      return newTemplates;
    }),
    deleteTemplate: (id) => update(templates => {
      const newTemplates = templates.filter(t => t.id !== id);
      saveData('templates', newTemplates);
      return newTemplates;
    }),
    rehydrate() {
      set(migrateTemplatesList(loadData('templates', DEFAULT_TEMPLATES)));
    }
  };
}

// Список валют, которые мы поддерживаем после удаления RUB. Если в профиле
// сохранилась несуществующая больше валюта (RUB после удаления, или старые
// инсталляции) — мягко мигрируем её в USD, чтобы UI не сломался.
const SUPPORTED_ACCOUNT_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USDT', 'BTC'
]);

function migrateProfile(raw) {
  const next = { ...DEFAULT_USER_PROFILE, ...(raw || {}) };
  const num = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const ccy = String(next.accountCurrency || '').toUpperCase();
  if (!SUPPORTED_ACCOUNT_CURRENCIES.has(ccy)) {
    next.accountCurrency = 'USD';
  } else {
    next.accountCurrency = ccy;
  }
  delete next.archivedProfileRuleIds;

  if (typeof next.weeklyLossLimitEnabled !== 'boolean') {
    next.weeklyLossLimitEnabled =
      next.weeklyLossLimitMode === 'amount'
        ? num(next.weeklyLossLimitAmount) > 0
        : num(next.weeklyLossLimitPercent) > 0;
  }
  if (typeof next.dailyProfitLockEnabled !== 'boolean') {
    next.dailyProfitLockEnabled =
      next.dailyProfitLockMode === 'amount'
        ? num(next.dailyProfitLockAmount) > 0
        : num(next.dailyProfitLockPercent) > 0;
  }
  if (typeof next.afterHoursCutoffEnabled !== 'boolean') {
    const h = Math.floor(num(next.noNewTradesAfterHourLocal));
    next.afterHoursCutoffEnabled = h >= 1 && h <= 23;
  }
  if (typeof next.minTradeIntervalEnabled !== 'boolean') {
    next.minTradeIntervalEnabled = num(next.minMinutesBetweenTrades) > 0;
  }
  if (typeof next.profileNotesChecklistEnabled !== 'boolean') {
    next.profileNotesChecklistEnabled = true;
  }
  if (typeof next.postCloseChartReminderEnabled !== 'boolean') {
    next.postCloseChartReminderEnabled = true;
  }
  const startRaw = Math.floor(num(next.streakScalingApplyFromLossCount));
  next.streakScalingApplyFromLossCount =
    Number.isFinite(startRaw) && startRaw >= 1 ? Math.min(99, startRaw) : 2;
  next.streakScalingMultipliers = normalizeStreakScalingMultipliers(next.streakScalingMultipliers);
  return next;
}

/** Валюта депозита из импорта MT5 — только поддерживаемые коды, иначе null. */
export function sanitizeImportedAccountCurrency(raw) {
  const c = String(raw || '').toUpperCase().trim();
  if (!c) return null;
  return SUPPORTED_ACCOUNT_CURRENCIES.has(c) ? c : null;
}

function createUserProfileStore() {
  const initialState = migrateProfile(loadData('userProfile', DEFAULT_USER_PROFILE));
  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    updateProfile: (profileData) => update((profile) => {
      const next = { ...profile, ...profileData };
      saveData('userProfile', next);
      return next;
    }),
    resetProfile: () => {
      set(DEFAULT_USER_PROFILE);
      saveData('userProfile', DEFAULT_USER_PROFILE);
    },
    rehydrate() {
      set(migrateProfile(loadData('userProfile', DEFAULT_USER_PROFILE)));
    }
  };
}

function normalizeSetupSnippetsRows(raw) {
  return Array.isArray(raw)
    ? raw.map((s) => ({
        id: s?.id || uuidv4(),
        title: String(s?.title ?? ''),
        body: String(s?.body ?? ''),
        tags: Array.isArray(s?.tags) ? s.tags.map((x) => String(x)) : []
      }))
    : [];
}

function createSetupSnippetsStore() {
  const initialState = normalizeSetupSnippetsRows(loadData('setupSnippets', []));
  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    addSnippet(partial = {}) {
      const row = {
        id: uuidv4(),
        title: String(partial.title ?? 'Новый сетап'),
        body: String(partial.body ?? ''),
        tags: Array.isArray(partial.tags) ? partial.tags.map(String) : []
      };
      update((list) => {
        const next = [...list, row];
        saveData('setupSnippets', next);
        return next;
      });
      return row.id;
    },
    updateSnippet(id, patch) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== id) return s;
          const row = { ...s, ...patch };
          if (patch.tags != null) row.tags = patch.tags.map(String);
          return row;
        });
        saveData('setupSnippets', next);
        return next;
      });
    },
    deleteSnippet(id) {
      update((list) => {
        const next = list.filter((s) => s.id !== id);
        saveData('setupSnippets', next);
        return next;
      });
    },
    importAll(rows) {
      const next = Array.isArray(rows)
        ? rows.map((s) => ({
            id: s?.id || uuidv4(),
            title: String(s?.title ?? ''),
            body: String(s?.body ?? ''),
            tags: Array.isArray(s?.tags) ? s.tags.map(String) : []
          }))
        : [];
      set(next);
      saveData('setupSnippets', next);
    },
    rehydrate() {
      set(normalizeSetupSnippetsRows(loadData('setupSnippets', [])));
    }
  };
}

export const trades = createTradesStore();
export const templates = createTemplatesStore();
export const setupSnippets = createSetupSnippetsStore();
export const userProfile = createUserProfileStore();

activeJournalAccountId.subscribe(() => {
  trades.rehydrate();
  templates.rehydrate();
  userProfile.rehydrate();
  setupSnippets.rehydrate();
});