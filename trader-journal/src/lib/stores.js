import { writable } from 'svelte/store';
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

// Создаем хранилище для сделок
function createTradesStore() {
  const initialState = loadData('trades', []);
  const { subscribe, set, update } = writable(initialState);
  
  return {
    subscribe,
    addTrade: (trade) => update(trades => {
      const newTrades = [...trades, trade];
      saveData('trades', newTrades);
      return newTrades;
    }),
    updateTrade: (id, updatedTrade) => update(trades => {
      const newTrades = trades.map(t => t.id === id ? { ...t, ...updatedTrade } : t);
      saveData('trades', newTrades);
      return newTrades;
    }),
    deleteTrade: (id) => update(trades => {
      const newTrades = trades.filter(t => t.id !== id);
      saveData('trades', newTrades);
      return newTrades;
    }),
    importTrades: (trades) => {
      set(trades);
      saveData('trades', trades);
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

export const trades = createTradesStore();
export const templates = createTemplatesStore();