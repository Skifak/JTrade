/**
 * Картинки: Tauri — папка AppData/.../trader-journal-assets; в браузере (vite) — IndexedDB.
 * Пути в данных: "glossary/{termId}/name.ext", "trades/{tradeId}/name.ext"
 */
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';
import { toasts } from './toasts.js';

const IDB_NAME = 'trader-journal-attachments';
const IDB_STORE = 'files';
const IDB_VER = 1;

/** @type {Map<string, string>} */
const _blobUrlCache = new Map();

export function isTauriApp() {
  if (typeof window === 'undefined') return false;
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) return true;
  try {
    return typeof import.meta !== 'undefined' && !!import.meta.env?.TAURI_ENV_PLATFORM;
  } catch {
    return false;
  }
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-png',
  'image/jpg',
  'image/pjpeg'
]);

/**
 * @param {File} file
 * @returns {{ ok: true, ext: string, mime: string } | { ok: false, reason: string }}
 */
export function validateImageFile(file) {
  if (!file) return { ok: false, reason: 'Нет файла' };
  const name = file.name || '';
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, reason: 'Файл больше 20 МБ' };
  }
  if (!ext || !IMAGE_EXT.has(ext)) {
    return { ok: false, reason: 'Допустимы только изображения: JPG, PNG, GIF, WebP, BMP' };
  }
  if (mime && !mime.startsWith('image/')) {
    return { ok: false, reason: 'Нужен файл изображения' };
  }
  if (mime && !IMAGE_MIME.has(mime) && !mime.match(/^image\/(jpeg|png|gif|webp|bmp|x-)/)) {
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      return { ok: false, reason: 'Некорректный тип' };
    }
  }
  const outMime = mime && mime.startsWith('image/') ? mime : mimeForExt(ext);
  return { ok: true, ext, mime: outMime };
}

function mimeForExt(ext) {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

/**
 * @param {string} id
 */
export function sanitizeNodeId(id) {
  if (!id) return 'x';
  return String(id)
    .split('')
    .map((c) => (c.match(/[a-zA-Z0-9_-]/) ? c : '_'))
    .join('')
    .replace(/\.\.+/g, '_')
    .slice(0, 120) || 'x';
}

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, IDB_VER);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = (e) => {
      const db = e.target?.result;
      if (db && !db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

/**
 * @returns {Promise<IDBDatabase>}
 */
let _dbp = null;
function idb() {
  if (!_dbp) _dbp = _idbOpen();
  return _dbp;
}

/**
 * @param {string} rel
 * @param {Uint8Array} data
 */
async function idbPut(rel, data) {
  const b = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).put(ab, rel);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

/**
 * @param {string} rel
 * @returns {Promise<Uint8Array | null>}
 */
async function idbGet(rel) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readonly');
    const q = t.objectStore(IDB_STORE).get(rel);
    q.onsuccess = () => {
      const v = q.result;
      if (v == null) return res(null);
      res(new Uint8Array(v));
    };
    q.onerror = () => rej(q.error);
  });
}

async function idbDelete(rel) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).delete(rel);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

function u8fromInvoke(data) {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return new Uint8Array(data);
  if (data?.buffer) return new Uint8Array(data);
  return new Uint8Array(0);
}

/**
 * @param {string} rel
 * @param {ArrayBuffer | Uint8Array} data
 */
export async function writeBytes(rel, data) {
  const b = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (isTauriApp()) {
    await invoke('tauri_attachments_write', {
      relPath: rel,
      data: Array.from(b)
    });
    return;
  }
  await idbPut(rel, b);
}

/**
 * @param {string} rel
 * @returns {Promise<Uint8Array | null>}
 */
export async function readBytes(rel) {
  try {
    if (isTauriApp()) {
      const d = await invoke('tauri_attachments_read', { relPath: rel });
      const u8 = u8fromInvoke(d);
      return u8.length ? u8 : null;
    }
    return await idbGet(rel);
  } catch (e) {
    console.warn('[attachments] read', rel, e);
    return null;
  }
}

/**
 * @param {string} rel
 */
export async function removeFile(rel) {
  const old = _blobUrlCache.get(rel);
  if (old) {
    try {
      URL.revokeObjectURL(old);
    } catch {
      // ignore
    }
    _blobUrlCache.delete(rel);
  }
  try {
    if (isTauriApp()) {
      await invoke('tauri_attachments_remove_file', { relPath: rel });
      return;
    }
    await idbDelete(rel);
  } catch (e) {
    console.warn('[attachments] remove', rel, e);
  }
}

