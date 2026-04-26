/**
 * Cooldown после убыточной сделки — anti-revenge-trading блок.
 *
 * Стор хранит timestamp `until` (ms) — до этого момента торговля «на паузе».
 * Истинное значение лежит в localStorage, чтобы пережить перезагрузку страницы.
 *
 *   cooldown.startAfterLoss(minutes)   // активирует cooldown
 *   cooldown.cancel()                  // снимает (например, по решению пользователя)
 *   cooldown.subscribe                 // { until: number|null }
 *
 * Реактивный «возраст» — через tickClock (livePrices.js), он уже тикает.
 */
import { writable } from 'svelte/store';

const STORAGE_KEY = 'cooldownUntil';

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return v;
  } catch (_) {
    return null;
  }
}

function persist(until) {
  try {
    if (until == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(until));
  } catch (_) {}
}

const _store = writable({ until: readInitial() });

export const cooldown = {
  subscribe: _store.subscribe,
  startAfterLoss(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return;
    const until = Date.now() + m * 60 * 1000;
    persist(until);
    _store.set({ until });
  },
  cancel() {
    persist(null);
    _store.set({ until: null });
  },
  /** Ms осталось до окончания. 0 если не активен. */
  remainingMs(now = Date.now()) {
    let snap;
    _store.subscribe((s) => (snap = s))();
    if (!snap?.until) return 0;
    const left = snap.until - now;
    if (left <= 0) {
      this.cancel();
      return 0;
    }
    return left;
  }
};
