<script>
  import { onMount, onDestroy } from 'svelte';
  import dayjs from 'dayjs';
  import { trades, userProfile } from './lib/stores';
  import { glossary } from './lib/glossary';
  import * as att from './lib/attachmentApi';
  import {
    formatDate,
    formatNumber,
    formatPrice,
    formatDuration,
    calculateStats,
    calculatePips,
    calculatePricePercent,
    calculateFloatingProfit,
    getTradeSource,
    isMt5DepositCurrencyProfit,
    isMt5HistoryImportedTrade
  } from './lib/utils';
  import { theme, THEMES } from './lib/theme';
  import { WORLD_CITIES, formatWorldTime } from './lib/worldClock';
  import { livePrices, pingInfo, tickClock, formPairs } from './lib/livePrices';
  import { fxRate, formatAccountMoney, tradeProfitDisplayUnits, convertUsd } from './lib/fxRate';
  import { normalizeSymbolKey } from './lib/constants';
  import { cooldown } from './lib/cooldown';
  import { checkDailyStop, computeGoalAmount, getDailyPnL } from './lib/risk';
  import { primaryKillzone, killzoneLabel } from './lib/killzones';
  import { journalSettings } from './lib/journalSettings';
  import { strategies, findPlay } from './lib/playbooks';
  import TradeForm from './components/TradeForm.svelte';
  import TemplatesPanel from './components/TemplatesPanel.svelte';
  import Statistics from './components/Statistics.svelte';
  import ProfileModal from './components/ProfileModal.svelte';
  import Toasts from './components/Toasts.svelte';
  import RiskHud from './components/RiskHud.svelte';
  import DailyReviewModal from './components/DailyReviewModal.svelte';
  import AnalyticsView from './components/AnalyticsView.svelte';
  import GuideView from './components/GuideView.svelte';
  import BiasModal from './components/BiasModal.svelte';
  import PlaybookView from './components/PlaybookView.svelte';
  import JournalSettingsModal from './components/JournalSettingsModal.svelte';
  import DayJournalView from './components/DayJournalView.svelte';
  import GlossaryView from './components/GlossaryView.svelte';
  import ImageLightbox from './components/ImageLightbox.svelte';
  import AddImageModal from './components/AddImageModal.svelte';
  import OnboardingJournalModal from './components/OnboardingJournalModal.svelte';
  import { dayJournal } from './lib/dayJournal';
  import { dayJournalHasContent } from './lib/tradingMentor';

  let showForm = false;
  let showProfile = false;
  let showBias = false;
  let showJournalSettings = false;
  let currentTrade = null;
  let formMode = 'add';
  let activeTab = 'open';

  let openSort = { key: 'dateOpen', dir: 'desc' };
  let closedSort = { key: 'dateClose', dir: 'desc' };
  let openSymbolFilter = '';
  let closedSymbolFilter = '';
  let openKzFilter = '';
  let closedKzFilter = '';
  /** @type {'' | 'long' | 'short'} */
  let openDirectionFilter = '';
  /** @type {'' | 'long' | 'short'} */
  let closedDirectionFilter = '';
  let openTradeSearch = '';
  let closedTradeSearch = '';

  let journalReminderDismissed = false;
  const JREM_DISMISS_PREFIX = 'journalDayReminderDismissed_';

  $: openTrades = $trades.filter((t) => t.status === 'open');
  $: closedTrades = $trades.filter((t) => t.status === 'closed');

  // К открытым парам добавляем «формовую» пару (TradeForm пишет туда при
  // включённом «По рынку»), чтобы WS подключился ко всем нужным символам.
  $: subscribedPairs = Array.from(new Set([
    ...openTrades.map((t) => t.pair),
    ...$formPairs
  ].filter(Boolean)));
  $: livePrices.setPairs(subscribedPairs);

  // Kill-switch: дневной лимит убытка пробит (для блокировки "Новая сделка")
  $: dailyStop = checkDailyStop(closedTrades, $userProfile);
  // Cooldown остаток — реактив на сам cooldown store + tickClock (для тика)
  $: cooldownLeftMs = ($tickClock, $cooldown?.until ? Math.max(0, $cooldown.until - Date.now()) : 0);
  $: tradingBlocked = dailyStop.hit || cooldownLeftMs > 0;
  $: tradingBlockedReason = dailyStop.hit
    ? `Дневной лимит убытка пробит (${dailyStop.pnl.toFixed(2)} ≤ −${dailyStop.limit.toFixed(2)}). Торговля закрыта до полуночи.`
    : cooldownLeftMs > 0
      ? `Cooldown после убытка: ещё ${Math.ceil(cooldownLeftMs / 60000)} мин. Не входи в revenge-trade.`
      : '';

  // Daily review prompt: если цель дня достигнута и сегодня ещё не показывали
  $: goalDayAmount = computeGoalAmount($userProfile, 'Day');
  $: dailyPnL = ($tickClock, getDailyPnL(closedTrades));
  let showDailyReview = false;
  $: if (
    $userProfile?.dailyReviewEnabled !== false &&
    goalDayAmount > 0 &&
    dailyPnL >= goalDayAmount &&
    $userProfile?.lastDailyReviewDate !== todayKey() &&
    !showDailyReview
  ) {
    showDailyReview = true;
  }
  function todayKey() {
    return dayjs().format('YYYY-MM-DD');
  }
  function dismissJournalDayReminder() {
    journalReminderDismissed = true;
    try {
      sessionStorage.setItem(JREM_DISMISS_PREFIX + todayKey(), '1');
    } catch {
      /* ignore */
    }
  }
  function dismissDailyReview() {
    userProfile.updateProfile({ lastDailyReviewDate: todayKey() });
    showDailyReview = false;
  }

  onMount(() => {
    livePrices.start();
    try {
      journalReminderDismissed = sessionStorage.getItem(JREM_DISMISS_PREFIX + todayKey()) === '1';
    } catch {
      journalReminderDismissed = false;
    }
  });
  onDestroy(() => livePrices.stop());

  function pickPrice(lp, trade) {
    if (lp && lp.price != null) return Number(lp.price);
    if (trade?.marketPrice != null) return Number(trade.marketPrice);
    return null;
  }

  function floatingFor(lp, trade) {
    if (lp && lp.price != null) return calculateFloatingProfit(trade, Number(lp.price));
    return trade?.profit != null ? Number(trade.profit) : null;
  }
  $: stats = calculateStats(closedTrades, {
    initialCapital: Number($userProfile?.initialCapital) || 0,
    profitOf: (t) => tradeProfitDisplayUnits(t, $fxRate)
  });

  $: journalSnap = $journalSettings;

  function sortTrades(list, { key, dir }) {
    const mul = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
  }

  function sortValue(trade, key) {
    if (key === 'dateOpen' || key === 'dateClose') {
      const v = trade[key];
      return v ? new Date(v).getTime() : null;
    }
    if (key === 'pips') return calculatePips(trade);
    if (key === 'pct') return calculatePricePercent(trade);
    if (key === 'duration') {
      const start = trade.dateOpen ? new Date(trade.dateOpen).getTime() : 0;
      const end = trade.dateClose ? new Date(trade.dateClose).getTime() : Date.now();
      return end - start;
    }
    const v = trade[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return v.toLowerCase();
    return v ?? null;
  }

  function toggleSort(state, key) {
    if (state.key === key) {
      state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.key = key;
      state.dir = 'desc';
    }
    return { ...state };
  }

  function sortIndicator(state, key) {
    if (state.key !== key) return '';
    return state.dir === 'asc' ? ' ▲' : ' ▼';
  }

  function sourceIcon(trade) {
    const src = getTradeSource(trade);
    if (src === 'mt5-history') return { icon: '📥', title: 'Импорт из истории MT5' };
    if (src === 'mt5-trade') return { icon: '📡', title: 'Импорт открытых из MT5' };
    return { icon: '✍️', title: 'Ручная сделка' };
  }

  function tradeKzLabel(trade) {
    void journalSnap;
    const id = trade?.killzone || primaryKillzone(trade?.dateOpen);
    return id ? killzoneLabel(id) : '—';
  }
  function tradePlayLabel(trade) {
    if (!trade?.strategyId || !trade?.playId) return '';
    const p = findPlay($strategies, trade.strategyId, trade.playId);
    return p ? p.name : '';
  }

  function tradeEffectiveKzId(trade) {
    void journalSnap;
    return trade?.killzone || primaryKillzone(trade?.dateOpen) || '_OUT';
  }

  function tradeMatchesQuickSearch(trade, qNorm) {
    if (!qNorm) return true;
    const blob = [
      trade.pair,
      trade.comment,
      trade.direction,
      tradeKzLabel(trade),
      tradePlayLabel(trade),
      trade.strategyId,
      trade.playId,
      Array.isArray(trade.tags) ? trade.tags.join(' ') : ''
    ]
      .map((x) => String(x || '').toLowerCase())
      .join('\n');
    return blob.includes(qNorm);
  }

  $: closedSearchNorm = closedTradeSearch.trim().toLowerCase();
  $: openSearchNorm = openTradeSearch.trim().toLowerCase();

  $: openKzFilterIds = Array.from(new Set(openTrades.map((t) => tradeEffectiveKzId(t)))).sort((a, b) =>
    killzoneLabel(a).localeCompare(killzoneLabel(b), 'ru')
  );
  $: closedKzFilterIds = Array.from(new Set(closedTrades.map((t) => tradeEffectiveKzId(t)))).sort((a, b) =>
    killzoneLabel(a).localeCompare(killzoneLabel(b), 'ru')
  );

  /** Пары только из текущей «истории» с учётом KZ / направления / поиска (без фильтра по паре). */
  $: closedSymbolsForPicker = Array.from(
    new Set(
      closedTrades
        .filter((t) => {
          if (closedKzFilter && tradeEffectiveKzId(t) !== closedKzFilter) return false;
          if (closedDirectionFilter && t.direction !== closedDirectionFilter) return false;
          if (!tradeMatchesQuickSearch(t, closedSearchNorm)) return false;
          return true;
        })
        .map((t) => t.pair)
        .filter(Boolean)
    )
  ).sort();
  $: openSymbolsForPicker = Array.from(
    new Set(
      openTrades
        .filter((t) => {
          if (openKzFilter && tradeEffectiveKzId(t) !== openKzFilter) return false;
          if (openDirectionFilter && t.direction !== openDirectionFilter) return false;
          if (!tradeMatchesQuickSearch(t, openSearchNorm)) return false;
          return true;
        })
        .map((t) => t.pair)
        .filter(Boolean)
    )
  ).sort();

  $: if (closedSymbolFilter && !closedSymbolsForPicker.includes(closedSymbolFilter)) {
    closedSymbolFilter = '';
  }
  $: if (openSymbolFilter && !openSymbolsForPicker.includes(openSymbolFilter)) {
    openSymbolFilter = '';
  }

  $: filteredClosedPool = closedTrades.filter((t) => {
    if (closedSymbolFilter && t.pair !== closedSymbolFilter) return false;
    if (closedKzFilter && tradeEffectiveKzId(t) !== closedKzFilter) return false;
    if (closedDirectionFilter && t.direction !== closedDirectionFilter) return false;
    if (!tradeMatchesQuickSearch(t, closedSearchNorm)) return false;
    return true;
  });
  $: filteredOpenPool = openTrades.filter((t) => {
    if (openSymbolFilter && t.pair !== openSymbolFilter) return false;
    if (openKzFilter && tradeEffectiveKzId(t) !== openKzFilter) return false;
    if (openDirectionFilter && t.direction !== openDirectionFilter) return false;
    if (!tradeMatchesQuickSearch(t, openSearchNorm)) return false;
    return true;
  });

  $: filteredClosedTrades = sortTrades(filteredClosedPool, closedSort);
  $: filteredOpenTrades = sortTrades(filteredOpenPool, openSort);

  $: closedTotals = filteredClosedTrades.reduce(
    (acc, t) => {
      acc.profit += tradeProfitDisplayUnits(t, $fxRate);
      if (!isMt5HistoryImportedTrade(t)) {
        acc.commission += Number(t.commission) || 0;
        acc.swap += Number(t.swap) || 0;
      }
      return acc;
    },
    { profit: 0, commission: 0, swap: 0 }
  );

  $: journalReminderHour = Math.max(
    0,
    Math.min(23, Number($userProfile?.journalDayReminderHourLocal ?? 21))
  );
  $: journalReminderOn = $userProfile?.journalDayReminderEnabled !== false;
  $: localHour = ($tickClock, new Date().getHours());
  $: journalTodayKey = ($tickClock, dayjs().format('YYYY-MM-DD'));
  $: journalTodayEmpty = !dayJournalHasContent($dayJournal[journalTodayKey]);
  $: showJournalDayReminder =
    journalReminderOn &&
    !journalReminderDismissed &&
    journalTodayEmpty &&
    localHour >= journalReminderHour;

  function editTrade(trade) {
    currentTrade = trade;
    formMode = trade?.status === 'closed' ? 'edit-closed' : 'edit';
    showForm = true;
  }

  function handleCloseTrade(trade) {
    currentTrade = trade;
    formMode = 'close';
    showForm = true;
  }

  function deleteTrade(trade) {
    if (confirm('Удалить сделку?')) {
      trades.deleteTrade(trade);
    }
  }

  function clearClosedTrades() {
    if (closedTrades.length === 0) return;
    if (confirm(`Удалить все закрытые сделки (${closedTrades.length})?`)) {
      trades.deleteClosedTrades();
    }
  }

  function duplicateAsOpen(trade) {
    currentTrade = {
      ...trade,
      id: undefined,
      status: 'open',
      dateOpen: new Date().toISOString().slice(0, 19).replace('T', ' '),
      dateOpenManual: false,
      dateClose: null,
      priceClose: null,
      profit: null,
      commission: 0,
      swap: 0,
      tags: ['duplicated'],
      attachments: [],
      comment: trade.comment ? `Дубликат: ${trade.comment}` : 'Дубликат закрытой'
    };
    formMode = 'add';
    showForm = true;
  }

  function addNew() {
    if (tradingBlocked) return;
    currentTrade = null;
    formMode = 'add';
    showForm = true;
  }
  function cancelCooldown() {
    if (!confirm('Отменить cooldown? Только если ты уверен, что не на тильте.')) return;
    cooldown.cancel();
  }

  let tradeAddImgOpen = false;
  let tradeAddForId = null;
  let tradeLightboxOpen = false;
  let tradeLightboxUrls = [];
  let tradeLightboxStart = 0;
  let tradeLightboxFor = null;

  function requestAddTradePhoto(tradeId) {
    tradeAddForId = tradeId;
    tradeAddImgOpen = true;
  }

  function closeTradeAddImg() {
    tradeAddImgOpen = false;
    tradeAddForId = null;
  }

  async function onTradeAddImage(/** @type {CustomEvent} */ e) {
    const { items } = e.detail || {};
    if (!Array.isArray(items) || !items.length || !tradeAddForId) return;
    const id = tradeAddForId;
    const t = $trades.find((x) => x.id === id);
    const newRels = [];
    for (const it of items) {
      if (!it?.blob) continue;
      const rel = await att.saveImageBlob('trades', id, it.blob, it.ext || 'webp');
      if (rel) newRels.push(rel);
    }
    if (newRels.length) {
      trades.updateTrade(id, { attachments: [...(t?.attachments || []), ...newRels] });
    }
    tradeAddImgOpen = false;
    tradeAddForId = null;
  }

  async function openTradeLightbox(t, start = 0) {
    const rels = t.attachments || [];
    if (!rels.length) return;
    tradeLightboxFor = t;
    tradeLightboxUrls = await att.getObjectUrlsForPaths(rels);
    tradeLightboxStart = start;
    tradeLightboxOpen = true;
  }

  async function onTradeLightboxRemove(e) {
    const { index } = e.detail;
    const t = tradeLightboxFor;
    if (!t) return;
    const rels = [...(t.attachments || [])];
    const rel = rels[index];
    if (rel == null) return;
    rels.splice(index, 1);
    await att.removeFile(rel);
    trades.updateTrade(t.id, { attachments: rels });
    if (!rels.length) {
      tradeLightboxOpen = false;
      tradeLightboxFor = null;
      return;
    }
    const fresh = $trades.find((x) => x.id === t.id);
    tradeLightboxFor = fresh || t;
    tradeLightboxUrls = await att.getObjectUrlsForPaths(fresh?.attachments || rels);
    tradeLightboxStart = Math.min(index, rels.length - 1);
  }

  function applyTemplate() {
    currentTrade = null;
    formMode = 'add';
    showForm = true;
  }
</script>

<div class="trader-journal">
  <div class="journal-header">
    <div class="header-left">
      <h1 title="Журнал трейдера">Журнал</h1>
      <div class="world-clocks" role="timer" aria-live="polite" aria-label="Мировое время">
        {#each WORLD_CITIES as c}
          <span class="wc-item" title="{c.name} · {c.tz}">
            <span class="wc-abbr">{c.abbr}</span>
            <span class="wc-time mono">{formatWorldTime($tickClock, c.tz)}</span>
          </span>
        {/each}
      </div>
    </div>
    <div class="header-right">
      <div class="theme-switch">
        <label class="theme-switch-label" for="app-theme-select">Тема</label>
        <select
          id="app-theme-select"
          class="theme-select"
          value={$theme}
          on:change={(e) => theme.set(e.currentTarget.value)}
        >
          {#each THEMES as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      </div>
      <div class="btn-group">
        <button
          class="btn btn-primary"
          on:click={addNew}
          disabled={tradingBlocked}
          title={tradingBlocked ? tradingBlockedReason : 'Новая сделка'}
        >+ Сделка</button>
        <button class="btn" on:click={() => showBias = true} title="HTF Bias">Bias</button>
        <button
          class="btn"
          on:click={() => showJournalSettings = true}
          title="Killzones, часовой пояс, приоритет KZ"
        >Параметры</button>
        <button class="btn" on:click={() => showProfile = true} title="Профиль">Профиль</button>
      </div>
    </div>
  </div>

  <RiskHud />

  {#if tradingBlocked}
    <div class="kill-switch {dailyStop.hit ? 'severe' : 'warn'}">
      <div class="kill-switch-icon">{dailyStop.hit ? '⛔' : '⏸'}</div>
      <div class="kill-switch-body">
        <strong>{dailyStop.hit ? 'Торговля заблокирована' : 'Cooldown активен'}</strong>
        <span>{tradingBlockedReason}</span>
      </div>
      {#if cooldownLeftMs > 0 && !dailyStop.hit}
        <button class="btn btn-sm" on:click={cancelCooldown}>Отменить cooldown</button>
      {/if}
    </div>
  {/if}

  {#if showJournalDayReminder}
    <div class="journal-day-reminder" role="status">
      <div class="journal-day-reminder-text">
        После {journalReminderHour}:00 локально: дневник за сегодня ещё без содержания — закрой день во вкладке «Дневник».
      </div>
      <div class="journal-day-reminder-actions">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          on:click={() => {
            activeTab = 'journal';
          }}>Открыть дневник</button>
        <button type="button" class="btn btn-sm" on:click={dismissJournalDayReminder}>Не сегодня</button>
      </div>
    </div>
  {/if}

  <TemplatesPanel on:apply={applyTemplate} />

  <div class="tabs">
    <button class="tab {activeTab === 'open' ? 'active' : ''}" on:click={() => activeTab = 'open'}>
      Открытые ({openTrades.length})
    </button>
    <button class="tab {activeTab === 'closed' ? 'active' : ''}" on:click={() => activeTab = 'closed'}>
      Закрытые ({closedTrades.length})
    </button>
    <button class="tab {activeTab === 'stats' ? 'active' : ''}" on:click={() => activeTab = 'stats'}>
      Статистика
    </button>
    <button class="tab {activeTab === 'analytics' ? 'active' : ''}" on:click={() => activeTab = 'analytics'}>
      Аналитика
    </button>
    <button class="tab {activeTab === 'journal' ? 'active' : ''}" on:click={() => activeTab = 'journal'}>
      Дневник
    </button>
    <button class="tab {activeTab === 'glossary' ? 'active' : ''}" on:click={() => activeTab = 'glossary'}>
      Глоссарий
    </button>
    <button class="tab {activeTab === 'playbooks' ? 'active' : ''}" on:click={() => activeTab = 'playbooks'}>
      Плейбуки
    </button>
    <button class="tab {activeTab === 'guide' ? 'active' : ''}" on:click={() => activeTab = 'guide'}>
      Гайд
    </button>
  </div>

  {#if activeTab === 'open'}
    <div class="table-container">
      {#if openTrades.length === 0}
        <div class="empty-state">📭 Нет открытых сделок</div>
      {:else}
        <div class="table-toolbar">
          <label>
            Символ:
            <select bind:value={openSymbolFilter}>
              <option value="">Все ({openTrades.length})</option>
              {#each openSymbolsForPicker as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </label>
          <label>
            KZ:
            <select bind:value={openKzFilter}>
              <option value="">Все</option>
              {#each openKzFilterIds as kzId (kzId)}
                <option value={kzId}>{killzoneLabel(kzId)}</option>
              {/each}
            </select>
          </label>
          <label>
            Напр.:
            <select bind:value={openDirectionFilter}>
              <option value="">Все</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label class="trade-search-label">
            Поиск:
            <input type="search" bind:value={openTradeSearch} placeholder="Пара, коммент, setup…" autocomplete="off" />
          </label>
          <div class="ping-row">
            {#each [['binance', 'Binance'], ['kraken', 'Kraken']] as [p, label]}
              {@const info = $pingInfo[p]}
              {@const tickAge = info.lastTickAt ? $tickClock - info.lastTickAt : null}
              {@const changeAge = info.lastChangeAt ? $tickClock - info.lastChangeAt : null}
              {@const dot = !info.connected
                ? (info.error ? 'err' : 'idle')
                : tickAge == null ? 'warn'
                : tickAge < 10_000 ? 'ok'
                : tickAge < 60_000 ? 'warn'
                : 'err'}
              {@const changeLabel = changeAge == null
                ? '—'
                : changeAge < 60_000 ? `${Math.max(0, Math.floor(changeAge / 1000))} с`
                : changeAge < 3_600_000 ? `${Math.floor(changeAge / 60000)} мин`
                : `${Math.floor(changeAge / 3_600_000)} ч`}
              <span
                class="ping-pill ping-{dot}"
                title={info.error
                  ? `${label}: ${info.error}`
                  : info.connected
                    ? `${label}: WS открыт` +
                      (info.lastTickAt ? ` · последний тик ${new Date(info.lastTickAt).toLocaleTimeString()}` : ' · ждём данных') +
                      (info.lastChangeAt ? ` · цена менялась ${new Date(info.lastChangeAt).toLocaleTimeString()}` : '')
                    : `${label}: WS не подключён`}
              >
                <span class="ping-dot"></span>
                {label}
                <span class="ping-ms" title="Время с последнего изменения цены">Δ {changeLabel}</span>
              </span>
            {/each}
          </div>
        </div>
        {#if filteredOpenTrades.length === 0}
          <div class="empty-state">Ничего не подходит под фильтры / поиск.</div>
        {:else}
        <table class="trades-table">
          <thead>
            <tr>
              <th title="Источник">⚑</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'dateOpen'))}>
                Открытие{sortIndicator(openSort, 'dateOpen')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'pair'))}>
                Пара{sortIndicator(openSort, 'pair')}
              </th>
              <th>Напр.</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'volume'))}>
                Объем{sortIndicator(openSort, 'volume')}
              </th>
              <th>Цена откр.</th>
              <th>Рынок</th>
              <th>SL</th>
              <th>TP</th>
              <th title="Killzone (NY) и Setup">KZ · Setup</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'swap'))}>
                Своп{sortIndicator(openSort, 'swap')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'profit'))}>
                Плав. P/L{sortIndicator(openSort, 'profit')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'duration'))}>
                Длит.{sortIndicator(openSort, 'duration')}
              </th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredOpenTrades as trade}
              {@const src = sourceIcon(trade)}
              {@const lp = $livePrices[normalizeSymbolKey(trade.pair)]}
              {@const mp = pickPrice(lp, trade)}
              {@const fp = floatingFor(lp, trade)}
              <tr>
                <td title={src.title}>{src.icon}</td>
                <td>{formatDate(trade.dateOpen)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.direction === 'long' ? '📈 Long' : '📉 Short'}</td>
                <td>{trade.volume}</td>
                <td class="mono">{formatPrice(trade.priceOpen)}</td>
                <td
                  class="mono"
                  title={lp?.error
                    ? lp.error
                    : lp?.source
                      ? `${lp.source}${lp.timestamp ? ` · ${new Date(lp.timestamp).toLocaleTimeString()}` : ''}`
                      : ''}
                >
                  {#if lp?.loading && mp == null}
                    …
                  {:else if mp != null}
                    {formatPrice(mp)}
                  {:else if lp?.error}
                    <span class="market-err">×</span>
                  {:else}
                    -
                  {/if}
                </td>
                <td class="mono">{trade.sl ? formatPrice(trade.sl) : '-'}</td>
                <td class="mono">{trade.tp ? formatPrice(trade.tp) : '-'}</td>
                <td class="kz-cell">
                  <div class="kz-inner">
                    <span class="kz-tag">{tradeKzLabel(trade)}</span>
                    {#if tradePlayLabel(trade)}
                      <span class="play-tag" title={tradePlayLabel(trade)}>{tradePlayLabel(trade)}</span>
                    {/if}
                  </div>
                </td>
                <td class={Number(trade.swap) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.swap) || 0, 2)}
                </td>
                <td class={fp == null ? '' : fp >= 0 ? 'profit' : 'loss'}>
                  {#if fp != null}
                    {@const fd = isMt5DepositCurrencyProfit(trade) ? Number(fp) : convertUsd(Number(fp), $fxRate)}
                    {formatAccountMoney(Number.isFinite(fd) ? fd : 0, $fxRate)}
                  {:else}
                    -
                  {/if}
                </td>
                <td>{formatDuration(trade.dateOpen, null)}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)} title="Изменить">✏️</button>
                    <button class="btn btn-sm btn-success" on:click={() => handleCloseTrade(trade)} title="Закрыть">✅</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade)} title="Удалить">🗑️</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {/if}
      {/if}
    </div>
  {:else if activeTab === 'closed'}
    <div class="table-container">
      {#if closedTrades.length === 0}
        <div class="empty-state">📭 Нет закрытых сделок</div>
      {:else}
        <div class="table-toolbar">
          <label>
            Символ:
            <select bind:value={closedSymbolFilter}>
              <option value="">Все ({closedTrades.length})</option>
              {#each closedSymbolsForPicker as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </label>
          <label>
            KZ:
            <select bind:value={closedKzFilter}>
              <option value="">Все</option>
              {#each closedKzFilterIds as kzId (kzId)}
                <option value={kzId}>{killzoneLabel(kzId)}</option>
              {/each}
            </select>
          </label>
          <label>
            Напр.:
            <select bind:value={closedDirectionFilter}>
              <option value="">Все</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label class="trade-search-label">
            Поиск:
            <input type="search" bind:value={closedTradeSearch} placeholder="Пара, коммент, setup…" autocomplete="off" />
          </label>
          <button class="btn btn-danger" on:click={clearClosedTrades}>🧹 Удалить все закрытые</button>
        </div>
        {#if filteredClosedTrades.length === 0}
          <div class="empty-state">Ничего не подходит под фильтры / поиск.</div>
        {:else}
        <table class="trades-table">
          <thead>
            <tr>
              <th title="Источник">⚑</th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'dateOpen'))}>
                Откр.{sortIndicator(closedSort, 'dateOpen')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'dateClose'))}>
                Закр.{sortIndicator(closedSort, 'dateClose')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'duration'))}>
                Длит.{sortIndicator(closedSort, 'duration')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pair'))}>
                Пара{sortIndicator(closedSort, 'pair')}
              </th>
              <th>Напр.</th>
              <th>Объем</th>
              <th>Откр. / Закр.</th>
              <th>SL / TP</th>
              <th title="Killzone (NY) и Setup">KZ · Setup</th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pips'))}>
                Pips{sortIndicator(closedSort, 'pips')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pct'))}>
                %{sortIndicator(closedSort, 'pct')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'commission'))}>
                Комис.{sortIndicator(closedSort, 'commission')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'swap'))}>
                Своп{sortIndicator(closedSort, 'swap')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'profit'))}>
                P/L{sortIndicator(closedSort, 'profit')}
              </th>
              <th>Фото</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredClosedTrades as trade}
              {@const src = sourceIcon(trade)}
              {@const pips = calculatePips(trade)}
              {@const pct = calculatePricePercent(trade)}
              {@const pd = tradeProfitDisplayUnits(trade, $fxRate)}
              <tr title={trade.comment || ''}>
                <td title={src.title}>{src.icon}</td>
                <td>{formatDate(trade.dateOpen)}</td>
                <td>{formatDate(trade.dateClose)}</td>
                <td>{formatDuration(trade.dateOpen, trade.dateClose)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.direction === 'long' ? '📈 Long' : '📉 Short'}</td>
                <td>{trade.volume}</td>
                <td class="mono">{formatPrice(trade.priceOpen)} / {formatPrice(trade.priceClose)}</td>
                <td class="mono">{trade.sl ? formatPrice(trade.sl) : '-'} / {trade.tp ? formatPrice(trade.tp) : '-'}</td>
                <td class="kz-cell">
                  <div class="kz-inner">
                    <span class="kz-tag">{tradeKzLabel(trade)}</span>
                    {#if tradePlayLabel(trade)}
                      <span class="play-tag" title={tradePlayLabel(trade)}>{tradePlayLabel(trade)}</span>
                    {/if}
                  </div>
                </td>
                <td class={pips == null ? '' : pips >= 0 ? 'profit' : 'loss'}>
                  {pips != null ? formatNumber(pips, 1) : '-'}
                </td>
                <td class={pct == null ? '' : pct >= 0 ? 'profit' : 'loss'}>
                  {pct != null ? formatNumber(pct, 2) + '%' : '-'}
                </td>
                <td class={Number(trade.commission) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.commission) || 0, 2)}
                </td>
                <td class={Number(trade.swap) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.swap) || 0, 2)}
                </td>
                <td class={pd >= 0 ? 'profit' : 'loss'}>
                  {formatAccountMoney(pd, $fxRate)}
                </td>
                <td>
                  <div class="btn-group">
                    <button
                      class="btn btn-sm"
                      disabled={!trade.attachments?.length}
                      on:click={() => openTradeLightbox(trade, 0)}
                      title="Открыть снимок"
                    >🖼</button>
                    <button
                      class="btn btn-sm"
                      on:click={() => {
                        requestAddTradePhoto(trade.id);
                      }}
                      title="Добавить снимок"
                    >➕</button>
                    {#if trade.attachments?.length}
                      <span class="ph-count" title="Файлов: {trade.attachments.length}">{trade.attachments.length}</span>
                    {/if}
                  </div>
                </td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)} title="Изменить">✏️</button>
                    <button class="btn btn-sm" on:click={() => duplicateAsOpen(trade)} title="Дублировать как открытую">📋</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade)} title="Удалить">🗑️</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="totals">
              <td colspan="12" style="text-align: right;"><strong>Итого:</strong></td>
              <td class={closedTotals.commission >= 0 ? 'profit' : 'loss'}>
                {formatNumber(closedTotals.commission, 2)}
              </td>
              <td class={closedTotals.swap >= 0 ? 'profit' : 'loss'}>
                {formatNumber(closedTotals.swap, 2)}
              </td>
              <td class={closedTotals.profit >= 0 ? 'profit' : 'loss'}>
                <strong>{formatAccountMoney(closedTotals.profit, $fxRate)}</strong>
              </td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        {/if}
      {/if}
    </div>
  {:else if activeTab === 'stats'}
    <Statistics stats={stats} {closedTrades} initialCapital={Number($userProfile?.initialCapital) || 0} currency={$userProfile?.accountCurrency || 'USD'} />
  {:else if activeTab === 'analytics'}
    <AnalyticsView on:openJournal={() => (activeTab = 'journal')} />
  {:else if activeTab === 'journal'}
    <DayJournalView />
  {:else if activeTab === 'glossary'}
    <GlossaryView />
  {:else if activeTab === 'playbooks'}
    <PlaybookView />
  {:else if activeTab === 'guide'}
    <GuideView on:openProfile={() => showProfile = true} />
  {/if}

  <TradeForm bind:open={showForm} trade={currentTrade} mode={formMode} />
  <ProfileModal bind:open={showProfile} {closedTrades} />
  <BiasModal bind:open={showBias} />
  <JournalSettingsModal bind:open={showJournalSettings} />
  <DailyReviewModal
    open={showDailyReview}
    {dailyPnL}
    {goalDayAmount}
    currency={$userProfile?.accountCurrency || 'USD'}
    on:close={dismissDailyReview}
  />

  <AddImageModal open={tradeAddImgOpen} on:close={closeTradeAddImg} on:add={onTradeAddImage} />
  <ImageLightbox
    bind:open={tradeLightboxOpen}
    urls={tradeLightboxUrls}
    startIndex={tradeLightboxStart}
    deletable={true}
    on:remove={onTradeLightboxRemove}
  />
  <OnboardingJournalModal suppress={showProfile} />
