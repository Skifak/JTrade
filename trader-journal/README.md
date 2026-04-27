# 📊 Trader Journal

Локальный журнал трейдера на **Svelte 5 + Vite 8** с уклоном в ICT/SMC: ведение сделок, импорт MT5, риск-менеджмент, плейбуки, killzones, HTF bias, live-цены без API-ключей и расширенная статистика.

Собирается в **standalone HTML** (`vite-plugin-singlefile`) — после билда получается один `dist/index.html`, который открывается локально без сервера. Все данные живут в `localStorage` браузера.

---

## Возможности

### Сделки и P&L
- Открытые / закрытые, ручное создание + редактирование, дублирование закрытой как новой.
- Сортировка кликом по заголовку, фильтр по символу, итоговая строка для закрытых, иконка источника (📥 импорт MT5 / ✍️ ручная), длительность, pips, %.
- Расчёт P&L по формуле `(close − open) × dir × volume × contractSize − commission − swap` с грубой FX-конвертацией для пар `USDXXX`. Размер контракта берётся из справочника по символу с эвристиками для металлов / крипты / FX-пар (см. `getContractSize` в `src/lib/utils.js`).
- Плавающий P/L по live-цене на каждом тике WS.

### Импорт MT5
Парсер `src/lib/mt5Parser.js` принимает HTML-отчёты, экспортированные из терминала MT5 (**Журнал → Сохранить как...** → `*.html`):

| Тип отчёта                    | Заголовок (`<title>`)        | Куда импортируется |
|--------------------------------|------------------------------|--------------------|
| Открытые позиции               | `…Торговый отчёт`           | open trades + `marketPrice`, `swap`, `floatingProfit` |
| История                        | `…Отчёт торговой истории`   | closed trades с раздельными `priceOpen` / `priceClose` + commission/swap/profit + комментарии (привязка из секции «Сделки» по `dateClose + symbol`) |

Импорт делает **merge по `id`** (открытая = `mt5_open_<position>`, закрытая = `mt5_pos_<position>`), повторный импорт того же файла **обновит** существующие записи, ручные сделки не трогаются. Закрытые сделки с тегом `mt5-history-report` берут `profit` напрямую из колонки «Прибыль» отчёта и не пересчитываются, пока пользователь не правит цены/объём/направление вручную.

### Риск-менеджмент (`src/lib/risk.js`)
Единый чистый модуль, вызывается из формы сделки, HUD и статистики:
- `calculateTradeRisk` / `suggestVolumeForRisk` — потенциальный риск и обратный расчёт лота под `maxRiskAmount`.
- **Anti-martingale** (`getCurrentRiskScale`): после серии убытков предлагаемый объём режется (1.0 → 1.0 → 0.5 → 0.25 → 0.125), включается флагом `streakScalingEnabled` в профиле.
- **Daily PnL / period PnL / streak / floating PnL aggregate**.
- **Pre-trade gate** (`evaluateTradeRules`): нет SL, риск выше лимита, R:R < 1, лимит открытых позиций, дневной стоп, серия убытков, противоположная позиция (хедж), cooldown, чек-лист из заметок профиля, обязательные правила выбранного play, killzone-мисматч, против HTF bias.
- **Kill-switch** (`checkDailyStop`) — блокировка кнопки «Новая сделка» при пробитии дневного лимита убытка, баннер до полуночи.
- **Cooldown после убытка** (`src/lib/cooldown.js`) — таймер хранится в `localStorage`, переживает перезагрузку.
- **Discipline Score** (`getDisciplineScore`) — % сделок без зарегистрированных нарушений, what-if equity «без нарушений».
- **Equity curve** (`getEquityCurve`) — две линии: real и disciplined.

### Плейбуки и ICT (`src/lib/playbooks.js`, `src/lib/ictTaxonomy.js`)
- Иерархия `Strategy → Play → Rule`. У каждого play: `killzones[]`, `htfRequirement` (`any|aligned|against`), `preconditions[]`, `entryConditions[]`, `invalidations[]`, `rr {min, target}`.
- Дефолтная стратегия `ICT — базовый` с тремя play (London KZ FVG+OTE, Silver Bullet 10–11 NY, Judas Swing reverse).
- Импорт/экспорт плейбуков как JSON, CRUD стратегий/play/правил из вкладки **Плейбуки**.
- ICT-таксономия по 4 осям: `narrative` / `structure` / `poi` / `execution` (Judas Swing, MSS, FVG, OB, OTE 62/70.5/79 и т.д.) — теги вида `poi:fvg`, `execution:ote-705`.

