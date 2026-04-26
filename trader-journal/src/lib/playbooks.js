/**
 * Strategies / Playbooks — сущность торгового плана.
 * Каждая стратегия содержит набор play (сетапов) с правилами.
 *
 * Сделка может ссылаться на (strategyId, playId).
 * При создании сделки чек-лист play.preconditions / entryConditions
 * подгружается в TradeForm, а нарушения попадают в ruleViolations.
 */
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { toasts } from './toasts';

const KEY = 'strategies';

const DEFAULT_ICT_STRATEGY = {
  id: 'default-ict',
  name: 'ICT — базовый',
  description: 'Стартовый шаблон с тремя рабочими сетапами Inner Circle Trader.',
  htfBias: ['daily', 'h4'],
  killzones: ['LO', 'SB', 'NYAM'],
  plays: [
    {
      id: 'play-fvg-ote',
      name: 'London KZ · FVG + OTE',
      killzones: ['LO', 'SB'],
      htfRequirement: 'aligned',
      preconditions: [
        { id: 'bias-set',     label: 'Daily bias установлен и совпадает с направлением', required: true },
        { id: 'asia-sweep',   label: 'Сделан sweep ликвидности (Asia / PDH-PDL)', required: true },
        { id: 'h1-fvg',       label: 'Видна валидная FVG на H1/M15 в дискаунте/премиуме', required: true },
        { id: 'ote-zone',     label: 'Точка входа в зоне OTE 62–79%', required: false }
      ],
      entryConditions: [
        { id: 'mss-m5',       label: 'MSS на M5 в направлении сделки', required: true }
      ],
      invalidations: [
        { id: 'price-back',   label: 'Цена закрылась за противоположной стороной FVG' }
      ],
      rr: { min: 2, target: 3 }
    },
    {
      id: 'play-silver-bullet',
      name: 'Silver Bullet · 10–11 NY',
      killzones: ['SB'],
      htfRequirement: 'aligned',
      preconditions: [
        { id: 'in-sb',        label: 'Время входа 10:00–11:00 NY', required: true },
        { id: 'liq-grab',     label: 'Грэб ликвидности перед входом (BSL/SSL)', required: true },
        { id: 'fvg-poi',      label: 'POI = FVG / iFVG / OB', required: true }
      ],
      entryConditions: [
        { id: 'mss-confirm',  label: 'Подтверждение MSS', required: true }
      ],
      invalidations: [],
      rr: { min: 2, target: 3 }
    },
    {
      id: 'play-judas',
      name: 'Judas Swing reverse',
      killzones: ['LO', 'NYAM'],
      htfRequirement: 'against',
      preconditions: [
        { id: 'judas',        label: 'Зафиксирован Judas-сдвиг (фейк HTF-движения)', required: true },
        { id: 'liq-pool',     label: 'Снят liquidity-pool на противоположной стороне', required: true }
      ],
      entryConditions: [
        { id: 'reversal',     label: 'Reversal-структура подтверждена', required: true }
      ],
      invalidations: [],
      rr: { min: 2, target: 4 }
    }
  ]
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [DEFAULT_ICT_STRATEGY];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [DEFAULT_ICT_STRATEGY];
  } catch (err) {
    console.warn('[playbooks] load failed, using defaults', err);
    return [DEFAULT_ICT_STRATEGY];
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    console.error('[playbooks] save failed', err);
    toasts.error('Не удалось сохранить плейбуки.');
    return false;
  }
}

function ensurePlay(p = {}) {
  return {
    id: p.id || uuidv4(),
    name: p.name || 'Новый сетап',
    killzones: Array.isArray(p.killzones) ? p.killzones : [],
    htfRequirement: p.htfRequirement || 'any', // any | aligned | against
    preconditions: Array.isArray(p.preconditions)
      ? p.preconditions.map(ensureRule)
      : [],
    entryConditions: Array.isArray(p.entryConditions)
      ? p.entryConditions.map(ensureRule)
      : [],
    invalidations: Array.isArray(p.invalidations)
      ? p.invalidations.map(ensureRule)
      : [],
    rr: { min: Number(p?.rr?.min) || 2, target: Number(p?.rr?.target) || 3 }
  };
}

function ensureRule(r = {}) {
  return {
    id: r.id || uuidv4(),
    label: String(r.label || 'Правило'),
    required: !!r.required
  };
}

