# TradeJornalApp — разработка

Монорепо: основное приложение — **Svelte + Vite** в каталоге [`trader-journal/`](trader-journal/). Десктоп: **Tauri 2** (`trader-journal/src-tauri/`).

Для пользовательского описания без погружения в код см. [`trader-journal/README.md`](trader-journal/README.md).

---

## Быстрый старт

```bash
cd trader-journal
npm install
npm run dev          # http://localhost:5173, HMR
npm run build        # dist/index.html (singlefile)
npm run preview      # статика на :4173 — нормальный Origin для WS
npm run test         # Vitest, один прогон
npm run test:watch
```

Десктоп (отдельно: Rust, WebView2, MSVC Build Tools на Windows):

```powershell
cd trader-journal
npm run tauri:dev    # ждёт Vite на 5173, окно с HMR
npm run tauri:build  # exe + msi/nsis в src-tauri/target/release/bundle/
```

`file://` на собранный HTML **не используй** для прод-отладки live-цен: у части браузеров `Origin: null` ломает WebSocket к биржам.

---

## Стек и сборка

| Слой | Технология |
|------|------------|
| UI | Svelte 5.x (`package.json`) |
| Бандлер | Vite, `vite-plugin-singlefile` для one-file веб-сборки |
| Тесты | Vitest (`*.test.js` рядом с модулями) |
| Графики | Chart.js (обёртки в `src/components/charts/`) |
| Натив | Tauri 2, Rust, WebView2 |

Аудит перед релизом: `npm run audit:js` из `trader-journal`; Rust — `npm run audit:rust` или `cd trader-journal/src-tauri && cargo audit`.

---

## Структура репозитория

```
TradeJornalApp/
└── trader-journal/
    ├── package.json
    ├── vite.config.* 
    ├── src/
    │   ├── App.svelte        # вкладки, шапка, kill-switch
    │   ├── main.js
    │   ├── app.css
    │   ├── components/      # формы, модалки, вкладки, charts/
    │   └── lib/             # бизнес-логика и IO
    └── src-tauri/           # Cargo.toml, tauri.conf.json, capabilities/, src/lib.rs
```

---

## Как устроен фронт (lib/)

Взаимодействие с кодом: точка входа UI — `App.svelte`; состояние и сохранение — **`stores.js`** + **`accountStorage.js`** / **`accounts.js`** (несколько «счетов» журнала = суффиксы ключей `localStorage`).

| Модуль | Роль |
|--------|------|
| `stores.js` | Writable stores: сделки, шаблоны, профиль, сниппеты, кэш UI |
| `accountStorage.js` | load/save с привязкой к активному счёту |
| `accounts.js` | Список счетов, `keyForAccount`, переключение |
| `risk.js` | Pre-trade правила, дневной стоп, серии, дисциплина, equity, время суток |
| `profileRulesRegistry.js` / `profileRulesDefaults.js` | Реестр карточек правил профиля, дефолты, миграции полей |
| `utils.js` | Создание сделки, P/L, pips/%, длительность, контракт, конвертация FX (грубо) |
| `constants.js` | Пары, `DEFAULT_CONTRACT_SIZE_BY_SYMBOL`, нормализация символов |
| `livePrices.js` | Оркестрация WS (Binance + Kraken) |
| `binanceWs.js` / `krakenWs.js` | Клиенты потоков |
| `marketData.js` | REST: Binance, Frankfurter, Stooq, Yahoo и т.д.; в Tauri часть через `invoke` (обход CORS) |
| `cooldown.js` | Cooldown после убытка + persist |
| `playbooks.js` | Стратегии / plays / правила, дефолтная ICT-стратегия |
| `ictTaxonomy.js` | Теги narrative / structure / poi / execution |
| `killzones.js` / `killzoneData.js` / `journalSettings.js` | Окна сессий, TZ, приоритет |
| `htfBias.js` | Bias по символу и дате |
| `analyticsInsights.js` | WoW, журнал vs PnL, playbook edge, heatmap |
| `tradingMentor.js` | Наставник: стойки, дорожная карта |
| `adviceCorpus.js` / `adviceSourcesRegistry.js` | Локальный текст советов (без LLM) |
| `mt5Parser.js` | Импорт HTML-отчётов MT5 |
| `journalBundle.js` | ZIP экспорт/импорт (сделки + глоссарий + файлы) |
| `journalImportApply.js` | Применение импорта к стору |
| `attachmentApi.js` | Вложения: в вебе IndexedDB, в Tauri — файлы в AppData (`invoke`) |
| `glossary.js` / `dayJournal.js` | Сторы глоссария и дневника |
| `theme.js` / `worldClock.js` / `toasts.js` | Темы, часы в шапке, уведомления |
| `weeklyExperimentHistory.js` | Недельный эксперимент во вкладке аналитики |