### HTF Bias (`src/lib/htfBias.js`)
Лог направленческого bias по символам с привязкой к дате: `daily` / `h4` ∈ `bull|bear|neutral`, `keyLevels[]`, `reasoning`. Один bias на `(symbol, date)` — повторный upsert обновляет. `findActiveBias` возвращает запись на сегодня или последнюю за 7 дней. `isAlignedWithBias(bias, direction)` используется в pre-trade rules и в Statistics для разреза «по bias / против bias».

### Killzones (`src/lib/killzones.js`, `src/lib/journalSettings.js`)
- Дефолтные окна: ASIA / LO / LDN / NYAM / SB / LCK / NYPM (см. `src/lib/killzoneData.js`).
- Время считается в **выбранном TZ журнала** (по умолчанию `America/New_York`, переключается в **Параметры**).
- Поддержка `wrap` для окон через полночь (Asia 20:00 → 00:00).
- Приоритет для `primaryKillzone` настраивается; в UI показывается тег KZ + сетап в колонке таблицы.
- Окна, TZ и приоритет можно редактировать в `JournalSettingsModal`.

### Статистика (`Statistics.svelte`)
Дашборд с фильтрами по периоду / направлению / тегу / play / killzone и переключателем `disciplinedOnly`:
- Net profit, gross profit/loss, profit factor, expectancy, win rate, серии (макс/средние, по числу и сумме), max drawdown ($/%), recovery factor, упрощённый Sharpe.
- **Equity curve** (real + disciplined).
- **Heatmaps**: PnL по часам, по дням недели, по killzone, по тегам, по play.
- **HTF Bias alignment**: aligned vs against vs unknown.
- Long/short split, период, средний лот.

### Live-цены по WebSocket (без ключей)
Два WS-источника, оба бесплатные и без аутентификации.

#### Крипта → Binance Spot WS (`src/lib/binanceWs.js`)
```
wss://stream.binance.com:9443/stream?streams=btcusdt@bookTicker/btcusdt@aggTrade
```
Подписка на **`@bookTicker` + `@aggTrade`** на каждый символ — bookTicker даёт mid `(bid+ask)/2`, aggTrade даёт last trade price. Вместе покрывают все микродвижения. Reconnect с экспоненциальным backoff (1c → 2c → 4c → … → 15c). Хвост `USD` автоматически становится `USDT`: `BTCUSD → BTCUSDT`.

#### FX / металлы / сырьё / индексы → TradingView WS (`src/lib/tradingViewWs.js`)
```
wss://data.tradingview.com/socket.io/websocket
```
Публичный data-feed TradingView. Протокол неофициальный, реверс-инжиниринговый: каждое сообщение оборачивается в `~m~LENGTH~m~JSON`, есть heartbeat-фреймы `~h~N` (отвечаем эхом), сессия создаётся через `quote_create_session`, подписка — `quote_add_symbols` + `quote_fast_symbols`, цены приходят в событиях `qsd` с полем `lp` (last price). При отсутствии `lp` берём mid `(bid+ask)/2`.

Маппинг тикеров живёт в `defaultMapSymbol` и **сознательно сделан через `OANDA:`-префикс** для FX/металлов/сырья/индексов:
- На anonymous-токене `FX:`, `FX_IDC:`, `TVC:`, `SP:`, `NASDAQ:`, `DJ:` обычно отдают **delayed** котировки (минуты — десятки минут).
- `OANDA:` (форекс-брокер пушит свои собственные потоки) и `BINANCE:` отдают **realtime tick-by-tick**.
- Поэтому: FX 6-char → `OANDA:EURUSD`, металлы → `OANDA:XAU/XAG/XPT/XPDUSD`, нефть → `OANDA:WTICO/BCOUSD`, нефть/газ/медь → `OANDA:NATGASUSD/XCUUSD`, индексы → `OANDA:SPX500/NAS100/US30/DE30/UK100/JP225/HK33/AU200/FR40`.
- Soft commodities у OANDA нет — остаются фьючерсы `ICEUS:CC1!/KC1!/SB1!`, `CBOT:ZW1!/ZC1!` (могут быть delayed).

