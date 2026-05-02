/**
 * Черновик формы сделки — только sessionStorage (вкладка), привязка к активному счёту.
 */
import { get } from 'svelte/store';
import { activeJournalAccountId } from './accounts.js';

const SCHEMA_V = 1;
const PREFIX = 'tradeFormDraft';

function accountSuffix() {
  const id = String(get(activeJournalAccountId) || 'acc-default').trim();
  return id || 'acc-default';
}

export function draftStorageKeyAdd() {
  return `${PREFIX}__${accountSuffix()}__add`;
}

export function draftStorageKeyEdit(tradeId) {
  return `${PREFIX}__${accountSuffix()}__edit__${String(tradeId || '').trim()}`;
}

/** @returns {Record<string, unknown> | null} */
export function loadDraftRaw(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraftRaw(key, payload) {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('[tradeFormDraft] save failed', err);
  }
}

export function clearDraftRaw(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Поля формы для сравнения «есть ли отличия от умолчания / от исходной сделки» */
export function tradeFormDraftFingerprint(formData) {
  const fd = formData && typeof formData === 'object' ? formData : {};
  return JSON.stringify({
    pair: fd.pair ?? '',
    direction: fd.direction ?? '',
    volume: fd.volume ?? '',
    priceOpen: fd.priceOpen ?? '',
    sl: fd.sl ?? '',
    tp: fd.tp ?? '',
    comment: fd.comment ?? '',
    tags: fd.tags ?? [],
    strategyId: fd.strategyId ?? null,
    playId: fd.playId ?? null,
    contractSize: fd.contractSize ?? null,
    dateOpen: fd.dateOpen ?? '',
    killzone: fd.killzone ?? null,
    commission: fd.commission ?? '',
    swap: fd.swap ?? ''
  });
}

export function meaningfulDraftAdd(formData) {
  const fd = formData && typeof formData === 'object' ? formData : {};
  if (String(fd.comment || '').trim()) return true;
  if (Array.isArray(fd.tags) && fd.tags.length > 0) return true;
  if (fd.strategyId || fd.playId) return true;
  const pk = String(fd.pair || '').trim().toUpperCase();
  if (pk && pk !== 'EURUSD') return true;
  const vol = Number(fd.volume);
  if (Number.isFinite(vol) && Math.abs(vol - 0.01) > 1e-9) return true;
  const po = Number(fd.priceOpen);
  if (Number.isFinite(po) && Math.abs(po) > 1e-12) return true;
  if (fd.sl != null && fd.sl !== '' && Number(fd.sl) !== 0) return true;
  if (fd.tp != null && fd.tp !== '' && Number(fd.tp) !== 0) return true;
  return false;
}

export function meaningfulDraftEdit(formData, baselineTrade) {
  if (!baselineTrade || typeof baselineTrade !== 'object') return meaningfulDraftAdd(formData);
  return tradeFormDraftFingerprint(formData) !== tradeFormDraftFingerprint(baselineTrade);
}

export function buildDraftPayload({
  formData,
  useCurrentTime,
  useMarketPrice,
  acknowledgedChecklist,
  acknowledgedPlayRules,
  mode,
  tradeId
}) {
  return {
    v: SCHEMA_V,
    savedAt: Date.now(),
    mode,
    tradeId: tradeId || null,
    formData: JSON.parse(JSON.stringify(formData)),
    useCurrentTime: !!useCurrentTime,
    useMarketPrice: !!useMarketPrice,
    acknowledgedChecklist: Array.isArray(acknowledgedChecklist) ? [...acknowledgedChecklist] : [],
    acknowledgedPlayRules: Array.isArray(acknowledgedPlayRules) ? [...acknowledgedPlayRules] : []
  };
}

export function validateDraftForApply(raw, mode, trade) {
  if (!raw || raw.v !== SCHEMA_V) return false;
  if (raw.mode !== mode) return false;
  if (mode === 'edit' && trade && String(raw.tradeId || '') !== String(trade.id || '')) return false;
  return !!(raw.formData && typeof raw.formData === 'object');
}
