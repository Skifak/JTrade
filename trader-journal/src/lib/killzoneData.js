/**
 * Дефолтные окна killzone (время в выбранном TZ журнала, по умолчанию NY).
 */
export const DEFAULT_KILLZONES = [
  { id: 'ASIA', label: 'Asia', from: '20:00', to: '00:00', wrap: true, hint: 'Asian range — построение премиум/дискаунт' },
  { id: 'LO', label: 'London Open', from: '02:00', to: '05:00', wrap: false, hint: 'London Open Killzone' },
  { id: 'LDN', label: 'London', from: '03:00', to: '04:00', wrap: false, hint: 'Узкое London KZ' },
  { id: 'NYAM', label: 'NY AM', from: '08:30', to: '11:00', wrap: false, hint: 'NY AM session' },
  { id: 'SB', label: 'Silver Bullet', from: '10:00', to: '11:00', wrap: false, hint: 'Silver Bullet 10–11 NY' },
  { id: 'LCK', label: 'London Close', from: '10:00', to: '12:00', wrap: false, hint: 'London Close KZ' },
  { id: 'NYPM', label: 'NY PM', from: '13:30', to: '16:00', wrap: false, hint: 'NY PM session' }
];

/** Приоритет для primaryKillzone: более узкие / специфичные раньше. */
export const DEFAULT_KILLZONE_PRIORITY = ['SB', 'LDN', 'LO', 'LCK', 'NYAM', 'NYPM', 'ASIA'];