> ⚠️ TradingView WS не имеет публичного контракта. Они в любой момент могут поменять протокол или начать резать неаутентифицированные сессии. На момент 2026 работает.

#### Стор и интеграция (`src/lib/livePrices.js`)
```js
livePrices.setPairs(['EURUSD', 'BTCUSD', 'XAUUSD']);
// Crypto → Binance, остальное → TradingView. WS поднимаются автоматически.
livePrices.start();   // запустить tickClock (для UI обновления "возраста")
livePrices.stop();    // закрыть оба WS
```
В `App.svelte` `livePrices.setPairs(openTrades.map(t => t.pair))` дёргается реактивно при изменении состава открытых сделок. WS пересоздаётся только когда состав действительно поменялся. Колонка **Плав. P/L** автоматически пересчитывается на каждом тике через `calculateFloatingProfit(trade, livePrice)`.

В дев-сборке доступна диагностика из консоли:
```js
__livePrices.snapshot();   // текущие цены
__livePrices.ping();       // состояние WS-провайдеров
__livePrices.debug();      // mapping internalKey ↔ tvSymbol / binSymbol
__livePrices.enableLog();  // включить debug-лог WS, перезагрузить страницу
```

#### REST-фасад (`src/lib/marketData.js`)
Используется только в форме сделки для одноразового снапшота по чекбоксу **📡 По рынку** (поднимать WS на одно нажатие смысла нет). Маршрутизация: крипта → Binance REST, всё остальное → **Stooq CSV**.

> ⚠️ Stooq отдаёт `Access-Control-Allow-Origin: *` непостоянно — на старых/географически удалённых клиентах может прилетать `NetworkError when attempting to fetch resource` из-за CORS. В этом случае «По рынку» не сработает; используй live из WS-тика, который уже подтянулся в открытую сделку.

#### Пинг
В тулбаре две пилюли — `Binance` и `TradingView`. Показывают **возраст последнего тика** от провайдера + время с последнего изменения цены (Δ):
- 🟢 < 10 сек — соединение живое, тики идут.
- 🟡 10–60 сек — WS открыт, но тиков давно нет (выходной по FX, низкая активность).
- 🔴 ошибка коннекта.
- ⚪ провайдер не нужен (например, в открытых только крипта).

`tickClock` обновляется раз в секунду — UI пересчитывает «возраст» сам, без принудительного refresh.

