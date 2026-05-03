/**
 * Шаблоны текста для блока «План на сессию»: короткое название + текст для вставки.
 */
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { toasts } from './toasts';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';

const KEY = 'dayJournalPlanTemplates_v1';

export const DEFAULT_PLAN_TEMPLATES = [
  {
    id: 'tpl_kz_discipline',
    label: 'KZ и лимит сделок',
    text: 'Только выбранные KZ · max 2 сделки · стоп по плану · без усреднения.'
  },
  {
    id: 'tpl_preflight',
    label: 'Чек перед входом',
    text:
      'Перед входом: HTF bias + ликвидность снята. Не торговать первые 15 мин после новости.'
  },
  {
    id: 'tpl_session_stops',
    label: 'Правила паузы',
    text: 'Если −1R — пауза 30 мин. Если дневной +X — только наблюдение.'
  }
];

function scrubPlanTplLabelNewlines(raw) {
  return String(raw ?? '').replace(/\r?\n/g, ' ');
}

/** Однострочное название для сохранения (переносы → пробел, trim). */
export function normalizePlanTplLabel(raw) {
  return scrubPlanTplLabelNewlines(raw).trim();
}

/** Только для поля ввода: убрать переносы без trim посередине набора. */
export function scrubPlanTplLabelInput(raw) {
  return scrubPlanTplLabelNewlines(raw);
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const label = normalizePlanTplLabel(raw.label ?? '');
  const text = String(raw.text ?? '').trim();
  if (!id || !label || !text) return null;
  return { id, label, text };
}

function load() {
  try {
    const parsed = loadAccountData(KEY, null);
    if (!Array.isArray(parsed) || !parsed.length) {
      return DEFAULT_PLAN_TEMPLATES.map((x) => ({ ...x }));
    }
    const rows = parsed.map(normalizeItem).filter(Boolean);
    return rows.length ? rows : DEFAULT_PLAN_TEMPLATES.map((x) => ({ ...x }));
  } catch (e) {
    console.warn('[dayJournalPlanTemplates] load failed', e);
    return DEFAULT_PLAN_TEMPLATES.map((x) => ({ ...x }));
  }
}

function save(rows) {
  return saveAccountData(KEY, rows);
}

function createStore() {
  const initial = load();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    addItem(labelStr, textStr) {
      const label = normalizePlanTplLabel(labelStr);
      const text = String(textStr || '').trim();
      if (!label) {
        toasts.error('Укажи название шаблона.', { ttl: 4000 });
        return;
      }
      if (!text) {
        toasts.error('Укажи текст шаблона.', { ttl: 4000 });
        return;
      }
      const id = `p_${uuidv4().slice(0, 10)}`;
      update((rows) => {
        const next = [...rows, { id, label, text }];
        if (save(next)) return next;
        return rows;
      });
    },
    updateItem(id, patch) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      update((rows) => {
        const i = rows.findIndex((r) => r.id === idStr);
        if (i < 0) return rows;
        const r = rows[i];
        const label =
          patch.label != null ? normalizePlanTplLabel(patch.label) : r.label;
        const text = patch.text != null ? String(patch.text).trim() : r.text;
        if (!label) {
          toasts.error('Название шаблона не может быть пустым.', { ttl: 3500 });
          return rows;
        }
        if (!text) {
          toasts.error('Текст шаблона не может быть пустым.', { ttl: 3500 });
          return rows;
        }
        const next = [...rows];
        next[i] = { ...r, label, text };
        if (save(next)) return next;
        return rows;
      });
    },
    removeItem(id) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      update((rows) => {
        const next = rows.filter((r) => r.id !== idStr);
        if (save(next)) return next;
        return rows;
      });
    },
    moveItem(id, dir /* -1 | 1 */) {
      const idStr = String(id || '').trim();
      update((rows) => {
        const i = rows.findIndex((r) => r.id === idStr);
        if (i < 0) return rows;
        const j = i + dir;
        if (j < 0 || j >= rows.length) return rows;
        const next = [...rows];
        [next[i], next[j]] = [next[j], next[i]];
        if (save(next)) return next;
        return rows;
      });
    },
    resetDefaults() {
      const next = DEFAULT_PLAN_TEMPLATES.map((x) => ({ ...x }));
      set(next);
      save(next);
    },
    rehydrate() {
      set(load());
    }
  };
}

export const dayJournalPlanTemplates = createStore();

activeJournalAccountId.subscribe(() => {
  dayJournalPlanTemplates.rehydrate();
});