</div>

<Toasts />

<style>
  .kill-switch {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    margin: 0 0 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .kill-switch.severe {
    border-color: var(--loss);
    border-left: 4px solid var(--loss);
    background: rgba(185, 28, 28, 0.08);
  }
  .kill-switch.warn {
    border-color: var(--warning);
    border-left: 4px solid var(--warning);
    background: rgba(180, 83, 9, 0.08);
  }
  .kill-switch-icon { font-size: 22px; }
  .kill-switch-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    line-height: 1.35;
  }
  .kill-switch-body strong { color: var(--text-strong); }

  .journal-day-reminder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    margin: 0 0 12px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
    font-size: 13px;
    line-height: 1.4;
    color: var(--text);
  }
  .journal-day-reminder-text {
    flex: 1 1 220px;
    min-width: 0;
  }
  .journal-day-reminder-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trade-search-label input {
    min-width: 140px;
    max-width: 220px;
    padding: 4px 8px;
    box-sizing: border-box;
  }

  .table-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .table-toolbar select {
    padding: 4px 8px;
  }
  .sortable {
    cursor: pointer;
    user-select: none;
  }
  .sortable:hover {
    opacity: 0.8;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    white-space: nowrap;
  }
  tfoot tr.totals td {
    border-top: 2px solid currentColor;
    font-weight: 600;
    padding-top: 8px;
  }
  .market-err {
    color: var(--loss);
    font-weight: 700;
    cursor: help;
  }
  .ping-row {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: 4px;
  }
  .ping-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    height: 22px;
    border: 1px solid var(--border);
    border-radius: 11px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg);
    cursor: help;
  }
  .ping-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .ping-ok .ping-dot {
    background: var(--profit);
    box-shadow: 0 0 4px var(--profit);
  }
  .ping-err .ping-dot {
    background: var(--loss);
    box-shadow: 0 0 4px var(--loss);
  }
  .ping-idle .ping-dot {
    background: var(--text-muted);
    opacity: 0.5;
  }
  .ping-warn .ping-dot {
    background: var(--warning);
    box-shadow: 0 0 4px var(--warning);
  }
  .ping-ms {
    color: var(--text-strong);
    font-weight: 600;
  }

  .kz-cell {
    vertical-align: middle;
  }
  .kz-inner {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    white-space: nowrap;
    line-height: 0;
  }
  .kz-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 7px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 10.5px;
    color: var(--text-muted);
    background: var(--bg-2);
    line-height: 1.25;
  }
  .play-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 7px;
    border-radius: 8px;
    font-size: 10.5px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    line-height: 1.25;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
