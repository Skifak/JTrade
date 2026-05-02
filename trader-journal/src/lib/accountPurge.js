import { keyForAccount } from './accounts.js';

/** Все базовые ключи localStorage, которые изолируются по счёту через keyForAccount */
export const ACCOUNT_SCOPED_STORAGE_KEYS = [
  'trades',
  'templates',
  'userProfile',
  'setupSnippets',
  'traderGlossary_v1',
  'journalSettings_v1',
  'dayJournal_v1',
  'dayJournalChecklistTemplate_v1',
  'dayJournalPlanTemplates_v1',
  'dayJournalSectionLabels_v1',
  'strategies',
  'htfBiasLog',
  'cooldownUntil'
];

export function purgeAccountLocalStorage(accountId) {
  const id = String(accountId || '').trim();
  if (!id) return;
  for (const base of ACCOUNT_SCOPED_STORAGE_KEYS) {
    try {
      localStorage.removeItem(keyForAccount(base, id));
    } catch (_) {}
  }
}
