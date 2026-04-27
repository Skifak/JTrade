// =============================================================================
// Категории инструментов для UI пар-пикера и для классификации в общем коде.
// FX → классические 6-буквенные валютные пары.
// Metals/Commodities/Indices/Crypto — CFD/спот.
// =============================================================================

export const PAIR_CATEGORIES = [
  {
    id: 'fx-major',
    label: 'FX Majors',
    items: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD']
  },
  {
    id: 'fx-cross',
    label: 'FX Crosses',
    items: [
      'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD',
      'GBPJPY', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
      'AUDJPY', 'AUDNZD', 'AUDCAD', 'AUDCHF',
      'CADJPY', 'CADCHF', 'CHFJPY', 'NZDJPY', 'NZDCHF', 'NZDCAD'
    ]
  },
  {
    id: 'metals',
    label: 'Металлы',
    items: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD']
  },
  {
    id: 'commodities',
    label: 'Сырьё',
    items: ['USOIL', 'UKOIL', 'NATGAS', 'COPPER']
  },
  {
    id: 'indices',
    label: 'Индексы',
    items: ['US500', 'US100', 'US30', 'GER40', 'UK100', 'JPN225', 'HK50', 'AUS200', 'FRA40']
  },
  {
    id: 'crypto-major',
    label: 'Crypto Majors',
    items: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD']
  },
  {
    id: 'crypto-alts',
    label: 'Crypto Alts',
    items: [
      'LTCUSD', 'LINKUSD', 'AVAXUSD', 'MATICUSD', 'DOTUSD', 'TRXUSD',
      'ATOMUSD', 'NEARUSD', 'APTUSD', 'INJUSD', 'ARBUSD', 'OPUSD',
      'FILUSD', 'AAVEUSD', 'XLMUSD', 'BCHUSD', 'ETCUSD', 'TONUSD'
    ]
  }
];

// Плоский список — для совместимости со старым кодом (импорт PAIRS).
export const PAIRS = PAIR_CATEGORIES.flatMap((c) => c.items);

/** Единиц базового актива на 1.0 лот (как в спецификации брокера / Excel I2). */
export const DEFAULT_CONTRACT_SIZE_BY_SYMBOL = {
  // FX majors / crosses — стандартные 100k
  EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000, USDCHF: 100000,
  AUDUSD: 100000, USDCAD: 100000, NZDUSD: 100000,
  EURGBP: 100000, EURJPY: 100000, EURCHF: 100000, EURAUD: 100000,
  EURCAD: 100000, EURNZD: 100000,
  GBPJPY: 100000, GBPCHF: 100000, GBPAUD: 100000, GBPCAD: 100000, GBPNZD: 100000,
  AUDJPY: 100000, AUDNZD: 100000, AUDCAD: 100000, AUDCHF: 100000,
  CADJPY: 100000, CADCHF: 100000, CHFJPY: 100000,
  NZDJPY: 100000, NZDCHF: 100000, NZDCAD: 100000,

  // Crypto-CFD: 1 монета на 1.0 лот (типично; уточняй у брокера).
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1, XRPUSD: 1, BNBUSD: 1, ADAUSD: 1, DOGEUSD: 1,
  LTCUSD: 1, LINKUSD: 1, AVAXUSD: 1, MATICUSD: 1, DOTUSD: 1, TRXUSD: 1,
  ATOMUSD: 1, NEARUSD: 1, APTUSD: 1, INJUSD: 1, ARBUSD: 1, OPUSD: 1,
  FILUSD: 1, AAVEUSD: 1, XLMUSD: 1, BCHUSD: 1, ETCUSD: 1, TONUSD: 1,

  // Металлы (большинство брокеров)
  XAUUSD: 100, XAGUSD: 5000, XPTUSD: 100, XPDUSD: 100,

  // Сырьё (типичные брокерские CFD; могут отличаться у конкретного MT5)
  USOIL: 1000, UKOIL: 1000, NATGAS: 10000, COPPER: 25000,

  // Индексы (CFD; единица = 1$ за пункт у большинства)
  US500: 1, US100: 1, US30: 1, GER40: 1, UK100: 1, JPN225: 1,
  HK50: 1, AUS200: 1, FRA40: 1
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
