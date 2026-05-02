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
  const tc = Number(m.tradeCount);
  const tradeCount =
    Number.isFinite(tc) && tc >= 0 ? Math.min(Math.floor(tc), 1e9) : null;
  return {
    fileName: m.fileName != null ? String(m.fileName) : '',
    fileModifiedMs: Number.isFinite(fileModifiedMs) ? fileModifiedMs : null,
    sourceAccountTitle: m.sourceAccountTitle != null ? String(m.sourceAccountTitle) : null,
    fundsDisplay: m.fundsDisplay != null ? String(m.fundsDisplay) : null,
    reportDateDisplay: m.reportDateDisplay != null ? String(m.reportDateDisplay) : null,
    tradeCount
  };
}

const IMPORT_HISTORY_MAX = 80;

function simpleHash(str) {
  const x = String(str || '');
  let h = 0;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** Элемент истории импортов (метаданные + id + время записи в приложении). */
function sanitizeHistoryEntry(h, fallbackIndex = 0) {
  if (!h || typeof h !== 'object') return null;
  const base = sanitizeImportMeta(h);
  if (!base) return null;
  let id = String(h.id || '').trim();
  if (!id) {
    id = `retro-${fallbackIndex}-${base.fileModifiedMs ?? 0}-${simpleHash(base.fileName)}`;
  }
  const importedAtMs = Number(h.importedAtMs);
  return {
    ...base,
    id,
    importedAtMs: Number.isFinite(importedAtMs) ? importedAtMs : base.fileModifiedMs ?? Date.now()
  };
}

function normalizeImportHistory(raw, legacyMeta) {
  const arr = Array.isArray(raw) ? raw : [];
  const mapped = arr.map((h, i) => sanitizeHistoryEntry(h, i)).filter(Boolean);
  if (mapped.length) return mapped.slice(0, IMPORT_HISTORY_MAX);
  const leg = sanitizeImportMeta(legacyMeta);
  if (!leg) return [];
  return [
    {
      ...leg,
      id: `legacy-${leg.fileModifiedMs ?? 0}-${simpleHash(leg.fileName)}`,
      importedAtMs: Number.isFinite(Number(leg.fileModifiedMs))
        ? Number(leg.fileModifiedMs)
        : Date.now()
    }
  ].slice(0, IMPORT_HISTORY_MAX);
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'legacy' }];
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'legacy' }];
      }
      return [];
    }
    const rows = parsed
      .map((a) => {
        const importHistory = normalizeImportHistory(a?.importHistory, a?.importMeta);
        const importMeta = importHistory[0]
          ? sanitizeImportMeta(importHistory[0])
          : sanitizeImportMeta(a?.importMeta);
        return {
          id: String(a?.id || '').trim(),
          name: String(a?.name || '').trim(),
          createdFrom:
            a?.createdFrom === 'import'
              ? 'import'
              : a?.createdFrom === 'legacy'
                ? 'legacy'
                : 'clean',
          importMeta,
          importHistory
        };
      })
      .filter((a) => a.id && a.name);
    if (!rows.length) {
      if (hasLegacyFlatKeys()) {
        return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'legacy' }];
      }
      return [];
    }
    return rows;
  } catch (_) {
    if (hasLegacyFlatKeys()) {
      return [{ id: DEFAULT_ACCOUNT_ID, name: 'Legacy', createdFrom: 'legacy' }];
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
  /** Сохранить метаданные импорта для счёта и добавить запись в историю (новые сверху). */
  setAccountImportMeta(accountId, meta) {
    const victim = String(accountId || '').trim();
    if (!victim) return;
    const snap = sanitizeImportMeta(meta);
    if (!snap) return;
    const presetId =
      meta && typeof meta === 'object' && meta.historyEntryId != null
        ? String(meta.historyEntryId).trim()
        : '';
    const entryId = presetId || `imp-${uuidv4()}`;
    const entry = sanitizeHistoryEntry({ ...snap, id: entryId, importedAtMs: Date.now() }, 0);
    if (!entry) return;
    _accounts.update((rows) =>
      rows.map((a) => {
        if (a.id !== victim) return a;
        const prev = Array.isArray(a.importHistory) ? a.importHistory : [];
        const sanitized = prev.map((h, i) => sanitizeHistoryEntry(h, i)).filter(Boolean);
        const nextHist = [entry, ...sanitized].slice(0, IMPORT_HISTORY_MAX);
        return { ...a, importMeta: snap, importHistory: nextHist };
      })
    );
  },
  /** Удалить строку из `importHistory` и скорректировать `importMeta` (сделки — в UI через trades.removeTradesByJournalImportBatch). */
  removeImportHistoryEntry(accountId, entryId) {
    const victim = String(accountId || '').trim();
    const eid = String(entryId || '').trim();
    if (!victim || !eid) return;
    _accounts.update((rows) =>
      rows.map((a) => {
        if (a.id !== victim) return a;
        const prev = Array.isArray(a.importHistory) ? a.importHistory : [];
        const sanitized = prev.map((h, i) => sanitizeHistoryEntry(h, i)).filter(Boolean);
        const nextHist = sanitized.filter((e) => e.id !== eid);
        const importMeta = nextHist[0] ? sanitizeImportMeta(nextHist[0]) : undefined;
        return { ...a, importHistory: nextHist, importMeta };
      })
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
