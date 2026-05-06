/** Короткие часы по IANA TZ для шапки (совпадают с TZ_PRESETS в настройках журнала). */
export const WORLD_CITIES = [
  { abbr: 'BJ', name: 'Пекин', tz: 'Asia/Shanghai' },
  { abbr: 'LDN', name: 'Лондон', tz: 'Europe/London' },
  { abbr: 'NYC', name: 'Нью-Йорк', tz: 'America/New_York' },
  { abbr: 'CHI', name: 'Чикаго', tz: 'America/Chicago' },
  { abbr: 'MSK', name: 'Москва', tz: 'Europe/Moscow' },
  { abbr: 'UTC', name: 'UTC', tz: 'UTC' }
];

const fmtCache = new Map();

/**
 * @param {number} ms
 * @param {string} timeZone
 */
export function formatWorldTime(ms, timeZone) {
  let fmt = fmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone
    });
    fmtCache.set(timeZone, fmt);
  }
  return fmt.format(new Date(ms));
}
