import { derived, writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { purgeAccountLocalStorage } from './accountPurge.js';
import { validateLatinAccountName } from './accountValidation.js';

const ACCOUNTS_KEY = 'journalAccounts_v1';
const ACTIVE_ACCOUNT_KEY = 'journalActiveAccount_v1';
const DEFAULT_ACCOUNT_ID = 'acc-default';

/** Есть ли в localStorage «плоские» ключи до мульти-счетов */
function hasLegacyFlatKeys() {
  try {
    const markers = [
      'trades',
      'userProfile',
      'traderGlossary_v1',
      'strategies',
      'journalSettings_v1',
      'dayJournal_v1',
      'templates',
      'setupSnippets'
    ];
    return markers.some((k) => localStorage.getItem(k) != null);
  } catch {
    return false;
  }
}

/** Снимок метаданных последнего импорта в счёт (UI + справка). */
function sanitizeImportMeta(m) {
  if (!m || typeof m !== 'object') return undefined;
  const fileModifiedMs = Number(m.fileModifiedMs);
  return {
    fileName: m.fileName != null ? String(m.fileName) : '',
    fileModifiedMs: Number.isFinite(fileModifiedMs) ? fileModifiedMs : null,
    sourceAccountTitle: m.sourceAccountTitle != null ? String(m.sourceAccountTitle) : null,
    fundsDisplay: m.fundsDisplay != null ? String(m.fundsDisplay) : null,
    reportDateDisplay: m.reportDateDisplay != null ? String(m.reportDateDisplay) : null
  };
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'clean' }];
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'clean' }];
      }
      return [];
    }
    const rows = parsed
      .map((a) => ({
        id: String(a?.id || '').trim(),
        name: String(a?.name || '').trim(),
        createdFrom: a?.createdFrom === 'import' ? 'import' : 'clean',
        importMeta: sanitizeImportMeta(a?.importMeta)
      }))
      .filter((a) => a.id && a.name);
    if (!rows.length) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'clean' }];
      }
      return [];
    }
    return rows;
  } catch (_) {
    if (hasLegacyFlatKeys()) {
      return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy' }];
    }
    return [];
  }
}

function saveAccounts(list) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch (_) {}
}

function loadActiveId(list) {
  if (!list.length) return '';
  try {
    const raw = String(localStorage.getItem(ACTIVE_ACCOUNT_KEY) || '').trim();
    if (raw && list.some((a) => a.id === raw)) return raw;
  } catch (_) {}
  return list[0].id;
}

function saveActiveId(id) {
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(id ?? ''));
  } catch (_) {}
}

const _initialAccounts = loadAccounts();
const _accounts = writable(_initialAccounts);
const _activeId = writable(loadActiveId(_initialAccounts));

_accounts.subscribe((list) => {
  saveAccounts(list);
  let current;
  _activeId.subscribe((v) => (current = v))();
  if (!list.length) {
    if (current !== '') _activeId.set('');
    return;
  }
  if (!list.some((a) => a.id === current)) {
    _activeId.set(list[0].id);
  }
});
_activeId.subscribe((id) => saveActiveId(id));

/**
 * Ключ localStorage для активного счёта или null, если счёт не выбран.
 * @param {string} baseKey
 */
export function activeAccountScopedKey(baseKey) {
  let aid = '';
  activeJournalAccountId.subscribe((v) => (aid = String(v || '').trim()))();
  if (!aid) return null;
  return keyForAccount(baseKey, aid);
}

export function hasJournalAccountSelected() {
  return Boolean(String(get(_activeId) || '').trim());
}

export const journalAccounts = {
  subscribe: _accounts.subscribe,
  setActive(id) {
    const next = String(id || '').trim();
    if (!next) return;
    let list = [];
    _accounts.subscribe((v) => (list = v))();
    if (!list.some((a) => a.id === next)) return;
    _activeId.set(next);
  },
  /**
   * @param {string} name
   * @param {{ createdFrom?: 'clean' | 'import' }} [opts]
   */
  create(name, opts = {}) {
    const v = validateLatinAccountName(name);
    if (!v.ok) return null;
    const createdFrom = opts.createdFrom === 'import' ? 'import' : 'clean';
    const row = { id: `acc-${uuidv4()}`, name: v.name, createdFrom };
    _accounts.update((list) => [...list, row]);
    _activeId.set(row.id);
    return row.id;
  },
  /** Сохранить метаданные импорта для счёта (имя из файла, средства, даты). */
  setAccountImportMeta(accountId, meta) {
    const victim = String(accountId || '').trim();
    if (!victim) return;
    const snap = sanitizeImportMeta(meta);
    if (!snap) return;
    _accounts.update((rows) =>
      rows.map((a) => (a.id === victim ? { ...a, importMeta: snap } : a))
    );
  },
  async removeAccountAndPurge(id) {
    const victim = String(id || '').trim();
    if (!victim) return false;
    const list = get(_accounts);
    if (!list.some((a) => a.id === victim)) return false;
    const att = await import('./attachmentApi.js');
    await att.removeAttachmentTreesForJournalAccount(victim);
    purgeAccountLocalStorage(victim);
    _accounts.update((rows) => rows.filter((a) => a.id !== victim));
    return true;
  }
};

export const activeJournalAccountId = {
  subscribe: _activeId.subscribe
};

export const activeJournalAccount = derived(
  [journalAccounts, activeJournalAccountId],
  ([$accounts, $activeId]) =>
    $accounts.find((a) => a.id === $activeId) || $accounts[0] || null
);

export function keyForAccount(baseKey, accountId) {
  const id = String(accountId || '').trim();
  if (!id) return `${String(baseKey)}__`;
  return `${baseKey}__${id}`;
}
