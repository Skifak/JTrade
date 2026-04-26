import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TEMPLATES } from './constants';

// Загрузка данных из localStorage
function loadData(key, defaultValue) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : defaultValue;
}

// Сохранение в localStorage
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
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
  notes: ''
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

function createUserProfileStore() {
  const initialState = {
    ...DEFAULT_USER_PROFILE,
    ...loadData('userProfile', DEFAULT_USER_PROFILE)
  };
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