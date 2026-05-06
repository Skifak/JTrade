import { v4 as uuidv4 } from 'uuid';

/**
 * Превращает многострочные заметки в список строк (комментарии # игнорируются).
 * Общая семантика с `parseNotesChecklist` в risk.js.
 * @param {unknown} notes
 */
export function legacyProfileNotesChecklistLines(notes) {
  if (!notes || typeof notes !== 'string') return [];
  return notes
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('#'));
}

/**
 * Нормализует сохранённые правила «Свои правила» — пустые label отбрасываются.
 * Дубликаты и пустые id пересобираются.
 * @returns {Array<{ id: string, label: string, required: boolean }>}
 */
export function sanitizeProfileGateRulesInput(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const label = String(row?.label ?? '').trim();
    if (!label) continue;
    let id = String(row?.id ?? '').trim();
    if (!id || seen.has(id)) id = uuidv4();
    seen.add(id);
    out.push({ id, label, required: !!row?.required });
  }
  return out;
}

/**
 * Список pre-trade пунктов профиля: `profileGateRules` или fallback на строки заметок.
 */
export function normalizeProfileGateRules(profile) {
  if (Array.isArray(profile?.profileGateRules)) {
    return sanitizeProfileGateRulesInput(profile.profileGateRules);
  }
  return legacyProfileNotesChecklistLines(profile?.notes).map((label, i) => ({
    id: `legacy-notes:${i}`,
    label,
    required: false
  }));
}