### Профиль (`ProfileModal`)
- Начальный капитал, валюта счёта (с live-конвертацией через [Frankfurter](https://frankfurter.dev) — без API-ключа).
- Риск на сделку (% или $), дневной лимит убытка (% или $), цели D/W/M/Y (% или $).
- Лимиты: `maxOpenTrades`, `maxConsecutiveLosses`.
- Заметки = чек-лист (каждая непустая строка → пункт; `#` — комментарий).
- Cooldown после убыточной сделки (минуты), флаг `streakScalingEnabled` (anti-martingale), `dailyReviewEnabled`.

### Risk HUD (`RiskHud.svelte`)
Полоса в шапке: дневной PnL vs лимит, серия (W/L) с цветом, прогресс к цели дня/недели/месяца/года, открытый риск Σ, discipline score, индикатор cooldown.

### Daily Review
Если PnL дня перевалил за цель и сегодня обзор не показывали — открывается `DailyReviewModal` (вопросы по дисциплине, что сработало, что нет). Записывается флаг `lastDailyReviewDate`, повторно за день не лезет. Отключается в профиле.

### Темы (`src/lib/theme.js`)
4 темы, переключаются через `[data-theme=...]` на `<html>`, сохраняются в `localStorage`:
- `light` — белая.
- `beige` — бежевая (paper).
- `dark` — тёмная.
- `neon` — ICT-палитра (тёмный фон + неоновые акценты).

### World clock
В шапке тикают часы 4-х городов (Пекин / Лондон / Нью-Йорк / Москва) — для оперативной ориентации в торговых сессиях.

### Гайд
Вкладка **Гайд** — встроенный мануал по всем фичам (`GuideView.svelte`).

### Тосты (`Toasts.svelte` + `src/lib/toasts.js`)
`toasts.info() / warn() / error()`. Используются при ошибках сохранения localStorage (включая `QuotaExceededError` с автобэкапом битых данных), импорта/экспорта, network errors live-цен.

### Экспорт/импорт
- **Экспорт JSON** — все сделки в `trades_<timestamp>.json` (без профиля, без плейбуков).
- **Импорт** принимает `*.json` (заменяет массив сделок) или `*.html`/`*.htm` (отчёт MT5, см. выше).
- Плейбуки экспортируются/импортируются отдельно во вкладке **Плейбуки**.

---

## Стек

- **Svelte 5** (legacy syntax, без runes) + **Vite 8**
- `vite-plugin-singlefile` — сборка в один HTML-файл
- `dayjs` — даты
- `uuid` — id сделок / плейбуков / правил
- Хранение: `localStorage`, без бэкенда

---

## Установка и запуск

Требуется Node.js 18+.

```bash
npm install
npm run dev      # дев-сервер с HMR (порт 5173)
npm run build    # сборка в dist/index.html (один файл)
npm run preview  # предпросмотр продакшен-сборки
```

После `npm run build` в `dist/` лежит один HTML-файл со всем CSS/JS внутри — можно открыть напрямую в браузере или положить на любой статический хостинг. Все данные пользователя — в его `localStorage`, между устройствами не синхронизируются.

---

## Структура проекта

```
src/
├── App.svelte                    # корень: вкладки, импорт/экспорт, шапка, kill-switch, темы
├── main.js                       # bootstrap
├── app.css                       # CSS-переменные тем + общие стили
├── lib/
│   ├── stores.js                 # writable stores: trades, templates, userProfile
│   ├── constants.js              # PAIRS, DEFAULT_CONTRACT_SIZE_BY_SYMBOL, normalizeSymbolKey
│   ├── utils.js                  # createNewTrade, calculateProfit/FloatingProfit, calculateStats,
│   │                             # calculatePips/Percent, formatDuration, getTradeSource,
│   │                             # getConversionQuote (Frankfurter)
│   ├── risk.js                   # риск-менеджмент: pre-trade rules, daily stop, streak,
│   │                             # discipline, equity curve, time-of-day analytics
│   ├── cooldown.js               # cooldown после убыточной сделки + persist
│   ├── theme.js                  # 4 темы + persist в localStorage
│   ├── worldClock.js             # часы 4 городов в шапке
│   ├── killzones.js              # detectKillzones, primaryKillzone, getPnLByKillzone
│   ├── killzoneData.js           # дефолтные окна + приоритет
│   ├── journalSettings.js        # настройки журнала: TZ, killzones, приоритет
│   ├── playbooks.js              # стратегии / play / правила + дефолтная ICT-стратегия
│   ├── ictTaxonomy.js            # narrative / structure / poi / execution теги
│   ├── htfBias.js                # лог bias daily/h4 + key levels + reasoning
│   ├── livePrices.js             # оркестратор Binance WS + TradingView WS
│   ├── binanceWs.js              # клиент Binance combined streams (bookTicker + aggTrade)
│   ├── tradingViewWs.js          # клиент TradingView WS, OANDA-mapping
│   ├── marketData.js             # REST-фасад: Binance + Stooq (одноразовый снапшот)
│   ├── mt5Parser.js              # парсер HTML-отчётов MT5 (Trade Report + History)
│   └── toasts.js                 # store тостов
└── components/
    ├── Modal.svelte              # базовое модальное окно
    ├── TradeForm.svelte          # форма add / close / edit / edit-closed + ICT-теги + play-чек-лист
    ├── ProfileModal.svelte       # профиль трейдера
    ├── BiasModal.svelte          # редактор HTF bias по символу/дате
    ├── JournalSettingsModal.svelte  # TZ + killzones + приоритет
    ├── RiskHud.svelte            # HUD с дневным PnL, целями, дисциплиной, cooldown
    ├── RiskConfirmModal.svelte   # soft-confirm для нарушений pre-trade rules
    ├── DailyReviewModal.svelte   # дневной обзор после достижения цели
    ├── PlaybookView.svelte       # вкладка «Плейбуки»: CRUD стратегий/play, статистика
    ├── Statistics.svelte         # дашборд статистики
    ├── GuideView.svelte          # вкладка «Гайд»
    └── Toasts.svelte             # рендер тостов
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
  dateOpenManual: false,
  dateClose: '2026-04-25 11:30:00' | null,
  commission: -0.07,              // отрицательная = брокеру
  swap: 0,
  profit: 12.50 | null,           // итог по сделке (см. ниже)
  contractSize: null | number,    // override; null = из справочника
  tags: ['mt5', 'mt5-history-report', 'poi:fvg', 'execution:ote-705'] | [],
  templateUsed: null,
  comment: '',
  // playbook + risk:
  strategyId: 'default-ict' | null,
  playId: 'play-fvg-ote' | null,
  killzone: 'SB' | null,           // override; null = автоопределение по dateOpen
  ruleViolations: [{severity, code, message}, ...],  // зафиксированные при создании
  acknowledgedChecklist: ['...'],
  acknowledgedPlayRules: ['...']
}
```

### Расчёт P&L

```
units    = volume × contractSize(pair)
priceDiff= (priceClose − priceOpen) × (long ? +1 : -1)
rawPnL   = priceDiff × units
profit   = rawPnL − commission − swap
```

Для **классических FX 6 букв** делается грубая конвертация в USD: если база = `USD` (USDJPY и т.п.), `rawPnL /= priceClose`. Для пар вида `XXXUSD` ничего не делается (профит уже в USD). Для **кроссов без USD** (EURGBP) курс не подтягивается — цифра остаётся в котируемой валюте.

Размер контракта берётся в таком порядке (`getContractSize` в `utils.js`):
1. Явный override `trade.contractSize` (если задан и > 0).
2. Справочник `DEFAULT_CONTRACT_SIZE_BY_SYMBOL` (`EURUSD: 100000`, `BTCUSD: 1`, ...).
3. Эвристика по префиксу: `XAU* → 100`, `XAG* → 5000`, `BTC|ETH|SOL|...USD → 1`.
4. Любые остальные 6 букв → классический FX `100000`.
5. Иначе → `1` (индексы, нефть, акции — настраивай вручную).

---

## Хранение данных (`localStorage`)

| Ключ                          | Что хранит                                          |
|-------------------------------|-----------------------------------------------------|
| `trades`                      | массив сделок                                       |
| `templates`                   | пресеты для быстрых сделок                          |
| `userProfile`                 | капитал, валюта, риск, цели, лимиты, заметки, флаги |
| `theme`                       | id выбранной темы (`light`/`beige`/`dark`/`neon`)   |
| `journalSettings_v1`          | TZ для killzones, окна, приоритет                   |
| `strategies`                  | плейбуки (стратегии → play → правила)               |
| `htfBiasLog`                  | лог bias по символам/датам                          |
| `cooldownUntil`               | ms-таймстамп до окончания cooldown (или отсутствует)|
| `__corrupt_backup_<ts>`       | автобэкапы битого JSON (если парсер упал)           |

При `QuotaExceededError` показывается тост с предложением удалить часть закрытых сделок или экспортнуть их в JSON.

---

## Известные ограничения

- **Кроссы FX без USD** (например `EURGBP`) считаются в котируемой валюте, не пересчитываются в USD.
- **Индексы / нефть / акции**: размер контракта по умолчанию `1`, нужно задавать вручную через `trade.contractSize` или расширять `DEFAULT_CONTRACT_SIZE_BY_SYMBOL`.
- **`marketPrice` в отчёте MT5** — снимок на момент генерации файла. В UI поверх него подставляется live из Binance/TradingView, исходная цифра остаётся как fallback.
- **Sharpe** упрощённый: `mean(profit) / std(profit)`, не классический «дневной с risk-free».
- **Просадка** считается только по закрытым сделкам, без intraday MFE/MAE (нужны тики).
- **Частичные закрытия** позиции в один и тот же момент могут привести к ложной привязке комментария к чужой позиции (в практике редкий кейс).
- **TradingView WS неофициальный**. Если задепрекейтят протокол или начнут отдавать ошибку для anonymous-сессий, FX/металлы/сырьё перестанут обновляться. Тогда нужен fallback на платный API (Twelve Data, Finnhub, OANDA).
- **Не все брокерские тикеры мапятся в TV/OANDA**. Если у тебя пара, которую `defaultMapSymbol` не знает, она просто не подпишется. Расширь список в `src/lib/tradingViewWs.js`.
- **Binance** покрывает только крипту, торгующуюся на бирже. Экзотика (пары без USDT) может не подняться.
- **Stooq REST CORS** — на части клиентов «По рынку» в форме сделки может падать с `NetworkError`. На live-цены в таблице открытых это не влияет (они идут через WS).
- **Нет синка между устройствами** — данные в `localStorage` одного браузера. Бэкап = «Экспорт» вручную.

---

## Лицензия

Проект для личного использования.
