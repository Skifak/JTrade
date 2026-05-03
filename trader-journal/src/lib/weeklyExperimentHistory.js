/**
 * Архив принятых фокусов недели (ISO): при смене недели после committed.
 */
import { loadAccountData, saveAccountData } from './accountStorage.js';

const HISTORY_KEY = 'analyticsWeeklyExperimentHistory_v1';
const MAX_ENTRIES = 40;

export function loadWeeklyExperimentHistory() {
  const raw = loadAccountData(HISTORY_KEY, null);
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object' && x.weekKey && x.experimentKey);
}

/** @param {{ weekKey: string; experimentKey: string; archivedAt: string; rollup: object; outcome: { verdict: string; lines: string[]; progress?: { pct: number | null; caption: string } } }} entry */
export function pushWeeklyExperimentHistory(entry) {
  const list = loadWeeklyExperimentHistory();
  const wk = String(entry?.weekKey || '');
  if (wk && list.some((x) => String(x?.weekKey || '') === wk)) return;
  list.unshift(entry);
  while (list.length > MAX_ENTRIES) list.pop();
  saveAccountData(HISTORY_KEY, list);
}
