/**
 * Любой поддерживаемый растром формат → WebP (качество по умолчанию визуально без потерь).
 */

function toBlob(/** @type {File | Blob} */ f) {
  if (f instanceof File) {
    return f;
  }
  return new Blob([f], { type: f.type || 'application/octet-stream' });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob | null>}
 */
function canvasToBlobAsync(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

const MAX_LONG_EDGE = 8192;
const WEBP_Q = 0.92;

/**
 * @param {File | Blob} input
 * @returns {Promise<{ blob: Blob, ext: 'webp', size: number }>}
 */
export async function convertToWebP(input) {
  const blob = toBlob(input);
  const bitmap = await createImageBitmap(blob);
  let w = bitmap.width;
  let h = bitmap.height;
  const long = Math.max(w, h);
  if (long > MAX_LONG_EDGE) {
    const s = MAX_LONG_EDGE / long;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas недоступен');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const out = await canvasToBlobAsync(canvas, 'image/webp', WEBP_Q);
  if (!out) {
    throw new Error('WebP не поддерживается (обнови браузер / используй Tauri/Chrome)');
  }
  return { blob: out, ext: 'webp', size: out.size };
}

/**
 * @param {number} n
 */
export function formatKb(n) {
  if (n < 1024) {
    return `${n} B`;
  }
  return `${(n / 1024).toFixed(1)} кБ`;
}