function ensureStrategy(s = {}) {
  return {
    id: s.id || uuidv4(),
    name: s.name || 'Новая стратегия',
    description: s.description || '',
    htfBias: Array.isArray(s.htfBias) ? s.htfBias : [],
    killzones: Array.isArray(s.killzones) ? s.killzones : [],
    plays: Array.isArray(s.plays) ? s.plays.map(ensurePlay) : []
  };
}

function createStrategiesStore() {
  const initial = load().map(ensureStrategy);
  const { subscribe, update, set } = writable(initial);

  return {
    subscribe,
    addStrategy(partial = {}) {
      let createdId = null;
      update((list) => {
        const s = ensureStrategy({ ...partial, id: undefined });
        createdId = s.id;
        const next = [...list, s];
        save(next);
        return next;
      });
      return createdId;
    },
    updateStrategy(id, patch) {
      update((list) => {
        const next = list.map((s) => (s.id === id ? ensureStrategy({ ...s, ...patch }) : s));
        save(next);
        return next;
      });
    },
    deleteStrategy(id) {
      update((list) => {
        const next = list.filter((s) => s.id !== id);
        const finalList = next.length ? next : [DEFAULT_ICT_STRATEGY];
        save(finalList);
        return finalList;
      });
    },
    addPlay(strategyId, partial = {}) {
      let createdId = null;
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          const play = ensurePlay({ ...partial, id: undefined });
          createdId = play.id;
          return { ...s, plays: [...(s.plays || []), play] };
        });
        save(next);
        return next;
      });
      return createdId;
    },
    updatePlay(strategyId, playId, patch) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          return {
            ...s,
            plays: (s.plays || []).map((p) => (p.id === playId ? ensurePlay({ ...p, ...patch }) : p))
          };
        });
        save(next);
        return next;
      });
    },
    deletePlay(strategyId, playId) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          return { ...s, plays: (s.plays || []).filter((p) => p.id !== playId) };
        });
        save(next);
        return next;
      });
    },
    addRule(strategyId, playId, kind, label, required = false) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          return {
            ...s,
            plays: (s.plays || []).map((p) => {
              if (p.id !== playId) return p;
              const arr = Array.isArray(p[kind]) ? [...p[kind]] : [];
              arr.push(ensureRule({ label, required }));
              return { ...p, [kind]: arr };
            })
          };
        });
        save(next);
        return next;
      });
    },
    updateRule(strategyId, playId, kind, ruleId, patch) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          return {
            ...s,
            plays: (s.plays || []).map((p) => {
              if (p.id !== playId) return p;
              const arr = Array.isArray(p[kind]) ? p[kind] : [];
              return {
                ...p,
                [kind]: arr.map((r) => (r.id === ruleId ? ensureRule({ ...r, ...patch }) : r))
              };
            })
          };
        });
        save(next);
        return next;
      });
    },
    deleteRule(strategyId, playId, kind, ruleId) {
      update((list) => {
        const next = list.map((s) => {
          if (s.id !== strategyId) return s;
          return {
            ...s,
            plays: (s.plays || []).map((p) => {
              if (p.id !== playId) return p;
              const arr = Array.isArray(p[kind]) ? p[kind] : [];
              return { ...p, [kind]: arr.filter((r) => r.id !== ruleId) };
            })
          };
        });
        save(next);
        return next;
      });
    },
    importJson(json) {
      try {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        if (!arr.length) return false;
        const list = arr.map(ensureStrategy);
        set(list);
        save(list);
        return true;
      } catch (err) {
        toasts.error('Импорт плейбука: некорректный JSON');
        return false;
      }
    },
    exportJson() {
      let val;
      const unsub = subscribe((v) => (val = v));
      unsub();
      return JSON.stringify(val, null, 2);
    },
    resetToDefault() {
      const list = [DEFAULT_ICT_STRATEGY].map(ensureStrategy);
      set(list);
      save(list);
    }
  };
}

export const strategies = createStrategiesStore();

export function findStrategy(list, strategyId) {
  if (!strategyId || !Array.isArray(list)) return null;
  return list.find((x) => x.id === strategyId) || null;
}

export function findPlay(list, strategyId, playId) {
  const s = findStrategy(list, strategyId);
  if (!s) return null;
  return (s.plays || []).find((p) => p.id === playId) || null;
}

/** Сводный список всех play из всех стратегий — для select. */
export function flattenPlays(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    for (const p of s.plays || []) {
      out.push({
        strategyId: s.id,
        playId: p.id,
        strategyName: s.name,
        playName: p.name,
        full: `${s.name} → ${p.name}`,
        play: p,
        strategy: s
      });
    }
  }
  return out;
}
