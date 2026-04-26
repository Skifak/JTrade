/**
 * Минималистичный store тостов (info / warn / error).
 * Используем для пользовательских ошибок, которые нельзя проглотить молча
 * (например QuotaExceededError при сохранении в localStorage).
 *
 *   import { toasts } from './lib/toasts';
 *   toasts.error('Не удалось сохранить...', { ttl: 6000 });
 */
import { writable } from 'svelte/store';

const _store = writable(/** @type {Array<{id:number,kind:string,text:string}>} */ ([]));
let _idSeq = 1;

function push(kind, text, { ttl = 5000 } = {}) {
  const id = _idSeq++;
  _store.update((list) => [...list, { id, kind, text }]);
  if (ttl > 0) {
    setTimeout(() => dismiss(id), ttl);
  }
  return id;
}

function dismiss(id) {
  _store.update((list) => list.filter((t) => t.id !== id));
}

export const toasts = {
  subscribe: _store.subscribe,
  info:  (text, opts) => push('info',  text, opts),
  warn:  (text, opts) => push('warn',  text, opts),
  error: (text, opts) => push('error', text, opts),
  dismiss
};
