import JSZip from 'jszip';
import { readBytes, writeBytes } from './attachmentApi.js';
import { toasts } from './toasts.js';

const BUNDLE_NAME = 'journal_bundle.json';

/**
 * @param {() => any[]} getTrades
 * @param {() => { categories: any[]; terms: any[] }} getGlossaryState
 */
export async function buildJournalZip(getTrades, getGlossaryState) {
  const trades = getTrades();
  const glossary = getGlossaryState();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    trades,
    glossary
  };
  const zip = new JSZip();
  zip.file(BUNDLE_NAME, JSON.stringify(payload, null, 2));

  const seen = new Set();
  for (const t of trades) {
    for (const p of t.attachments || []) {
      if (typeof p === 'string' && p) seen.add(p);
    }
  }
  for (const term of glossary.terms || []) {
    for (const p of term.attachments || []) {
      if (typeof p === 'string' && p) seen.add(p);
    }
  }

  for (const rel of seen) {
    if (!rel.match(/^(glossary|trades)\//)) continue;
    const u8 = await readBytes(rel);
    if (u8 && u8.length) {
      zip.file(`files/${rel.replace(/\\/g, '/')}`, u8);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

/**
 * @param {ArrayBuffer} ab
 * @param {{ setTrades: (rows: any[]) => void; importGlossary: (g: any) => void; onDone?: () => void }} storeApi
 */
export async function importJournalZip(ab, storeApi) {
  const zip = await JSZip.loadAsync(ab);
  const file = zip.file(BUNDLE_NAME);
  if (!file) {
    toasts.error('В ZIP нет journal_bundle.json', { ttl: 8000 });
    return false;
  }
  const text = await file.async('string');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') {
    toasts.error('Некорректный формат бандла', { ttl: 8000 });
    return false;
  }
  if (!Array.isArray(data.trades)) {
    toasts.error('В бандле нет массива сделок', { ttl: 8000 });
    return false;
  }
  if (!data.glossary || typeof data.glossary !== 'object') {
    toasts.error('В бандле нет глоссария', { ttl: 8000 });
    return false;
  }
  const trades = data.trades;
  const gloss = data.glossary;

  const entries = Object.keys(zip.files);
  for (const name of entries) {
    if (zip.files[name].dir) continue;
    if (!name.startsWith('files/') || name === 'files/') continue;
    const rel = name.slice('files/'.length).replace(/\\/g, '/');
    if (!rel.match(/^(glossary|trades)\//)) continue;
    const f = zip.file(name);
    if (!f) continue;
    const u8a = await f.async('uint8array');
    await writeBytes(rel, u8a);
  }

  storeApi.importGlossary(gloss);
  storeApi.setTrades(trades);
  toasts.info('Бандл импортирован (сделки + глоссарий + фото)', { ttl: 5000 });
  storeApi.onDone?.();
  return true;
}

export { BUNDLE_NAME };
