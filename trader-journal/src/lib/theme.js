import { writable } from 'svelte/store';
import { toasts } from './toasts';

export const THEMES = [
  { id: 'light', label: 'Белая' },
  { id: 'beige', label: 'Бежевая' },
  { id: 'dark', label: 'Тёмная' }
];

const STORAGE_KEY = 'theme';
const DEFAULT_THEME = 'light';

function readInitialTheme() {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch (err) {
    console.warn('[theme] localStorage.getItem failed:', err);
  }
  return DEFAULT_THEME;
}

export function applyThemeToDom(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

function createThemeStore() {
  const initial = readInitialTheme();
  applyThemeToDom(initial);

  const { subscribe, set } = writable(initial);

  return {
    subscribe,
    set: (value) => {
      const next = THEMES.some((t) => t.id === value) ? value : DEFAULT_THEME;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (err) {
        console.warn('[theme] localStorage.setItem failed:', err);
        toasts.warn('Не удалось сохранить тему в localStorage.');
      }
      applyThemeToDom(next);
      set(next);
    }
  };
}

export const theme = createThemeStore();
