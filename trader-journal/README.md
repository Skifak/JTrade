# 📊 Trader Journal

Локальный журнал трейдера на **Svelte 5 + Vite 8** с уклоном в ICT/SMC: ведение сделок, импорт MT5, риск-менеджмент, плейбуки, killzones, HTF bias, live-цены без API-ключей и расширенная статистика.

Доступно два варианта запуска:
1. **Standalone HTML** — `vite-plugin-singlefile` собирает один `dist/index.html` со всем CSS/JS внутри. Открыть из любого статического хостинга / `npm run preview`.
2. **Десктоп-приложение через Tauri 2** — нативная WebView2-обёртка для Windows (см. [секцию ниже](#tauri-десктоп-сборка)). Решает проблему `file://` + WebSocket: WS к Binance / TradingView в Tauri живут так же, как в `npm run dev`.

Метаданные (сделки, профиль, глоссарий, журнал дня и т.д.) живут в **`localStorage`** браузера / WebView. **Файлы изображений** к терминам глоссария и к закрытым сделкам хранятся отдельно: в **Tauri** — в `%AppData%\…\trader-journal-assets`; в чистом браузере — в **IndexedDB**, чтобы не забивать квоту JSON.

### Конфиденциальность и данные
- **Свой сервер** у приложения нет: сделки, профиль и глоссарий **нигде не отсылаются** разработчику.
- **Локальное хранение не шифруется** — доступ к диску/профилю Windows = теоретический доступ к JSON в `localStorage` и к файлам вложений. Чужие ZIP/JSON-экспорты скачивай и открывай осознанно.
- **Сеть** используется только по твоему сценарию: публичные **WebSocket/REST** к рыночным фидам (Binance, TradingView, Stooq и т.д.) — это не телеметрия приложения, а котировки/снапшоты по документированным в README URL.
- **Экспорт/импорт** (в т.ч. ZIP с фото) — твой файл; куда положил бэкап, с тем и делись.

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

### Журнал дня (`DayJournalView.svelte`, `src/lib/dayJournal.js`)
Вкладка **Журнал** — дневник по датам: настроение, план, настраиваемый чек-лист, ревью и уроки. Данные в `localStorage` (`dayJournal_v1`).

### Глоссарий (`GlossaryView.svelte`, `src/lib/glossary.js`)
Энциклопедия терминов по категориям; стартовый набор ICT. К карточке можно прикреплять скриншоты, смотреть их в лайтбоксе, удалять.

### Вложения (фото) к сделкам и терминам (`AddImageModal`, `ImageCropModal`, `ImageLightbox`, `src/lib/attachmentApi.js`)
- Модалка добавления: зона ввода остаётся «пустой», файлы отображаются **снизу миниатюрами**; вставка Ctrl+V, файлы, drag&drop; у миниатюры — удаление; клик — **обрезка** (cropper) с сохранением в WebP и откатом шага рамки.
- У **закрытых** сделок в таблице — те же кнопки просмотра / добавления фото.
- В **Tauri** бинарники пишутся командами `tauri_attachments_*` в подкаталог `trader-journal-assets`; в браузере — IndexedDB.

### Гайд
Вкладка **Гайд** — встроенный мануал по всем фичам (`GuideView.svelte`).

### Тосты (`Toasts.svelte` + `src/lib/toasts.js`)
`toasts.info() / warn() / error()`. Используются при ошибках сохранения localStorage (включая `QuotaExceededError` с автобэкапом битых данных), импорта/экспорта, network errors live-цен.

### Экспорт/импорт
- **Экспорт JSON (кнопка рядом с ZIP)** — только массив **сделок** в один файл (без профиля, без глоссария, без вложений).
- **Экспорт ZIP** — бандл: сделки, глоссарий, папка с файлами иллюстраций; полный бэкап для переноса.
- **Импорт** — `*.zip` (полная замена согласно диалогу), `*.json` (сделки без смены глоссария и без фото), `*.html`/`*.htm` (отчёт MT5, см. выше).
- Плейбуки экспортируются/импортируются отдельно во вкладке **Плейбуки**.

---

## Стек

- **Svelte 5** (legacy syntax, без runes) + **Vite 8**
- `vite-plugin-singlefile` — сборка в один HTML-файл
- `dayjs` — даты
- `uuid` — id сделок / плейбуков / правил
- `jszip` — архивы экспорта/импорта
- `cropperjs` — обрезка скриншотов перед сохранением
- Хранение: `localStorage` + IndexedDB (вложения в браузере) / AppData (вложения в Tauri), без бэкенда

---

## Установка и запуск (веб)

Требуется Node.js 18+.

```bash
npm install
npm run dev      # дев-сервер с HMR (порт 5173)
npm run build    # сборка в dist/index.html (один файл)
npm run preview  # предпросмотр продакшен-сборки на http://localhost:4173
```

После `npm run build` в `dist/` лежит один HTML-файл со всем CSS/JS внутри. **Открывать его двойным кликом (`file://`) не рекомендуется**: WebSocket к Binance/TradingView в части браузеров режется при `Origin: null`, и live-цены замолкают. Корректные способы запустить веб-вариант:

- `npm run preview` (локальный static-сервер на 4173).
- `npx serve dist` / nginx / GitHub Pages / Cloudflare Pages.
- Любой другой `http://` или `https://` URL — Origin будет валидным, WS заработают.

Если нужен запуск без какого-либо сервера у пользователя — собирай **Tauri-десктоп** (см. ниже): он обходит проблему `file://` за счёт встроенного WebView2 со своим origin (`https://tauri.localhost`).

Все данные пользователя — в его `localStorage`/WebView, между устройствами не синхронизируются.

---

## Tauri-десктоп-сборка

Tauri 2 оборачивает фронт в нативное окно с **WebView2** (Edge/Chromium) и отдаёт страницу не как `file://`, а как `https://tauri.localhost/...`. Из-за этого:

- WebSocket к `wss://stream.binance.com:9443` и `wss://data.tradingview.com` рукопожимают **с валидным `Origin`** — провайдеры не режут запросы.
- HTTPS-запросы (Stooq, Frankfurter, Binance REST) тоже не упираются в CORS, как при `file://`.
- Получается единый `.exe` (или `.msi`/`.nsis`-инсталлятор), который пользователь запускает двойным кликом.

### Зависимости (Windows 10/11, разовая настройка)

| Что          | Зачем                                  | Как поставить |
|--------------|----------------------------------------|---------------|
| Node.js 18+  | фронт                                  | `winget install OpenJS.NodeJS.LTS` |
| MSVC Build Tools 2022+ | C-линкер для Rust          | `winget install Microsoft.VisualStudio.2022.BuildTools` (компонент **Desktop development with C++**) |
| WebView2 Runtime | сам WebView                        | в Win 10 21H2+/Win 11 уже есть. Иначе [скачать с Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| Rust (rustup) | компилятор Tauri-обёртки              | `winget install Rustlang.Rustup` либо с [rustup.rs](https://rustup.rs/) |

После установки Rust перезапусти PowerShell, проверь:

```powershell
rustc --version
cargo --version
npx tauri info
```

`npx tauri info` должен показать `[✔] Environment` без красных пунктов.

### Команды

```powershell
# дев-режим: Tauri запустит vite dev сам, дождётся 5173 и откроет окно с HMR
npm run tauri:dev

# одноразово сгенерировать иконки из любой квадратной PNG (1024x1024 рекомендуется)
npm run tauri:icon ./path/to/source.png

# релизный билд: dist/index.html → exe + msi/nsis-инсталлятор
npm run tauri:build
```

Артефакты билда:
- `src-tauri/target/release/Trader Journal.exe` — голый бинарник.
- `src-tauri/target/release/bundle/msi/*.msi` — MSI-инсталлятор.
- `src-tauri/target/release/bundle/nsis/*-setup.exe` — NSIS-инсталлятор.

Размер релиза без иконок: ~6–10 МБ (профиль `release` со `lto = true`, `panic = abort`, `strip = true` в `src-tauri/Cargo.toml`).

### Структура Tauri-обёртки

```
src-tauri/
├── Cargo.toml              # Rust-манифест, минимум зависимостей: tauri + serde
├── build.rs                # build script (вызывает tauri_build::build)
├── tauri.conf.json         # окно, бандл, identifier, путь к фронту
├── capabilities/
│   └── default.json        # пермишены окна — только core (без fs/shell/etc)
├── icons/                  # 32/128/128@2x PNG, ICO, ICNS — генерируются tauri:icon
└── src/
    ├── main.rs             # точка входа бинарника, скрытие консоли в release
    └── lib.rs              # tauri::Builder без custom commands (фронту хватает WebView)
```

Кроме стандартного WebView, в Rust зарегистрированы команды **вложений**: запись/чтение/удаление файлов в `%AppData%\…\trader-journal-assets` по относительным путям `glossary/…` и `trades/…` (см. `tauri_attachments_*` в `src-tauri/src/lib.rs`). Фронт вызывает их из `src/lib/attachmentApi.js` через `invoke()`.

### Замечания по поведению

- **CSP** в `tauri.conf.json` стоит `null` — WebView2 применяет свой дефолтный, нестрогий. Это нужно потому, что `vite-plugin-singlefile` инлайнит весь JS/CSS в `<script>`/`<style>`, и строгий CSP без `'unsafe-inline'`/хешей такое не пропустит. Если захочешь ужать — придётся либо отключить singlefile под Tauri, либо собирать CSP с хешами после билда.
- **`localStorage`** в WebView2 хранится в профиле приложения (`%APPDATA%\com.traderjournal.app\EBWebView\...`). Сделки между «веб» и «Tauri» вариантами **не синхронизируются** — это разные origins, разные хранилища. Используй экспорт/импорт JSON.
- **HMR в `tauri:dev`** работает — Tauri ждёт vite на `localhost:5173`, окно перезагружается на изменения.
- **Identifier** в конфиге — `com.traderjournal.app`. Поменяй, если планируешь публиковать (он попадёт в путь к данным WebView2 и в подпись MSI).
- **Подпись инсталлятора** не настроена. Для распространения чужим людям подпиши `.msi`/`.exe` своим сертификатом (иначе SmartScreen будет ругаться).
- **Кросс-платформа**: на macOS/Linux команды те же (`npm run tauri:build`), артефакты — `.dmg`/`.app` и `.AppImage`/`.deb`. Тестировалось пока только на Windows 10.

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
│   ├── journalBundle.js         # ZIP экспорт/импорт (сделки + глоссарий + файлы)
│   ├── attachmentApi.js         # вложения: Tauri AppData vs IndexedDB, пути trades/… glossary/…
│   ├── glossary.js               # store глоссария
│   ├── dayJournal.js            # store журнала дня
│   ├── dayJournalChecklistTemplate.js
│   ├── imageCompress.js         # сжатие изображений
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
    ├── DayJournalView.svelte     # вкладка «Журнал» (дневник по датам)
    ├── GlossaryView.svelte       # вкладка «Глоссарий»
    ├── AddImageModal.svelte      # миниатюры, вставка/файлы, кроп
    ├── ImageCropModal.svelte
    ├── ImageLightbox.svelte
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
  acknowledgedPlayRules: ['...'],
  attachments: ['trades/<id>/file.webp', ...]  // пути к файлам в хранилище вложений (закрытые сделки)
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
| `traderGlossary_v1`           | категории и термины глоссария (в т.ч. пути вложений) |
| `dayJournal_v1`              | записи «журнала дня» по датам                       |
| `cooldownUntil`               | ms-таймстамп до окончания cooldown (или отсутствует)|
| `__corrupt_backup_<ts>`       | автобэкапы битого JSON (если парсер упал)           |

Отдельно в **IndexedDB** (`trader-journal-attachments`, только веб) — бинарные файлы скриншотов; в **Tauri** вместо IDB используется папка на диске (см. выше).

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

## Релиз: проверки и подпись (Windows / Tauri)

**Аудит зависимостей (перед тегом релиза):**
- JS: `npm run audit:js` (или `npm audit`). На момент последней проверки — 0 known vulnerabilities; повторяй перед каждым релизом.
- Rust: поставь `cargo-audit` (обычно `cargo install cargo-audit` — если сборка падает на Windows, возьми бинарь с [релизов](https://github.com/rustsec/cargo-audit/releases) в `PATH` или `cargo binstall cargo-audit`), затем `npm run audit:rust` из корня репо (эквивалент: `cd src-tauri` → `cargo audit`). Смотри [RustSec](https://rustsec.org/) / advisory DB.

**Tauri 2 — capabilities (ревью):** `src-tauri/capabilities/default.json` вешается только на окно `main` и выдаёт:
- `core:default` — стандартный набор Tauri 2 (без лишних плагинов в этом проекте);
- `allow-attachments` — **только** кастомные команды в `src-tauri/permissions/allow-attachments.toml`: `tauri_attachments_{write,read,remove_file,remove_scope_dir,get_root}` для папки `trader-journal-assets` в AppData. Отдельных `fs:default` / `shell:default` / `http` plugin scope в capability **нет** — веб-часть ходит в сеть как обычный WebView (`fetch` / WS), не через Tauri shell.

`app.security.csp` в `tauri.conf.json` сейчас `null` (сборка `singlefile` + инлайн); ужесточение CSP — отдельный осознанный шаг, если уйдёшь от one-file.

**Подпись EXE / MSI (SmartScreen, доверие):** бинарь и инсталляторы без EV/OV сертификата будут с «неизвестным издателем». В `bundle` Tauri 2 для Windows:
- вариант cert в хранилище: `certificateThumbprint`, `digestAlgorithm` (например `sha256`), `timestampUrl` (TSA);
- внешний тул: `signCommand` с плейсхолдером пути к артефакту (в доке Tauri — `%1`).

Полный гайд: [Code signing: Windows (Tauri v2)](https://v2.tauri.app/distribute/sign/windows/). Сборка: `npm run tauri:build` после настройки подписи на машине/CI, где стоят сертификат и/или `signtool` / твой CLI.

**Секреты:** ключи/пароли PFX, thumbprint, пароли к cert — только в CI secrets или локально, **не** в репозиторий.

---

## Лицензия

Проект для личного использования.
