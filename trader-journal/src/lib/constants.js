// Базовые валютные пары
export const PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'BTCUSD', 'ETHUSD'
];

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