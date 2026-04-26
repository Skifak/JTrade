// Базовые валютные пары
export const PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'BTCUSD', 'ETHUSD'
];

/** Единиц базового актива на 1.0 лот (как в спецификации брокера / Excel I2). */
export const DEFAULT_CONTRACT_SIZE_BY_SYMBOL = {
  EURUSD: 100000,
  GBPUSD: 100000,
  USDJPY: 100000,
  USDCHF: 100000,
  AUDUSD: 100000,
  USDCAD: 100000,
  NZDUSD: 100000,
  EURGBP: 100000,
  EURJPY: 100000,
  GBPJPY: 100000,
  BTCUSD: 1,
  ETHUSD: 1
};

/** Тикер для справочника: EURUSD.a → EURUSD */
export function normalizeSymbolKey(symbol) {
  const raw = String(symbol || '').toUpperCase().trim().replace(/\s+/g, '');
  if (!raw) return '';
  return raw.split('.')[0].split('#')[0];
}

// Направления сделки
export const DIRECTIONS = ['long', 'short'];

// Статусы
export const STATUS = {
  OPEN: 'open',
  CLOSED: 'closed'
};

// Примеры шаблонов
export const DEFAULT_TEMPLATES = [
  {
    id: 'template_1',
    name: 'Scalp 1:2',
    riskPercent: 1,
    pair: 'EURUSD',
    riskReward: 2,
    comment: 'Скальпинг на новостях'
  },
  {
    id: 'template_2',
    name: 'Swing 1:3',
    riskPercent: 2,
    pair: 'GBPUSD',
    riskReward: 3,
    comment: 'Свинг по тренду'
  },
  {
    id: 'template_3',
    name: 'Breakout',
    riskPercent: 1.5,
    pair: 'BTCUSD',
    riskReward: 2.5,
    comment: 'Пробой уровня'
  }
];