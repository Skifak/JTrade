/**
 * Шаблон пунктов чеклиста дневника (порядок и подписи).
 */
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { toasts } from './toasts';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';

const KEY = 'dayJournalChecklistTemplate_v1';

export const DEFAULT_CHECKLIST_ITEMS = [
  { id: 'bias', label: 'HTF bias понятен' },
  { id: 'killzone', label: 'В своей killzone' },
  { id: 'riskPlan', label: 'Риск / SL / объём по плану' },
  { id: 'noRevenge', label: 'Не revenge после стопа' }
];

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const label = String(raw.label || '').trim();
  if (!id || !label) return null;
  return { id, label };
}

function load() {
  try {
    const parsed = loadAccountData(KEY, null);
    if (!Array.isArray(parsed) || !parsed.length) return [...DEFAULT_CHECKLIST_ITEMS];
    const rows = parsed.map(normalizeItem).filter(Boolean);
    return rows.length ? rows : [...DEFAULT_CHECKLIST_ITEMS];
  } catch (e) {
    console.warn('[dayJournalChecklistTemplate] load failed', e);
    return [...DEFAULT_CHECKLIST_ITEMS];
  }
}

function save(rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    console.error('[dayJournalChecklistTemplate] save failed', err);
    toasts.error('Не удалось сохранить шаблон чеклиста.', { ttl: 6000 });
    return false;
  }
}

function createStore() {
  const initial = load();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    addItem(labelText) {
      const label = String(labelText || '').trim();
      if (!label) return;
      const id = `c_${uuidv4().slice(0, 8)}`;
      update((rows) => {
        const next = [...rows, { id, label }];
        save(next);
        return next;
      });
    },
    updateItem(id, labelText) {
      const idStr = String(id || '').trim();
      const label = String(labelText || '').trim();
      if (!idStr || !label) return;
      update((rows) => {
        const next = rows.map((r) => (r.id === idStr ? { ...r, label } : r));
        save(next);
        return next;
      });
    },
    removeItem(id) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      update((rows) => {
        if (rows.length <= 1) {
          toasts.error('Нужен хотя бы один пункт чеклиста.', { ttl: 4000 });
          return rows;
        }
        const next = rows.filter((r) => r.id !== idStr);
        save(next);
        return next;
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
        save(next);
        return next;
      });
    },
    resetDefaults() {
      const next = [...DEFAULT_CHECKLIST_ITEMS];
      set(next);
      save(next);
    },
    rehydrate() {
      set(load());
    }
  };
}

export const dayJournalChecklistTemplate = createStore();

// ---------- Подписи блоков текста (редактор + карточки) ----------

const SEC_KEY = 'dayJournalSectionLabels_v1';

export const DEFAULT_SECTION_LABELS = {
  plan: 'План на сессию',
  review: 'Итог дня',
  lessons: 'Фокус на потом'
};

function loadSections() {
  try {
    const p = loadAccountData(SEC_KEY, null);
    if (!p || typeof p !== 'object') return { ...DEFAULT_SECTION_LABELS };
    return {
      plan: String(p.plan || DEFAULT_SECTION_LABELS.plan),
      review: String(p.review || DEFAULT_SECTION_LABELS.review),
      lessons: String(p.lessons || DEFAULT_SECTION_LABELS.lessons)
    };
  } catch (e) {
    return { ...DEFAULT_SECTION_LABELS };
  }
}

function saveSections(s) {
  const ok = saveAccountData(SEC_KEY, s);
  if (!ok) {
    console.error('[dayJournalSectionLabels] save failed');
    toasts.error('Не удалось сохранить подписи блоков.', { ttl: 5000 });
  }
  return ok;
}

function createSectionLabelsStore() {
  const initial = loadSections();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    patch(patch) {
      update((s) => {
        const next = {
          plan: patch.plan != null ? String(patch.plan) : s.plan,
          review: patch.review != null ? String(patch.review) : s.review,
          lessons: patch.lessons != null ? String(patch.lessons) : s.lessons
        };
        saveSections(next);
        return next;
      });
    },
    reset() {
      const next = { ...DEFAULT_SECTION_LABELS };
      set(next);
      saveSections(next);
    },
    rehydrate() {
      set(loadSections());
    }
  };
}

export const dayJournalSectionLabels = createSectionLabelsStore();

activeJournalAccountId.subscribe(() => {
  dayJournalChecklistTemplate.rehydrate();
  dayJournalSectionLabels.rehydrate();
});
