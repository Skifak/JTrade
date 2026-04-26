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
- **Live-цены** при создании сделки: чекбокс «📡 По рынку», запрос в Binance (крипта) или FCSAPI (FX/металлы), ключи задаются в профиле.
- **Статистика как в MT5**: чистая прибыль, gross profit/loss, profit factor, expectancy, max drawdown ($/%), recovery factor, упрощ. Шарп, серии (макс/средние, по числу и сумме), long/short split, период.
- **Таблицы**: сортировка кликом по заголовку, фильтр по символу, итоговая строка для закрытых, иконка источника (📥 импорт MT5 / ✍️ ручная), длительность, pips, %.
- **Профиль**: начальный капитал, валюта счёта (с live-конвертацией через [Frankfurter](https://frankfurter.dev)), риск на сделку (% или $), дневной лимит убытка, цели D/W/M/Y, лимиты позиций, заметки, API-ключи.
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

## Live-цены (Binance + FCSAPI)

Файл `src/lib/marketData.js`. Функция `fetchMarketPrice(pair, { binanceKey, fcsapiKey })` маршрутизирует запрос:

- **Крипта** (`BTCUSD`, `ETHUSD`, `SOLUSD` и т.д.) → `https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`. Хвост `USD` автоматически меняется на `USDT`. Ключ `apiBinanceKey` необязателен; если задан, отправляется в заголовке `X-MBX-APIKEY`.
- **FX / металлы** (`EURUSD`, `USDJPY`, `XAUUSD`, `XAGUSD`, кроссы) → `https://fcsapi.com/api-v3/forex/latest?symbol=EUR/USD&access_key=...`. Ключ **обязателен**, без него возвращается ошибка.
- **Индексы / нефть / акции** не поддерживаются — возвращается ошибка `Тип инструмента ... не поддерживается для live-цены`.

### Где задаются ключи

**Профиль → API ключи (рыночные данные)**: поля типа `password` с переключателем 👁️/🙈. Хранятся в `localStorage` (ключ `userProfile`). При экспорте сделок (`exportData` в `App.svelte`) выгружаются только `trades`, профиль и ключи **не выгружаются**.

### Где используются

В `TradeForm.svelte` под полем «Цена открытия» — чекбокс **📡 По рынку**. При включении или смене пары в режиме `add` автоматически вызывается `fetchMarketPrice` и подставляет результат в `priceOpen`. Кнопка ↻ — ручной refresh. Источник и время отображаются под полем.

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
- **`marketPrice` в отчёте MT5** — снимок на момент генерации файла, не live (но в форме создания сделки live работает через API).
- **FCSAPI бесплатные тарифы** имеют квоты — при превышении 429 виден текст ошибки от API.
- **Sharpe** упрощённый: `mean(profit) / std(profit)`, не классический «дневной с risk-free».
- **Просадка** считается только по закрытым сделкам, без intraday MFE/MAE (нужны тики).
- **Частичные закрытия** позиции в один и тот же момент могут привести к ложной привязке комментария к чужой позиции (в практике редкий кейс).

---

## Лицензия

Проект для личного использования. API-ключи Binance/FCSAPI — твои; следи, чтобы они не утекли через скриншоты или дамп localStorage.