Крупные формы и экраны смотри в `components/` по имени вкладки (`TradeForm`, `Statistics`, `AnalyticsView`, `DayJournalView`, `ProfileModal`, `RiskHud`, …).

---

## Данные

- **localStorage**: `trades`, `templates`, `userProfile`, `theme`, `journalSettings_v1`, `strategies`, `htfBiasLog`, `traderGlossary_v1`, `dayJournal_v1`, `cooldownUntil`, `analyticsWeeklyExperiment_v1`, `setupSnippets` и др.; при мульти-счете — ключи вида `<base>__<accountId>` (см. `accounts.js`).
- **Веб**: бинарные вложения в **IndexedDB** (`trader-journal-attachments`).
- **Tauri**: те же JSON в WebView **localStorage** профиля приложения; файлы вложений — команды в `src-tauri/src/lib.rs` → `tauri_attachments_*`, путь `%AppData%\…\trader-journal-assets`, относительные пути `trades/…`, `glossary/…`. Origin веб и Tauri разный — общий смысл только через экспорт/импорт.

**Модель сделки (основные поля):** `id`, `pair`, `direction` (`long`/`short`), `status`, `volume`, `priceOpen`, `priceClose`, `marketPrice` (импорт MT5), `sl`/`tp`, `dateOpen`/`dateClose`, `commission`, `swap`, `profit`, `contractSize` (override), `tags`, `templateUsed`, `comment`, `strategyId`, `playId`, `killzone`, `ruleViolations`, `acknowledgedChecklist`, `acknowledgedPlayRules`, `attachments` (пути вложений для закрытых).

**P/L:** `units = volume × contractSize(pair)`; `priceDiff = (priceClose − priceOpen) × (long ? +1 : -1)`; `profit = priceDiff × units − commission − swap`. Для классического FX 6 букв — грубая конвертация в USD (см. `getContractSize` / конвертацию в `utils.js`). Источник контракта: override на сделке → `DEFAULT_CONTRACT_SIZE_BY_SYMBOL` в `constants.js` → эвристики (XAU, крипто-пары, и т.д.).

Полная схема в коде: `createNewTrade`, `TradeForm`, `mt5Parser.js`, экспорт в `journalBundle.js`.

---

## Tauri

- **Конфиг**: `src-tauri/tauri.conf.json`, идентификатор приложения — смотри в конфиге (влияет на путь данных WebView2).
- **Capabilities**: `src-tauri/capabilities/default.json` — `core:default`, кастомный scope на вложения, allowlist HTTPS для `tauri_fetch_allowed_http_get` (Stooq / Yahoo и т.п., см. permissions).
- **CSP** в конфиге часто `null` из-за singlefile + инлайн; ужесточение — отдельная задача.

Подпись MSI/EXE для распространения: [Code signing Windows (Tauri v2)](https://v2.tauri.app/distribute/sign/windows/).

---

## Ограничения (кратко)

- Кроссы FX без USD считаются в котируемой валюте без пересчёта в USD.
- Индексы / нефть / акции: дефолтный контракт `1` без справочника — правь `contractSize` или `constants.js`.
- Sharpe упрощённый; просадка без глубокого intraday.
- Покрытие Kraken WS / Binance — не все тикеры; остальное HTTP / таймеры в `livePrices.js`.
- Нет синка между устройствами.

---

## Лицензия

Проект для личного использования.
