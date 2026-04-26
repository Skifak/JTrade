# 📊 Trader Journal

Локальный журнал трейдера на Svelte + Vite. Хранит сделки в `localStorage`, импортирует HTML-отчёты MT5, считает P&L по справочнику размеров контрактов и подтягивает live-цены через Binance / FCSAPI.

Собирается в **одностраничный standalone-HTML** (`vite-plugin-singlefile`) — после билда получается один файл, который можно открыть локально без сервера.

---

## Возможности

- **Сделки**: открытые / закрытые, ручное создание + редактирование, дублирование закрытой как новой.
- **Импорт MT5**:
  - «Торговый отчёт» (`Report Trade...html`) → секция «Позиции» = открытые сделки + рыночная цена + плавающий P&L + своп.
  - «Отчёт торговой истории» (`Report History...html`) → секция «Позиции» = закрытые сделки с раздельными ценами открытия/закрытия + комментарии (привязка из секции «Сделки» по `dateClose + symbol`).
- **Расчёт P&L** по формуле `(close − open) × dir × lot × contract_size − commission − swap`. Размер контракта берётся из справочника по символу (FX/металлы/крипта).
- **Live-цены по WebSocket** без API-ключей: Binance Spot WS (крипта, реалтайм) + TradingView WS (FX, металлы, нефть/газ, индексы). Плавающий P/L пересчитывается на каждом тике. Пилюли пинга в тулбаре показывают возраст последнего тика.
- **Статистика как в MT5**: чистая прибыль, gross profit/loss, profit factor, expectancy, max drawdown ($/%), recovery factor, упрощ. Шарп, серии (макс/средние, по числу и сумме), long/short split, период.
- **Таблицы**: сортировка кликом по заголовку, фильтр по символу, итоговая строка для закрытых, иконка источника (📥 импорт MT5 / ✍️ ручная), длительность, pips, %.
- **Профиль**: начальный капитал, валюта счёта (с live-конвертацией через [Frankfurter](https://frankfurter.dev)), риск на сделку (% или $), дневной лимит убытка, цели D/W/M/Y, лимиты позиций, заметки.
- **Экспорт/импорт JSON** для бэкапа всех сделок.

---

## Стек

- **Svelte 5** (legacy syntax, без runes) + **Vite 8**
- `vite-plugin-singlefile` — сборка в один HTML-файл
- `dayjs` — даты
- `uuid` — id сделок
- Хранение: `localStorage` (ключи: `trades`, `templates`, `userProfile`)

---

## Установка и запуск

Требуется Node.js 18+.

```bash
npm install
npm run dev      # дев-сервер с HMR
npm run build    # сборка в dist/index.html (один файл)
npm run preview  # предпросмотр продакшен-сборки
```

После `npm run build` в `dist/` будет один HTML-файл со всем CSS/JS внутри — можно открыть напрямую в браузере или положить на любой статический хостинг.

---

## Структура проекта

```
src/
├── App.svelte                # корень: вкладки (Открытые / Закрытые / Статистика), импорт/экспорт
├── lib/
│   ├── stores.js             # writable stores: trades, templates, userProfile (+ персист в localStorage)
│   ├── constants.js          # PAIRS, DEFAULT_CONTRACT_SIZE_BY_SYMBOL, normalizeSymbolKey, шаблоны
│   ├── utils.js              # createNewTrade, calculateProfit, calculateStats,
│   │                         # calculatePips/Percent, formatDuration, getTradeSource,
│   │                         # getConversionQuote (Frankfurter)
│   ├── mt5Parser.js          # парсер HTML-отчётов MT5 (Trade Report + History)
│   └── marketData.js         # fetchMarketPrice → Binance / FCSAPI
└── components/
    ├── Modal.svelte          # базовое модальное окно
    ├── TradeForm.svelte      # форма add / close / edit / edit-closed + чекбокс «По рынку»
    ├── ProfileModal.svelte   # профиль трейдера (капитал, риск, цели, API-ключи)
    └── Statistics.svelte     # дашборд статистики
```

---

## Модель сделки

```js
{
  id: 'uuid' | 'mt5_open_<position>' | 'mt5_pos_<position>',
  pair: 'EURUSD',
  direction: 'long' | 'short',
  status: 'open' | 'closed',
  volume: 0.01,                   // лоты
  priceOpen: 1.09000,
  priceClose: 1.09250 | null,
  marketPrice: 1.09120 | null,    // только для импорта открытых из MT5
  sl: 1.08800 | null,
  tp: 1.09500 | null,
  dateOpen: '2026-04-25 10:00:00',
  dateClose: '2026-04-25 11:30:00' | null,
  commission: -0.07,              // отрицательная = брокеру
  swap: 0,
  profit: 12.50 | null,           // итог по сделке (см. ниже)
  contractSize: null | number,    // override; null = из справочника
  tags: ['mt5', 'mt5-history-report'] | ['mt5', 'mt5-trade-report'] | [],
  templateUsed: null,
  comment: ''
}
```

---

## Расчёт P&L

Базовая формула в `calculateProfit(trade)`:

```
units    = volume × contractSize(pair)
priceDiff= (priceClose − priceOpen) × (long ? +1 : -1)
rawPnL   = priceDiff × units
profit   = rawPnL − commission − swap
```

Для **классических FX 6 букв** делается грубая конвертация в USD: если база = `USD` (USDJPY и т.п.), `rawPnL /= priceClose`. Для пар вида `XXXUSD` ничего не делается (профит уже в USD). Для **кроссов без USD** курс не подтягивается — цифра остаётся в котируемой валюте.

Размер контракта берётся в таком порядке (`getContractSize` в `utils.js`):

1. Явный override `trade.contractSize` (если задан и > 0).
2. Справочник `DEFAULT_CONTRACT_SIZE_BY_SYMBOL` (`EURUSD: 100000`, `BTCUSD: 1`, ...).
3. Эвристика по префиксу: `XAU* → 100`, `XAG* → 5000`, `BTC|ETH|SOL|...USD → 1`.
4. Любые остальные 6 букв → классический FX `100000`.
5. Иначе → `1` (индексы, нефть, акции — настраивай вручную).

### Импорт MT5 — другая логика

Для сделок с тегом `mt5-history-report` поле `profit` **берётся напрямую из колонки «Прибыль» отчёта** и **не пересчитывается**, пока пользователь не правит цены/объём/направление вручную в форме. Логика управляется функциями `isBrokerImportedTrade(trade)` и `tradeFieldsEdited(original, current)` в `TradeForm.svelte`.

---

## Импорт отчётов MT5

В терминале MT5: **«Журнал → Сохранить как...»** → выбрать `*.html` (`Internet Explorer (*.htm; *.html)`).

Парсер (`src/lib/mt5Parser.js`):

| Тип отчёта                  | Заголовок (`<title>`)         | Какая секция читается | Что в неё кладётся                     |
|------------------------------|--------------------------------|------------------------|---------------------------------------|
| Открытые позиции             | `…Торговый отчёт`             | «Позиции»              | open trades + `marketPrice` + `swap` + `floatingProfit` |
| История                      | `…Отчёт торговой истории`     | «Позиции» (+ «Сделки» для комментариев) | closed trades с раздельными `priceOpen`/`priceClose` + commission/swap/profit |

Импорт делает **merge по `id`** (открытая = `mt5_open_<position>`, закрытая = `mt5_pos_<position>`), повторный импорт того же файла **обновит** существующие записи, ручные сделки не трогаются.

---

## Live-цены по WebSocket (без ключей)

Два WS-источника, оба бесплатные и без аутентификации.

### Крипта → Binance Spot WS

Файл `src/lib/binanceWs.js`.

```
wss://stream.binance.com:9443/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker
```

Подписка на **`@bookTicker`** — обновляется при каждом изменении лучшей котировки (true realtime). Цена считается как mid = (bid + ask) / 2. Reconnect с экспоненциальным backoff (1с → 2с → 4с → … → 15с).

Хвост `USD` в нашем тикере автоматически становится `USDT`: `BTCUSD → BTCUSDT`.

### FX / металлы / сырьё / индексы → TradingView WS

Файл `src/lib/tradingViewWs.js`.

```
wss://data.tradingview.com/socket.io/websocket
```

Это публичный data-feed, который TradingView использует у себя на сайте. Протокол неофициальный, реверс-инжиниринговый: каждое сообщение оборачивается в `~m~LENGTH~m~JSON`, есть heartbeat-фреймы `~h~N` (отвечаем эхом), сессия создаётся через `quote_create_session`, подписка — `quote_add_symbols` + `quote_fast_symbols`, цены приходят в событиях `qsd` с полем `lp` (last price).

Маппинг наших тикеров в TV-формат `<EXCHANGE>:<TICKER>` живёт в `defaultMapSymbol`:
- FX 6-char → `FX:EURUSD`, `FX:USDJPY` и т.д.
- Металлы → `OANDA:XAUUSD`, `OANDA:XAGUSD`, `OANDA:XPTUSD`, `OANDA:XPDUSD`.
- Сырьё → `TVC:USOIL`, `TVC:UKOIL`, `TVC:NATGAS`, `COMEX:HG1!`, `ICEUS:CC1!/KC1!/SB1!`, `CBOT:ZW1!/ZC1!`.
- Индексы → `SP:SPX` (US500), `NASDAQ:NDX` (US100), `DJ:DJI` (US30), `XETR:DAX` (GER40), `TVC:UKX` (UK100), `TVC:NI225`, `TVC:HSI`.

⚠️ TradingView WS не имеет публичного контракта. В принципе они могут поменять протокол или начать резать неаутентифицированные сессии. На момент 2026 работает.

### Стор и интеграция

Файл `src/lib/livePrices.js` оркестрирует оба WS-клиента:

```js
livePrices.setPairs(['EURUSD', 'BTCUSD', 'XAUUSD']);
// Crypto → Binance, остальное → TradingView. WS поднимаются автоматически.

livePrices.start();   // запустить tickClock (для UI обновления "возраста")
livePrices.stop();    // закрыть оба WS
```

В `App.svelte` `livePrices.setPairs(openTrades.map(t => t.pair))` дёргается реактивно при изменении состава открытых сделок. WS пересоздаётся только когда состав действительно поменялся. Колонка **Плав. P/L** автоматически пересчитывается на каждом тике через `calculateFloatingProfit(trade, livePrice)`.

### Пинг

В тулбаре две пилюли — `Binance` и `TradingView`. Показывают **возраст последнего тика** от провайдера:

- 🟢 < 5 сек — соединение живое, тики идут.
- 🟡 ≥ 5 сек — WS открыт, но тиков давно нет (выходной по FX, низкая активность).
- 🔴 — ошибка коннекта.
- ⚪ — провайдер не нужен (например, в открытых только крипта).

`tickClock` обновляется каждые 500 мс — UI пересчитывает «возраст» сам, без принудительного refresh.

### Использование при создании сделки

В `TradeForm.svelte` чекбокс **📡 По рынку** всё ещё дёргает REST через `fetchMarketPrice` — там нужен одноразовый снапшот, поднимать WS на одну сделку нет смысла.

### Известные ограничения

- **TradingView WS — неофициальный**. Если они задепрекейтят протокол или начнут отдавать ошибку для anonymous-сессий, FX/металлы/сырьё перестанут обновляться. Тогда нужен fallback на платный API (Twelve Data, Finnhub, OANDA).
- **Не все брокерские тикеры мапятся в TV**. Если у тебя пара, которую `defaultMapSymbol` не знает, она просто не подпишется. Расширь список в `src/lib/tradingViewWs.js`.
- **Binance** покрывает только крипту, торгующуюся на бирже. Экзотика (пары без USDT) может не подняться.

---

## Хранение данных

Всё в `localStorage` браузера:

- `trades` — массив сделок.
- `templates` — пресеты для быстрых сделок.
- `userProfile` — настройки трейдера + API-ключи.

**Бэкап**: «📤 Экспорт» — JSON со сделками (без профиля).
**Восстановление**: «📥 Импорт» — принимает `*.json` (восстановление сделок) или `*.html`/`*.htm` (отчёт MT5, см. выше).

---

## Известные ограничения

- **Кроссы FX без USD** (например `EURGBP`) считаются в котируемой валюте, не пересчитываются в USD.
- **Индексы / нефть / акции**: размер контракта по умолчанию `1`, нужно задавать вручную через `trade.contractSize` или расширять `DEFAULT_CONTRACT_SIZE_BY_SYMBOL`.
- **`marketPrice` в отчёте MT5** — снимок на момент генерации файла. В UI поверх него подставляется live из Binance/Stooq, исходная цифра остаётся как fallback.
- **Sharpe** упрощённый: `mean(profit) / std(profit)`, не классический «дневной с risk-free».
- **Просадка** считается только по закрытым сделкам, без intraday MFE/MAE (нужны тики).
- **Частичные закрытия** позиции в один и тот же момент могут привести к ложной привязке комментария к чужой позиции (в практике редкий кейс).

---

## Лицензия

Проект для личного использования.