/**
 * @param {'glossary' | 'trades'} scope
 * @param {string} id
 */
export async function removeScopeDir(scope, id) {
  const pfx = `${scope}/${sanitizeNodeId(id)}/`;
  if (!isTauriApp()) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(IDB_STORE, 'readwrite');
      const st = t.objectStore(IDB_STORE);
      const rq = st.openKeyCursor();
      rq.onsuccess = (ev) => {
        const c = ev.target.result;
        if (c) {
          const k = c.key;
          if (typeof k === 'string' && k.startsWith(pfx)) st.delete(k);
          c.continue();
        }
      };
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  await invoke('tauri_attachments_remove_scope_dir', {
    scope,
    id: sanitizeNodeId(id)
  });
}

/**
 * @param {'glossary' | 'trades'} scope
 * @param {string} parentId
 * @param {File} file
 * @param {{ onError?: (s: string) => void }} [opts]
 * @returns {Promise<string | null>} rel path or null
 */
export async function saveImageFromFile(scope, parentId, file, opts) {
  const v = validateImageFile(file);
  if (!v.ok) {
    (opts?.onError || ((s) => toasts.error(s, { ttl: 5000 })))(v.reason);
    return null;
  }
  const id = sanitizeNodeId(parentId);
  const name = `${uuidv4()}.${v.ext}`;
  const rel = `${scope}/${id}/${name}`;
  const buf = await file.arrayBuffer();
  try {
    await writeBytes(rel, buf);
  } catch (e) {
    console.error(e);
    toasts.error('Не удалось сохранить изображение', { ttl: 6000 });
    return null;
  }
  return rel;
}

const BLOB_EXT = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'bmp']);

/**
 * @param {'glossary' | 'trades'} scope
 * @param {string} parentId
 * @param {Blob} blob
 * @param {string} ext без точки, например webp, jpg
 * @param {{ onError?: (s: string) => void }} [opts]
 * @returns {Promise<string | null>} rel
 */
export async function saveImageBlob(scope, parentId, blob, ext, opts) {
  const e = String(ext || 'webp')
    .toLowerCase()
    .replace(/^\./, '');
  const norm = e === 'jpeg' ? 'jpg' : e;
  if (!BLOB_EXT.has(norm)) {
    (opts?.onError || ((s) => toasts.error(s, { ttl: 5000 })))('Некорректное расширение файла');
    return null;
  }
  const outExt = norm;
  if (blob.size > 20 * 1024 * 1024) {
    (opts?.onError || ((s) => toasts.error(s, { ttl: 5000 })))('Больше 20 МБ');
    return null;
  }
  const id = sanitizeNodeId(parentId);
  const name = `${uuidv4()}.${outExt}`;
  const rel = `${scope}/${id}/${name}`;
  const buf = await blob.arrayBuffer();
  try {
    await writeBytes(rel, new Uint8Array(buf));
  } catch (e) {
    console.error(e);
    toasts.error('Не удалось сохранить изображение', { ttl: 6000 });
    return null;
  }
  return rel;
}

/**
 * @param {string[]} rels
 * @returns {Promise<string[]>} object URLs
 */
export async function getObjectUrlsForPaths(rels) {
  const out = [];
  for (const rel of rels) {
    const u8 = await readBytes(rel);
    if (!u8) {
      out.push('');
      continue;
    }
    const old = _blobUrlCache.get(rel);
    if (old) {
      try {
        URL.revokeObjectURL(old);
      } catch {
        // ignore
      }
    }
    const blob = new Blob([u8], { type: 'image/*' });
    const url = URL.createObjectURL(blob);
    _blobUrlCache.set(rel, url);
    out.push(url);
  }
  return out;
}

/**
 * @param {string} rel
 */
export function revokeObjectUrlForPath(rel) {
  const u = _blobUrlCache.get(rel);
  if (u) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      // ignore
    }
    _blobUrlCache.delete(rel);
  }
}

export function revokeAllCachedUrls() {
  for (const u of _blobUrlCache.values()) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      // ignore
    }
  }
  _blobUrlCache.clear();
}

export async function getNativeAssetsPath() {
  if (!isTauriApp()) return null;
  try {
    return await invoke('tauri_attachments_get_root');
  } catch {
    return null;
  }
}
