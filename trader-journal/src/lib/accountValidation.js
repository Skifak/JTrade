/**
 * Название счёта журнала: латиница / цифры / базовые символы, без кириллицы.
 */
export function validateLatinAccountName(name) {
  const t = String(name || '').trim();
  if (!t) return { ok: false, message: 'Введите название счёта' };
  if (t.length > 64) return { ok: false, message: 'Не длиннее 64 символов' };
  if (/[\u0400-\u04FF]/.test(t)) {
    return { ok: false, message: 'Кириллица в названии не допускается — используй латиницу (A–Z).' };
  }
  if (!/^[a-zA-Z0-9]/.test(t)) {
    return { ok: false, message: 'Начни с латинской буквы или цифры.' };
  }
  if (!/^[a-zA-Z0-9 _.,+'-]+$/.test(t)) {
    return { ok: false, message: 'Допустимы латиница, цифры, пробел и _ . , + - \'' };
  }
  return { ok: true, name: t };
}
