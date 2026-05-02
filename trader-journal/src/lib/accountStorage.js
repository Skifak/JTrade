/**
 * Данные журнала в localStorage с привязкой к активному счёту (см. accounts.js).
 * Для acc-default читаем легаси «плоский» ключ, если scoped-пустой.
 */
import { get } from 'svelte/store';
import { activeJournalAccountId, keyForAccount } from './accounts.js';
import { toasts } from './toasts.js';

export const LEGACY_DEFAULT_ACCOUNT_ID = 'acc-default';

export function currentScopedStorageKey(baseKey) {
  const id = String(get(activeJournalAccountId) || '').trim();
  if (!id) return null;
  return keyForAccount(baseKey, id);
}

export function loadAccountData(baseKey, defaultValue) {
  const scoped = currentScopedStorageKey(baseKey);
  if (!scoped) return defaultValue;

  let saved = null;
  try {
    saved = localStorage.getItem(scoped);
  } catch (err) {
    console.warn(`[accountStorage] getItem(${scoped}) failed:`, err);
    return defaultValue;
  }

  const tryParse = (raw, label) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[accountStorage] parse ${label} failed`, err);
      try {
        const backupKey = `${label}__corrupt_backup_${Date.now()}`;
        localStorage.setItem(backupKey, raw);
        toasts.error(
          `Данные «${baseKey}» повреждены.\n` +
            `Резервная копия: ${backupKey} в localStorage.`,
          { ttl: 12000 }
        );
      } catch {
        toasts.error(`Данные «${baseKey}» повреждены и сброшены.`, { ttl: 10000 });
      }
      return null;
    }
  };

  const parsed = tryParse(saved, scoped);
  if (parsed != null) return parsed;

  const id = String(get(activeJournalAccountId) || '').trim();
  if (id === LEGACY_DEFAULT_ACCOUNT_ID) {
    let leg = null;
    try {
      leg = localStorage.getItem(baseKey);
    } catch {
      return defaultValue;
    }
    const p2 = tryParse(leg, `${baseKey} (legacy)`);
    if (p2 != null) return p2;
  }

  return defaultValue;
}

export function saveAccountData(baseKey, data) {
  const scoped = currentScopedStorageKey(baseKey);
  if (!scoped) {
    console.warn('[accountStorage] нет активного счёта, пропуск сохранения', baseKey);
    return false;
  }
  let payload;
  try {
    payload = JSON.stringify(data);
  } catch (err) {
    console.error(`[accountStorage] stringify(${baseKey}) failed:`, err);
    toasts.error(`Не удалось сериализовать «${baseKey}».`);
    return false;
  }
  try {
    localStorage.setItem(scoped, payload);
    return true;
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);
    console.error(`[accountStorage] setItem(${scoped}) failed:`, err);
    toasts.error(
      isQuota
        ? `Хранилище переполнено: не удалось сохранить «${baseKey}».\n` +
            'Удали часть данных или экспортируй счёт.'
        : `Не удалось сохранить «${baseKey}».`,
      { ttl: 10000 }
    );
    return false;
  }
}

/** Не-JSON значения (например cooldown: число ms) */
export function loadAccountString(baseKey) {
  const scoped = currentScopedStorageKey(baseKey);
  if (!scoped) return null;
  let scopedVal = null;
  try {
    scopedVal = localStorage.getItem(scoped);
  } catch {
    return null;
  }
  if (scopedVal != null) return scopedVal;

  const id = String(get(activeJournalAccountId) || '').trim();
  if (id === LEGACY_DEFAULT_ACCOUNT_ID) {
    try {
      return localStorage.getItem(baseKey);
    } catch {
      return null;
    }
  }
  return null;
}

export function saveAccountString(baseKey, value) {
  const scoped = currentScopedStorageKey(baseKey);
  if (!scoped) return false;
  try {
    if (value == null) localStorage.removeItem(scoped);
    else localStorage.setItem(scoped, String(value));
    return true;
  } catch (err) {
    console.error('[accountStorage] saveAccountString', err);
    return false;
  }
}
