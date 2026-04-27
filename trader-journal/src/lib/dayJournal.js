/**
 * Дневной журнал (не сделки): план, итог, настроение, чеклист.
 */
import { writable } from 'svelte/store';
import { toasts } from './toasts';

const KEY = 'dayJournal_v1';

function defaultEntry() {
  return {
    mood: '',
    plan: '',
    review: '',
    lessons: '',
    checklist: {
      bias: false,
      killzone: false,
      riskPlan: false,
      noRevenge: false
    }
  };
}

/** Слияние чеклиста: базовые ключи + любые сохранённые boolean. */
function normalizeChecklistObject(saved) {
  const base = { ...defaultEntry().checklist };
  const c = saved && typeof saved === 'object' ? saved : {};
  const out = { ...base };
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === 'boolean') out[k] = v;
    else if (v === 1 || v === 0) out[k] = !!v;
  }
  return out;
}

function normalizeEntry(raw) {
  const d = defaultEntry();
  if (!raw || typeof raw !== 'object') return d;
  return {
    mood: typeof raw.mood === 'string' ? raw.mood : d.mood,
    plan: String(raw.plan ?? ''),
    review: String(raw.review ?? ''),
    lessons: String(raw.lessons ?? ''),
    checklist: normalizeChecklistObject(raw.checklist)
  };
}

function loadAll() {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out[k] = normalizeEntry(v);
    }
    return out;
  } catch (err) {
    console.warn('[dayJournal] load failed', err);
    return {};
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch (err) {
    console.error('[dayJournal] save failed', err);
    toasts.error('Не удалось сохранить дневной журнал.', { ttl: 8000 });
    return false;
  }
}

function createDayJournalStore() {
  const initial = loadAll();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    /** patch — частичное обновление записи за день (YYYY-MM-DD) */
    patchDay(dateKey, patch) {
      const key = String(dateKey || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      update((all) => {
        const prev = normalizeEntry(all[key]);
        const merged = {
          ...prev,
          ...patch,
          checklist:
            patch.checklist && typeof patch.checklist === 'object'
              ? { ...prev.checklist, ...patch.checklist }
              : prev.checklist
        };
        const nextEntry = normalizeEntry(merged);
        const next = { ...all, [key]: nextEntry };
        saveAll(next);
        return next;
      });
    },
    replaceDay(dateKey, entry) {
      const key = String(dateKey || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      update((all) => {
        const next = { ...all, [key]: normalizeEntry(entry) };
        saveAll(next);
        return next;
      });
    },
    clearDay(dateKey) {
      const key = String(dateKey || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      update((all) => {
        const next = { ...all };
        delete next[key];
        saveAll(next);
        return next;
      });
    },
    resetAll() {
      set({});
      saveAll({});
    }
  };
}

export const dayJournal = createDayJournalStore();
export { defaultEntry, normalizeEntry };
