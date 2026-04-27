import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TEMPLATES } from './constants';
import { toasts } from './toasts';

// Загрузка данных из localStorage с защитой от битого JSON / недоступного хранилища.
function loadData(key, defaultValue) {
  let saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch (err) {
    // localStorage может быть недоступен (приватный режим, отключённые куки и т.п.)
    console.warn(`[stores] localStorage.getItem(${key}) failed:`, err);
    return defaultValue;
  }
  if (!saved) return defaultValue;
  try {
    return JSON.parse(saved);
  } catch (err) {
    console.error(`[stores] не удалось распарсить ${key}, использую default:`, err);
    // Бэкапим битые данные, чтобы пользователь мог их восстановить руками
    try {
      const backupKey = `${key}__corrupt_backup_${Date.now()}`;
      localStorage.setItem(backupKey, saved);
      toasts.error(
        `Данные «${key}» повреждены и заменены значением по умолчанию.\n` +
        `Старая копия сохранена под ключом ${backupKey} в localStorage.`,
        { ttl: 12000 }
      );
    } catch (_) {
      toasts.error(`Данные «${key}» повреждены и заменены значением по умолчанию.`, { ttl: 10000 });
    }
    return defaultValue;
  }
}

// Сохранение в localStorage с обработкой переполнения квоты.
function saveData(key, data) {
  let payload;
  try {
    payload = JSON.stringify(data);
  } catch (err) {
    console.error(`[stores] JSON.stringify(${key}) failed:`, err);
    toasts.error(`Не удалось сериализовать данные «${key}».`);
    return false;
  }
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);
    console.error(`[stores] localStorage.setItem(${key}) failed:`, err);
    toasts.error(
      isQuota
        ? `Хранилище переполнено: не удалось сохранить «${key}».\nУдалите часть закрытых сделок или экспортируйте их в JSON.`
        : `Не удалось сохранить «${key}» в localStorage.`,
      { ttl: 10000 }
    );
    return false;
  }
}

function normalizeTrade(trade) {
  const safeTrade = trade && typeof trade === 'object' ? trade : {};
  return {
    ...safeTrade,
    id: safeTrade.id || uuidv4()
  };
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
  dailyReviewEnabled: true,
  lastDailyReviewDate: null
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
    deleteClosedTrades: () => update((trades) => {
      const newTrades = trades.filter((t) => t.status !== 'closed');
      saveData('trades', newTrades);
      return newTrades;
    }),
    importTrades: (trades) => {
      const normalizedTrades = Array.isArray(trades) ? trades.map(normalizeTrade) : [];
      set(normalizedTrades);
      saveData('trades', normalizedTrades);
    },
    exportTrades: () => {
      let trades;
      subscribe(t => trades = t)();
      return trades;
    }
  };
}

// Хранилище для шаблонов
function createTemplatesStore() {
  const initialState = loadData('templates', DEFAULT_TEMPLATES);
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
    })
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
  const ccy = String(next.accountCurrency || '').toUpperCase();
  if (!SUPPORTED_ACCOUNT_CURRENCIES.has(ccy)) {
    next.accountCurrency = 'USD';
  } else {
    next.accountCurrency = ccy;
  }
  return next;
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
    }
  };
}

export const trades = createTradesStore();
export const templates = createTemplatesStore();
export const userProfile = createUserProfileStore();