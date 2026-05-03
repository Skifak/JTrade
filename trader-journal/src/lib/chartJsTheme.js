import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';

let registered = false;

export function ensureChartRegistered() {
  if (registered) return;
  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    Filler,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip
  );
  registered = true;
}

/**
 * Цвета из текущей темы (:root). Fallback — тёмная схема.
 * @param {HTMLElement} [root]
 */
export function getChartPalette(root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) {
    return {
      profit: '#34c777',
      loss: '#f06464',
      accent: '#5b9eff',
      border: '#2a3440',
      textMuted: '#8b949e',
      text: '#e6edf3',
      bg: '#0e1218'
    };
  }
  const cs = getComputedStyle(root);
  const pick = (name, fb) => {
    const v = cs.getPropertyValue(name).trim();
    return v || fb;
  };
  return {
    profit: pick('--profit', '#34c777'),
    loss: pick('--loss', '#f06464'),
    accent: pick('--accent', '#5b9eff'),
    border: pick('--border', '#2a3440'),
    textMuted: pick('--text-muted', '#8b949e'),
    text: pick('--text', '#e6edf3'),
    bg: pick('--bg', '#0e1218')
  };
}

/** Полупрозрачная заливка под линию (hex #rrggbb). */
export function hexToRgbA(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(100,120,140,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
