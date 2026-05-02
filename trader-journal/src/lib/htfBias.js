/**
 * HTF Bias log — журнал направленческого bias по символам.
 * Хранит daily/h4 направление (bull/bear/neutral) + key levels + reasoning.
 * Один bias на (symbol, date) — повторное upsert обновляет.
 */
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { toasts } from './toasts';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';

const KEY = 'htfBiasLog';

function load() {
  try {
    const parsed = loadAccountData(KEY, null);
    if (!parsed) return [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[htfBias] load failed', err);
    return [];
  }
}

function save(list) {
  const ok = saveAccountData(KEY, list);
  if (!ok) {
    console.error('[htfBias] save failed');
    toasts.error('Не удалось сохранить bias-лог.');
  }
  return ok;
}

function todayKey() {
  return dayjs().format('YYYY-MM-DD');
}

function normalize(entry = {}) {
  return {
    id: entry.id || uuidv4(),
    date: entry.date || todayKey(),
    symbol: String(entry.symbol || '').toUpperCase(),
    daily: ['bull', 'bear', 'neutral'].includes(entry.daily) ? entry.daily : 'neutral',
    h4: ['bull', 'bear', 'neutral'].includes(entry.h4) ? entry.h4 : 'neutral',
    reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
    keyLevels: Array.isArray(entry.keyLevels)
      ? entry.keyLevels
          .map((lvl) => ({
            price: Number(lvl?.price),
            label: String(lvl?.label || '')
          }))
          .filter((lvl) => Number.isFinite(lvl.price))
      : []
  };
}

function createBiasStore() {
  const initial = load();
  const { subscribe, update, set } = writable(initial);

  return {
    subscribe,
    upsert(entry) {
      const e = normalize(entry);
      if (!e.symbol) {
        toasts.error('Bias: символ обязателен');
        return false;
      }
      update((list) => {
        const idx = list.findIndex((x) => x.date === e.date && x.symbol === e.symbol);
        const next = idx >= 0
          ? [...list.slice(0, idx), { ...list[idx], ...e }, ...list.slice(idx + 1)]
          : [e, ...list];
        save(next);
        return next;
      });
      return true;
    },
    remove(id) {
      update((list) => {
        const next = list.filter((x) => x.id !== id);
        save(next);
        return next;
      });
    },
    clearAll() {
      set([]);
      save([]);
    },
    rehydrate() {
      set(load());
    }
  };
}

export const htfBias = createBiasStore();

activeJournalAccountId.subscribe(() => {
  htfBias.rehydrate();
});

/**
 * Найти актуальный bias на сегодня для символа (или последний за 7 дней).
 * Возвращает entry или null.
 */
export function findActiveBias(list, symbol, refDate = new Date()) {
  if (!Array.isArray(list) || !symbol) return null;
  const sym = String(symbol).toUpperCase();
  const ref = dayjs(refDate);
  const today = ref.format('YYYY-MM-DD');

  const exact = list.find((x) => x.symbol === sym && x.date === today);
  if (exact) return exact;

  const cutoff = ref.subtract(7, 'day').format('YYYY-MM-DD');
  return (
    list
      .filter((x) => x.symbol === sym && x.date >= cutoff && x.date < today)
      .sort((a, b) => (b.date > a.date ? 1 : -1))[0] || null
  );
}

/**
 * Совпадает ли направление сделки с bias.
 *  true   — aligned
 *  false  — против bias
 *  null   — bias neutral / нет данных
 */
export function isAlignedWithBias(bias, direction) {
  if (!bias || !direction) return null;
  const k =
    bias.daily === 'neutral' && bias.h4 !== 'neutral' ? bias.h4 : bias.daily;
  if (!k || k === 'neutral') return null;
  if (direction === 'long' && k === 'bull') return true;
  if (direction === 'short' && k === 'bear') return true;
  return false;
}

/** Чтение и красивый лейбл bias. */
export function biasLabel(b) {
  if (!b) return '—';
  const map = { bull: '📈 Bull', bear: '📉 Bear', neutral: '⏸ Neutral' };
  if (b.daily && b.daily !== 'neutral') return `D: ${map[b.daily]}` + (b.h4 && b.h4 !== 'neutral' ? ` · H4: ${map[b.h4]}` : '');
  if (b.h4 && b.h4 !== 'neutral') return `H4: ${map[b.h4]}`;
  return 'Neutral';
}
