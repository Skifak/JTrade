/**
 * Killzones — окна повышенной ликвидности.
 * Время считается в TZ из настроек журнала (journalSettings), по умолчанию America/New_York.
 */
import { get } from 'svelte/store';
import { journalSettings } from './journalSettings';
import { DEFAULT_KILLZONES, DEFAULT_KILLZONE_PRIORITY } from './killzoneData';

/** @deprecated для UI используй $journalSettings.killzones; это статический пресет */
export const KILLZONES = DEFAULT_KILLZONES;

export { DEFAULT_KILLZONES, DEFAULT_KILLZONE_PRIORITY } from './killzoneData';

const tzFmtCache = new Map();

function getFmt(timeZone) {
  const tz = timeZone || 'America/New_York';
  if (!tzFmtCache.has(tz)) {
    tzFmtCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      })
    );
  }
  return tzFmtCache.get(tz);
}

function resolveCtx() {
  let s;
  try {
    s = get(journalSettings);
  } catch {
    s = null;
  }
  const zones =
    s?.killzones && Array.isArray(s.killzones) && s.killzones.length ? s.killzones : DEFAULT_KILLZONES;
  const priority =
    s?.killzonePriority && Array.isArray(s.killzonePriority) && s.killzonePriority.length
      ? s.killzonePriority
      : DEFAULT_KILLZONE_PRIORITY;
  const tz =
    s?.killzoneTimezone && typeof s.killzoneTimezone === 'string'
      ? s.killzoneTimezone
      : 'America/New_York';
  return { zones, priority, tz };
}

function localHM(date, tz) {
  const parts = getFmt(tz).formatToParts(date);
  let hh = 0;
  let mm = 0;
  for (const p of parts) {
    if (p.type === 'hour') hh = Number(p.value) % 24;
    else if (p.type === 'minute') mm = Number(p.value);
  }
  return [hh, mm];
}

function inRange(h, m, fromStr, toStr, wrap = false) {
  const [fh, fm] = fromStr.split(':').map(Number);
  const [th, tm] = toStr.split(':').map(Number);
  if ([fh, fm, th, tm].some((x) => Number.isNaN(x))) return false;
  const cur = h * 60 + m;
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  if (wrap || from > to) return cur >= from || cur < to;
  return cur >= from && cur < to;
}

/** Вернёт массив id всех killzone, попавших на время сделки. */
export function detectKillzones(date) {
  if (!date) return [];
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return [];
  const { zones, tz } = resolveCtx();
  const [h, m] = localHM(d, tz);
  const out = [];
  for (const kz of zones) {
    if (inRange(h, m, kz.from, kz.to, !!kz.wrap)) out.push(kz.id);
  }
  return out;
}

export function primaryKillzone(date) {
  const { priority } = resolveCtx();
  const list = detectKillzones(date);
  if (!list.length) return null;
  for (const p of priority) if (list.includes(p)) return p;
  return list[0];
}

export function getKillzoneById(id) {
  const { zones } = resolveCtx();
  return zones.find((k) => k.id === id) || null;
}

export function killzoneLabel(id) {
  if (!id) return '—';
  if (id === '_OUT') return 'Вне KZ';
  const kz = getKillzoneById(id);
  return kz?.label || id;
}

export function currentKillzone(now = new Date()) {
  return primaryKillzone(now);
}

export function getPnLByKillzone(closedTrades) {
  const { zones } = resolveCtx();
  const buckets = zones.map((kz) => ({
    id: kz.id,
    label: kz.label,
    hint: kz.hint,
    sum: 0,
    count: 0,
    wins: 0
  }));
  buckets.push({
    id: '_OUT',
    label: 'Вне KZ',
    hint: 'Сделки вне настроенных killzones',
    sum: 0,
    count: 0,
    wins: 0
  });
  if (!Array.isArray(closedTrades)) return buckets;
  for (const t of closedTrades) {
    const ref = t?.dateOpen || t?.dateClose;
    if (!ref) continue;
    const id = primaryKillzone(ref) || '_OUT';
    const b = buckets.find((x) => x.id === id);
    if (!b) continue;
    const p = Number(t.profit) || 0;
    b.sum += p;
    b.count += 1;
    if (p > 0) b.wins += 1;
  }
  return buckets;
}
