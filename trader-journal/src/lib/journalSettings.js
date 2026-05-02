/**
 * Настройки журнала (не профиль трейдера): TZ для KZ, окна, приоритет.
 * Хранится отдельно от сделок и профиля.
 */
import { writable } from 'svelte/store';
import { toasts } from './toasts';
import { DEFAULT_KILLZONES, DEFAULT_KILLZONE_PRIORITY } from './killzoneData';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';

const KEY = 'journalSettings_v1';

export const TZ_PRESETS = [
  { id: 'America/New_York', label: 'Нью-Йорк (ET)' },
  { id: 'America/Chicago', label: 'Чикаго (CT)' },
  { id: 'Europe/London', label: 'Лондон' },
  { id: 'Europe/Moscow', label: 'Москва' },
  { id: 'Asia/Shanghai', label: 'Пекин / Shanghai' },
  { id: 'UTC', label: 'UTC' }
];

function deepCloneZones() {
  return JSON.parse(JSON.stringify(DEFAULT_KILLZONES));
}

function normalizeKzRow(r) {
  if (!r || typeof r !== 'object') return null;
  const id = String(r.id || '').trim();
  const label = String(r.label || id).trim();
  if (!id) return null;
  const from = String(r.from || '09:00').trim();
  const to = String(r.to || '10:00').trim();
  return {
    id,
    label,
    from,
    to,
    wrap: !!r.wrap,
    hint: String(r.hint || '')
  };
}

function normalizeState(raw) {
  const base = {
    killzoneTimezone: 'America/New_York',
    killzones: deepCloneZones(),
    killzonePriority: [...DEFAULT_KILLZONE_PRIORITY]
  };
  if (!raw || typeof raw !== 'object') return base;

  if (typeof raw.killzoneTimezone === 'string' && raw.killzoneTimezone.trim()) {
    base.killzoneTimezone = raw.killzoneTimezone.trim();
  }
  if (Array.isArray(raw.killzones) && raw.killzones.length) {
    const rows = raw.killzones.map(normalizeKzRow).filter(Boolean);
    if (rows.length) base.killzones = rows;
  }
  if (Array.isArray(raw.killzonePriority) && raw.killzonePriority.length) {
    base.killzonePriority = raw.killzonePriority.map((x) => String(x).trim()).filter(Boolean);
  }
  return base;
}

function load() {
  try {
    const raw = loadAccountData(KEY, null);
    if (raw == null) return normalizeState(null);
    return normalizeState(raw);
  } catch (err) {
    console.warn('[journalSettings] load failed', err);
    return normalizeState(null);
  }
}

function save(state) {
  const ok = saveAccountData(KEY, state);
  if (!ok) {
    console.error('[journalSettings] save failed');
    toasts.error('Не удалось сохранить настройки журнала.', { ttl: 8000 });
  }
  return ok;
}

function createJournalSettingsStore() {
  const initial = load();
  const { subscribe, update, set } = writable(initial);

  return {
    subscribe,
    setTimezone(tz) {
      const id = String(tz || '').trim();
      if (!id) return;
      update((s) => {
        const next = { ...s, killzoneTimezone: id };
        save(next);
        return next;
      });
    },
    setKillzonePriority(ids) {
      const list = Array.isArray(ids) ? ids.map((x) => String(x).trim()).filter(Boolean) : [];
      update((s) => {
        const next = { ...s, killzonePriority: list.length ? list : [...DEFAULT_KILLZONE_PRIORITY] };
        save(next);
        return next;
      });
    },
    patchKillzone(index, patch) {
      update((s) => {
        const kz = [...s.killzones];
        if (index < 0 || index >= kz.length) return s;
        const row = normalizeKzRow({ ...kz[index], ...patch });
        if (!row) return s;
        kz[index] = row;
        const next = { ...s, killzones: kz };
        save(next);
        return next;
      });
    },
    addKillzoneRow() {
      update((s) => {
        const n = s.killzones.length + 1;
        const row = normalizeKzRow({
          id: `KZ_${n}`,
          label: `Окно ${n}`,
          from: '09:00',
          to: '10:00',
          wrap: false,
          hint: ''
        });
        const next = { ...s, killzones: [...s.killzones, row] };
        save(next);
        return next;
      });
    },
    removeKillzoneAt(index) {
      update((s) => {
        if (s.killzones.length <= 1) {
          toasts.error('Нужна хотя бы одна killzone.', { ttl: 4000 });
          return s;
        }
        if (index < 0 || index >= s.killzones.length) return s;
        const next = { ...s, killzones: s.killzones.filter((_, i) => i !== index) };
        save(next);
        return next;
      });
    },
    resetKillzonesToDefault() {
      update((s) => {
        const next = {
          ...s,
          killzoneTimezone: 'America/New_York',
          killzones: deepCloneZones(),
          killzonePriority: [...DEFAULT_KILLZONE_PRIORITY]
        };
        save(next);
        return next;
      });
    },
    rehydrate() {
      set(load());
    }
  };
}

export const journalSettings = createJournalSettingsStore();

activeJournalAccountId.subscribe(() => {
  journalSettings.rehydrate();
});
