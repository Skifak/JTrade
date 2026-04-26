/**
 * ICT Killzones — окна повышенной ликвидности.
 * Все диапазоны заданы в Нью-Йорк локальном времени, DST ловится автоматически
 * через Intl.DateTimeFormat (timeZone: 'America/New_York').
 */
export const KILLZONES = [
  { id: 'ASIA', label: 'Asia',          from: '20:00', to: '00:00', wrap: true,  hint: 'Asian range — построение премиум/дискаунт' },
  { id: 'LO',   label: 'London Open',   from: '02:00', to: '05:00', hint: 'London Open Killzone' },
  { id: 'LDN',  label: 'London',        from: '03:00', to: '04:00', hint: 'Узкое London KZ' },
  { id: 'NYAM', label: 'NY AM',         from: '08:30', to: '11:00', hint: 'NY AM session' },
  { id: 'SB',   label: 'Silver Bullet', from: '10:00', to: '11:00', hint: 'Silver Bullet 10–11 NY' },
  { id: 'LCK',  label: 'London Close',  from: '10:00', to: '12:00', hint: 'London Close KZ' },
  { id: 'NYPM', label: 'NY PM',         from: '13:30', to: '16:00', hint: 'NY PM session' }
];

const TZ = 'America/New_York';

let _fmt;
function getFmt() {
  if (!_fmt) {
    _fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return _fmt;
}

function nyTime(date) {
  const parts = getFmt().formatToParts(date);
  let hh = 0, mm = 0;
  for (const p of parts) {
    if (p.type === 'hour') hh = Number(p.value) % 24;
    else if (p.type === 'minute') mm = Number(p.value);
  }
  return [hh, mm];
}

function inRange(h, m, fromStr, toStr, wrap = false) {
  const [fh, fm] = fromStr.split(':').map(Number);
  const [th, tm] = toStr.split(':').map(Number);
  const cur = h * 60 + m;
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  if (wrap || from > to) return cur >= from || cur < to;
  return cur >= from && cur < to;
}

/** Вернёт массив id всех killzone, попавших на время сделки. */
export function detectKillzones(date) {
  if (!date) return [];
  const d = (date instanceof Date) ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return [];
  const [h, m] = nyTime(d);
  const out = [];
  for (const kz of KILLZONES) {
    if (inRange(h, m, kz.from, kz.to, kz.wrap)) out.push(kz.id);
  }
  return out;
}

/** Приоритетный (самый "узкий" / специфичный) KZ для bucket-аналитики. */
const PRIORITY = ['SB', 'LDN', 'LO', 'LCK', 'NYAM', 'NYPM', 'ASIA'];

export function primaryKillzone(date) {
  const list = detectKillzones(date);
  if (!list.length) return null;
  for (const p of PRIORITY) if (list.includes(p)) return p;
  return list[0];
}

export function getKillzoneById(id) {
  return KILLZONES.find((k) => k.id === id) || null;
}

export function killzoneLabel(id) {
  if (!id) return '—';
  if (id === '_OUT') return 'Вне KZ';
  const kz = getKillzoneById(id);
  return kz?.label || id;
}

/** Текущий KZ "сейчас" для UI-подсказки. */
export function currentKillzone(now = new Date()) {
  return primaryKillzone(now);
}

/** Аггрегация PnL по killzone из закрытых сделок. */
export function getPnLByKillzone(closedTrades) {
  const buckets = KILLZONES.map((kz) => ({
    id: kz.id, label: kz.label, hint: kz.hint, sum: 0, count: 0, wins: 0
  }));
  buckets.push({ id: '_OUT', label: 'Вне KZ', hint: 'Сделки вне основных killzones', sum: 0, count: 0, wins: 0 });
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
