<script>
  import { createEventDispatcher } from 'svelte';
  import { trades, userProfile } from '../lib/stores';
  import { dayJournal } from '../lib/dayJournal';
  import { fxRate, tradeProfitDisplayUnits, decimalsFor } from '../lib/fxRate';
  import { calculateStats } from '../lib/utils';
  import { getCurrentStreak, checkDailyStop, getDailyPnL } from '../lib/risk';
  import { tickClock } from '../lib/livePrices';
  import { cooldown } from '../lib/cooldown';
  import { strategies } from '../lib/playbooks';
  import { buildMentorPack } from '../lib/tradingMentor';
  import { journalSettings } from '../lib/journalSettings';
  import { loadAccountData, saveAccountData } from '../lib/accountStorage.js';
  import {
    isoWeekKey,
    computeWeekOverWeek,
    buildWeeklyDeltaLines,
    pickWeeklyExperiment,
    computeJournalVsPnL,
    computePlaybookEdge,
    computeContextHeatmaps,
    experimentLabelForKey,
    journalPnLDailyBars,
    shortIsoWeekLabel,
    rollupIsoWeek,
    evaluateWeeklyExperimentOutcome,
    experimentMetricHint,
    experimentLongDescription,
    closedTradesForIsoWeek
  } from '../lib/analyticsInsights.js';
  import {
    pushWeeklyExperimentHistory,
    loadWeeklyExperimentHistory
  } from '../lib/weeklyExperimentHistory.js';
  import {
    ANALYTICS_QUESTION_CATEGORIES,
    filterAnalyticsQuestions
  } from '../lib/analyticsQuestions';
  import JournalSourceHint from './JournalSourceHint.svelte';
  import AnalyticsWoWCompareChart from './charts/AnalyticsWoWCompareChart.svelte';
  import AnalyticsWoWPnLChart from './charts/AnalyticsWoWPnLChart.svelte';
  import AnalyticsJournalDailyPnLChart from './charts/AnalyticsJournalDailyPnLChart.svelte';
  import AnalyticsTradeDaysJournalStackChart from './charts/AnalyticsTradeDaysJournalStackChart.svelte';
  import StatisticsKillzoneChart from './charts/StatisticsKillzoneChart.svelte';

  const dispatch = createEventDispatcher();
  const WEEK_EXP_KEY = 'analyticsWeeklyExperiment_v1';

  /** @type {'overview' | 'week' | 'focus' | 'journal_pnl' | 'setups' | 'context' | 'faq'} */
  let analyticsTab = 'overview';

  /** @type {{ weekKey: string; experimentKey: string; committed: boolean } | null} */
  let weeklyExpStored = null;

  /** @type {'all' | string} */
  let faqCategory = 'all';
  let faqSearch = '';
  /** @type {string | null} */
  let faqOpenId = null;

  $: filteredFaq = filterAnalyticsQuestions(faqCategory, faqSearch);
  $: if (faqOpenId && !filteredFaq.some((x) => x.id === faqOpenId)) faqOpenId = null;

  function toggleFaq(id) {
    faqOpenId = faqOpenId === id ? null : id;
  }

  function setFaqCategory(cat) {
    faqCategory = cat;
    faqOpenId = null;
  }

  $: closedTrades = ($trades || []).filter((t) => t.status === 'closed');
  $: stats = calculateStats(closedTrades, {
    initialCapital: Number($userProfile?.initialCapital) || 0,
    profitOf: (t) => tradeProfitDisplayUnits(t, $fxRate)
  });
  $: streak = getCurrentStreak(closedTrades);
  $: dailyStop = checkDailyStop(closedTrades, $userProfile);
  $: cooldownLeftMs = ($tickClock, $cooldown?.until ? Math.max(0, $cooldown.until - Date.now()) : 0);
  $: todayPnL = ($tickClock, getDailyPnL(closedTrades));

  $: profitOf = (t) => tradeProfitDisplayUnits(t, $fxRate);

  $: analyticsCurrency = ($userProfile?.accountCurrency || 'USD').trim() || 'USD';
  $: analyticsAmtDec = decimalsFor(analyticsCurrency);

  $: wow = computeWeekOverWeek(closedTrades, $dayJournal, profitOf);
  $: deltaLines = buildWeeklyDeltaLines(wow);
  $: journal28 = computeJournalVsPnL(closedTrades, $dayJournal, 28, profitOf);
  $: journalDailyBars = journalPnLDailyBars(closedTrades, $dayJournal, 28, profitOf);
  $: playbookEdge = computePlaybookEdge(closedTrades, $strategies, profitOf);
  $: killzoneTz =
    $journalSettings && typeof $journalSettings.killzoneTimezone === 'string'
      ? $journalSettings.killzoneTimezone
      : 'America/New_York';
  $: heatmaps = computeContextHeatmaps(closedTrades, profitOf, killzoneTz);
  $: playbookChartRows = playbookEdge.slice(0, 12).map((r) => ({
    label: `${r.strategyName} → ${r.playName}`,
    sum: r.sum,
    count: r.count,
    wins: r.wins,
    hint: `E ${r.expectancy.toFixed(3)} · WR ${r.winRate.toFixed(0)}%`
  }));
  $: kzChartRows =
    heatmaps.killzones?.map((r) => ({
      label: r.label,
      sum: r.sum,
      count: r.count,
      wins: r.wins ?? 0,
      hint: `avg ${r.avgPnL?.toFixed?.(2) ?? '—'}`
    })) ?? [];
  $: dowChartRows =
    heatmaps.weekdays?.map((r) => ({
      label: r.label,
      sum: r.sum,
      count: r.count,
      wins: r.wins ?? 0,
      hint: `avg ${r.avgPnL?.toFixed?.(2) ?? '—'}`
    })) ?? [];
  $: weeklyPick = pickWeeklyExperiment(wow, journal28, playbookEdge);

  function reconcileWeeklyExp(weekKeyNow, suggestion, loaded, closedTradesList, dayJournalMap, profitOfFn) {
    const base =
      loaded && typeof loaded === 'object'
        ? {
            weekKey: String(loaded.weekKey || weekKeyNow),
            experimentKey: String(loaded.experimentKey || suggestion.experimentKey),
            committed: !!loaded.committed
          }
        : null;

    if (
      base?.committed &&
      base.weekKey &&
      base.weekKey !== weekKeyNow
    ) {
      const rollup = rollupIsoWeek(closedTradesList, base.weekKey, profitOfFn, dayJournalMap);
      const tradesPast = closedTradesForIsoWeek(closedTradesList, base.weekKey, profitOfFn);
      const outcome = evaluateWeeklyExperimentOutcome(base.experimentKey, rollup, {
        tradesInWeek: tradesPast,
        dayJournalMap,
        profitOf: profitOfFn
      });
      pushWeeklyExperimentHistory({
        weekKey: base.weekKey,
        experimentKey: base.experimentKey,
        archivedAt: new Date().toISOString(),
        rollup: rollup || {},
        outcome
      });
    }

    if (!base || base.weekKey !== weekKeyNow) {
      const next = { weekKey: weekKeyNow, experimentKey: suggestion.experimentKey, committed: false };
      saveAccountData(WEEK_EXP_KEY, next);
      return next;
    }
    if (!base.committed && base.experimentKey !== suggestion.experimentKey) {
      const next = { ...base, experimentKey: suggestion.experimentKey };
      saveAccountData(WEEK_EXP_KEY, next);
      return next;
    }
    return base;
  }

  $: weeklyExpStored = reconcileWeeklyExp(
    isoWeekKey(new Date()),
    weeklyPick,
    loadAccountData(WEEK_EXP_KEY, null),
    closedTrades,
    $dayJournal,
    profitOf
  );

  $: weeklyFocusHistory = (weeklyExpStored, loadWeeklyExperimentHistory());

  $: activeExperimentKey =
    weeklyExpStored?.committed ? weeklyExpStored.experimentKey : weeklyPick.experimentKey;
  $: currentWeekRollup = rollupIsoWeek(closedTrades, isoWeekKey(new Date()), profitOf, $dayJournal);
  $: tradesCurrentIsoWeek = closedTradesForIsoWeek(closedTrades, isoWeekKey(new Date()), profitOf);
  $: currentWeekOutcome = evaluateWeeklyExperimentOutcome(activeExperimentKey, currentWeekRollup, {
    tradesInWeek: tradesCurrentIsoWeek,
    dayJournalMap: $dayJournal,
    wow,
    profitOf
  });

  function verdictRu(v) {
    if (v === 'up') return '↑ лучше ожиданий';
    if (v === 'flat') return '≈ нейтрально';
    if (v === 'down') return '↓ слабее ожиданий';
    return 'Вручную';
  }

  function commitWeeklyExperiment() {
    const next = {
      weekKey: isoWeekKey(new Date()),
      experimentKey: weeklyPick.experimentKey,
      committed: true
    };
    saveAccountData(WEEK_EXP_KEY, next);
    weeklyExpStored = next;
  }

  $: pack = buildMentorPack({
    closedTrades,
    openTrades: ($trades || []).filter((t) => t.status === 'open'),
    profile: $userProfile,
    dayJournalMap: $dayJournal,
    stats,
    streak,
    dailyStopHit: dailyStop.hit,
    cooldownActive: cooldownLeftMs > 0,
    todayPnL
  });

  function goJournal() {
    dispatch('openJournal');
  }

  function beaconClass(tone) {
    if (tone === 'danger') return 'analytics-beacon analytics-beacon--danger';
    if (tone === 'warn') return 'analytics-beacon analytics-beacon--warn';
    if (tone === 'good') return 'analytics-beacon analytics-beacon--good';
    return 'analytics-beacon analytics-beacon--calm';
  }

  /** Короткая метка уровня для полосы ключей состояния */
  function stanceLvlShort(level) {
    if (level === 'danger') return 'Стоп';
    if (level === 'warn') return 'Риск';
    if (level === 'watch') return 'Внимание';
    return 'Норма';
  }

  function formatPF(x) {
    if (x === Infinity || x > 1e6) return '∞';
    if (!Number.isFinite(x)) return '—';
    return x.toFixed(2);
  }
</script>

<div class="analytics-root">
  <div class="analytics-tabbar" role="tablist" aria-label="Разделы аналитики">
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'overview'}
      aria-selected={analyticsTab === 'overview'}
      on:click={() => (analyticsTab = 'overview')}>Обзор</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'week'}
      aria-selected={analyticsTab === 'week'}
      on:click={() => (analyticsTab = 'week')}>Неделя</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'focus'}
      aria-selected={analyticsTab === 'focus'}
      on:click={() => (analyticsTab = 'focus')}>Фокус недели</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'journal_pnl'}
      aria-selected={analyticsTab === 'journal_pnl'}
      on:click={() => (analyticsTab = 'journal_pnl')}>Дневник и PnL</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'setups'}
      aria-selected={analyticsTab === 'setups'}
      on:click={() => (analyticsTab = 'setups')}>Сетапы</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'context'}
      aria-selected={analyticsTab === 'context'}
      on:click={() => (analyticsTab = 'context')}>Контекст</button>
    <button
      type="button"
      role="tab"
      class="analytics-tab"
      class:analytics-tab--active={analyticsTab === 'faq'}
      aria-selected={analyticsTab === 'faq'}
      on:click={() => (analyticsTab = 'faq')}>Справка</button>
  </div>

  {#if analyticsTab === 'overview'}
  <header class="analytics-hero">
    <div class="analytics-hero-text">
      <h2 class="analytics-title">Аналитика</h2>
      <p class="analytics-sub">Наставник и дорожная карта без отчётов — опора на твои данные и рефлексию.</p>
    </div>
    <div class="analytics-phase-badge" title="По шагам дорожной карты ниже">
      <span class="analytics-phase-label">Точка роста</span>
      <span class="analytics-phase-value">{pack.phase}</span>
      <span class="analytics-phase-meta">{pack.doneCount}/{pack.roadmapTotal} шагов</span>
    </div>
  </header>

  {#if pack.stances?.length}
    <section class="analytics-card analytics-stances" aria-label="Ключи состояния">
      <div class="analytics-stances-head">
        <span class="analytics-stances-kicker">Ключи состояния</span>
        <span class="analytics-stances-hint"
          >Общий срез по журналу. Блок «База советов» подмешивает темы всех ключей, кроме «Норма», к маякам; оригиналы — посты Виктора и Руфата.</span>
      </div>
      <div class="analytics-stances-row">
        {#each pack.stances as st (st.id)}
          <div class="analytics-stance analytics-stance--{st.level}" title={st.blurb}>
            <span class="analytics-stance-title">{st.title}</span>
            <span class="analytics-stance-lvl">{stanceLvlShort(st.level)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="analytics-card analytics-summary">
    <p class="analytics-summary-text">{pack.headline}</p>
    {#if closedTrades.length > 0}
      <div class="analytics-mini-metrics">
        <span title="Просадка по эквити в журнале">Просадка: {pack.metrics.ddPct.toFixed(1)}%</span>
        <span>Сделок за 7 дн.: {pack.metrics.closed7}</span>
        <span>Дневник (7 дн.): {pack.metrics.journal7} дн.</span>
        <span
          class:analytics-metric-warn={pack.metrics.weekPnL < 0}
          title="PnL закрытых с начала календарной недели">Неделя: {pack.metrics.weekPnL.toFixed(2)}</span>
        {#if pack.metrics.openCount > 0}
          <span class:analytics-metric-warn={pack.metrics.openWithoutSl > 0}
            >Открыто: {pack.metrics.openCount}{#if pack.metrics.openWithoutSl > 0}
              · без SL: {pack.metrics.openWithoutSl}{/if}</span>
        {/if}
        {#if pack.metrics.manualClosed30 > 0 && pack.metrics.manualAttachRate30 != null}
          <span
            class:analytics-metric-warn={pack.metrics.manualAttachRate30 < 0.5}
            title="Закрытые ручные (не импорт MT5) за 30 дней: доля хотя бы с одним файлом"
            >Ручные 30д: {pack.metrics.manualClosed30} · с вложениями {(pack.metrics.manualAttachRate30 * 100).toFixed(0)}%</span>
        {/if}
      </div>
    {/if}
  </section>

  <section class="analytics-section">
    <h3 class="analytics-section-title">Маяки</h3>
    <p class="analytics-section-lede">
      Сигналы из журнала: что усилить или чему уделить внимание сегодня.
    </p>
    {#if pack.beacons.length === 0}
      <p class="analytics-muted">Нет активных маяков.</p>
    {:else}
      <div class="analytics-beacons">
        {#each pack.beacons as b (b.tag + b.title)}
          <article class={beaconClass(b.tone)}>
            <div class="analytics-beacon-head">
              <span class="analytics-beacon-dot" aria-hidden="true"></span>
              <h4>{b.title}</h4>
            </div>
            {#each b.body as para}
              <p>{para}</p>
            {/each}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  {#if pack.advicePick?.length}
    <section class="analytics-section">
      <h3 class="analytics-section-title">База советов</h3>
      <p class="analytics-section-lede">
        Подборка по темам маяков. Оригиналы постов — ⓘ у заголовка; если в карточке два автора, в панели вкладки «Руфат» и «Виктор».
      </p>
      <div class="analytics-advice">
        {#each pack.advicePick as item (item.id)}
          <article class="analytics-advice-card">
            <div class="analytics-advice-head-row">
              <h4 class="analytics-advice-title">{item.title}</h4>
              {#if item.sourceRefs?.length}
                <JournalSourceHint sourceIds={item.sourceRefs} />
              {/if}
            </div>
            <p class="analytics-advice-takeaway">{item.takeaway}</p>
            {#if item.directions?.length}
              <ul class="analytics-advice-steps">
                {#each item.directions as line}
                  <li>{line}</li>
                {/each}
              </ul>
            {/if}
            {#if !item.sourceRefs?.length && item.sourceText}
              <blockquote class="analytics-advice-quote">
                <p>{item.sourceText}</p>
                {#if item.sourceAuthor}
                  <footer>— {item.sourceAuthor}</footer>
                {/if}
              </blockquote>
            {/if}
            {#if item.sourceUrl}
              <a
                class="analytics-advice-link"
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer">Оригинал поста</a>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <section class="analytics-section">
    <h3 class="analytics-section-title">Дорожная карта</h3>
    <p class="analytics-section-lede">
      Этапы процесса, не прогноз рынка. Галочки ставятся автоматически по журналу и профилю.
    </p>
    <ol class="analytics-roadmap">
      {#each pack.roadmap as step (step.id)}
        <li class="analytics-roadmap-item" class:analytics-roadmap-item--done={step.done}>
          <span class="analytics-roadmap-marker" aria-hidden="true">{step.done ? '✓' : ''}</span>
          <div class="analytics-roadmap-body">
            <strong>{step.title}</strong>
            <span class="analytics-roadmap-hint">{step.hint}</span>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <section class="analytics-card analytics-reflection">
    <h3 class="analytics-section-title analytics-section-title--tight">Рефлексия</h3>
    <p class="analytics-reflection-q">{pack.reflectionPrompt}</p>
    <button type="button" class="btn btn-primary analytics-reflection-btn" on:click={goJournal}>
      Открыть дневник
    </button>
  </section>

  {:else if analyticsTab === 'week'}
  <section class="analytics-card analytics-subtab-lede">
    <h3 class="analytics-section-title analytics-section-title--tight">Неделя к неделе</h3>
    <p class="analytics-section-lede analytics-section-lede--tight">
      Сравнение текущей ISO-недели с предыдущей по закрытым из журнала и дням дневника.
    </p>
    <div class="analytics-table-wrap">
      <table class="analytics-data-table">
        <thead>
          <tr>
            <th>Показатель</th>
            <th>{wow.prev.weekKey}</th>
            <th>{wow.current.weekKey}</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Сделок (закрытых в окне)</td>
            <td>{wow.prev.trades}</td>
            <td>{wow.current.trades}</td>
            <td class:analytics-delta-neg={wow.deltas.trades < 0} class:analytics-delta-pos={wow.deltas.trades > 0}>{wow.deltas.trades >= 0 ? '+' : ''}{wow.deltas.trades}</td>
          </tr>
          <tr>
            <td>PnL окна (у.е.)</td>
            <td>{wow.prev.pnl.toFixed(2)}</td>
            <td>{wow.current.pnl.toFixed(2)}</td>
            <td class:analytics-delta-neg={wow.deltas.pnl < 0} class:analytics-delta-pos={wow.deltas.pnl > 0}>{wow.deltas.pnl >= 0 ? '+' : ''}{wow.deltas.pnl.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Побед / поражений</td>
            <td>{wow.prev.wins} / {wow.prev.losses}</td>
            <td>{wow.current.wins} / {wow.current.losses}</td>
            <td>{wow.deltas.wins >= 0 ? '+' : ''}{wow.deltas.wins}</td>
          </tr>
          <tr>
            <td>Винрейт %</td>
            <td>{wow.prev.winRatePct.toFixed(1)}%</td>
            <td>{wow.current.winRatePct.toFixed(1)}%</td>
            <td>{wow.deltas.winRatePct >= 0 ? '+' : ''}{wow.deltas.winRatePct.toFixed(1)}</td>
          </tr>
          <tr>
            <td>Дневника (содержательных дн.)</td>
            <td>{wow.prev.journalDays}</td>
            <td>{wow.current.journalDays}</td>
            <td>{wow.deltas.journalDays >= 0 ? '+' : ''}{wow.deltas.journalDays}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="analytics-chart-grid">
      <div class="analytics-chart-panel">
        <h4 class="analytics-chart-panel-title">Сделки и дни дневника</h4>
        <AnalyticsWoWCompareChart
          prevLabel={shortIsoWeekLabel(wow.prev.weekKey)}
          currLabel={shortIsoWeekLabel(wow.current.weekKey)}
          prevTrades={wow.prev.trades}
          currTrades={wow.current.trades}
          prevJournalDays={wow.prev.journalDays}
          currJournalDays={wow.current.journalDays}
        />
      </div>
      <div class="analytics-chart-panel">
        <h4 class="analytics-chart-panel-title">PnL окна закрытых</h4>
        <AnalyticsWoWPnLChart
          prevLabel={shortIsoWeekLabel(wow.prev.weekKey)}
          currLabel={shortIsoWeekLabel(wow.current.weekKey)}
          prevPnl={wow.prev.pnl}
          currPnl={wow.current.pnl}
          currency={analyticsCurrency}
          moneyDecimals={analyticsAmtDec}
        />
      </div>
    </div>
    <ul class="analytics-delta-bullets">
      {#each deltaLines as line, i (i)}
        <li>{line}</li>
      {/each}
    </ul>
  </section>

  {:else if analyticsTab === 'focus'}
  <section class="analytics-card">
    <h3 class="analytics-section-title analytics-section-title--tight">Фокус недели</h3>
    <p class="analytics-section-lede analytics-section-lede--tight">
      Один процессный приоритет на текущую календарную неделю ({weeklyExpStored?.weekKey}). Выбор сохраняется вместе с данными активного счёта и переживает перезапуск приложения.
    </p>
    <div class="analytics-focus-card">
      <p class="analytics-focus-title">
        {experimentLabelForKey(
          weeklyExpStored?.committed ? weeklyExpStored.experimentKey : weeklyPick.experimentKey
        )}
      </p>
      <div class="analytics-focus-description">{experimentLongDescription(activeExperimentKey)}</div>
      {#if experimentMetricHint(activeExperimentKey)}
        <p class="analytics-focus-metric"><strong>Метрика успеха:</strong> {experimentMetricHint(activeExperimentKey)}</p>
      {/if}
      {#if currentWeekRollup && currentWeekOutcome}
        <div class="analytics-focus-preview">
          <div class="analytics-focus-preview-head">
            Текущая неделя ({shortIsoWeekLabel(currentWeekRollup.weekKey)}) — черновая оценка
            <span class="analytics-verdict-badge">{verdictRu(currentWeekOutcome.verdict)}</span>
          </div>
          {#if currentWeekOutcome.progress}
            <div class="analytics-focus-progress" aria-label="Прогресс по фокусу недели">
              <div class="analytics-focus-progress-caption">{currentWeekOutcome.progress.caption}</div>
              <div class="analytics-focus-progress-row">
                <div
                  class="analytics-focus-progress-track"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={currentWeekOutcome.progress.pct != null
                    ? Math.round(currentWeekOutcome.progress.pct)
                    : undefined}
                  aria-valuetext={currentWeekOutcome.progress.pct != null
                    ? `${Math.round(currentWeekOutcome.progress.pct)} процентов`
                    : currentWeekOutcome.progress.caption}>
                  {#if currentWeekOutcome.progress.pct != null}
                    <div
                      class="analytics-focus-progress-fill analytics-focus-progress-fill--{currentWeekOutcome.verdict}"
                      style="width: {Math.min(100, Math.max(0, currentWeekOutcome.progress.pct))}%"></div>
                  {:else}
                    <div class="analytics-focus-progress-fill analytics-focus-progress-fill--na"></div>
                  {/if}
                </div>
                {#if currentWeekOutcome.progress.pct != null}
                  <span class="analytics-focus-progress-value"
                    >{Math.round(currentWeekOutcome.progress.pct)}%</span>
                {:else}
                  <span class="analytics-focus-progress-value analytics-focus-progress-value--muted">—</span>
                {/if}
              </div>
            </div>
          {/if}
          {#if currentWeekOutcome.lines?.length}
            <ul class="analytics-focus-preview-lines">
              {#each currentWeekOutcome.lines as ln, li (li)}
                <li>{ln}</li>
              {/each}
            </ul>
          {/if}
          <p class="analytics-muted analytics-focus-preview-note">
            Закр.: {currentWeekRollup.trades} · дн. дневника: {currentWeekRollup.journalDays} · PnL окна: {currentWeekRollup.pnl.toFixed(2)}
            {analyticsCurrency}
          </p>
        </div>
      {/if}
      <p class="analytics-focus-meta">
        Сейчас выбран фокус:
        <strong>{experimentLabelForKey(weeklyExpStored?.experimentKey || activeExperimentKey)}</strong>
        {#if weeklyExpStored?.committed}
          <span class="analytics-badge-ok">зафиксировано на неделю</span>
        {:else}
          <span class="analytics-badge-soft">может обновляться пока данных больше</span>
        {/if}
      </p>
      <button
        type="button"
        class="btn btn-primary"
        disabled={weeklyExpStored?.committed}
        on:click={commitWeeklyExperiment}>
        {weeklyExpStored?.committed ? 'Уже принято' : 'Принять фокус на эту неделю'}
      </button>
    </div>

    {#if weeklyFocusHistory.length > 0}
      <h4 class="analytics-subhead" style="margin-top: 18px;">История принятых фокусов</h4>
      <p class="analytics-muted analytics-section-lede--tight">
        Запись появляется, когда ты принял фокус на одну неделю, та неделя закончилась и началась следующая — итог тогда архивируется сюда.
      </p>
      <div class="analytics-table-wrap">
        <table class="analytics-data-table analytics-focus-hist-table">
          <thead>
            <tr>
              <th>Неделя</th>
              <th>Эксперимент</th>
              <th>Итог</th>
              <th>Сводка</th>
            </tr>
          </thead>
          <tbody>
            {#each weeklyFocusHistory as row, ri (row.archivedAt + row.weekKey + ri)}
              <tr>
                <td><code class="analytics-inline-code">{shortIsoWeekLabel(row.weekKey)}</code></td>
                <td>{experimentLabelForKey(row.experimentKey)}</td>
                <td>
                  <div class="analytics-focus-hist-verdict">{verdictRu(row.outcome?.verdict)}</div>
                  {#if row.outcome?.progress && row.outcome.progress.pct != null}
                    <div
                      class="analytics-focus-hist-bar"
                      role="img"
                      aria-label={'Прогресс ' + Math.round(row.outcome.progress.pct) + '%'}>
                      <span
                        class="analytics-focus-hist-bar-fill analytics-focus-progress-fill--{row.outcome.verdict}"
                        style="width: {Math.min(100, Math.max(0, row.outcome.progress.pct))}%"></span>
                    </div>
                  {/if}
                </td>
                <td class="analytics-focus-hist-detail">
                  {#if row.rollup && row.rollup.trades != null}
                    n={row.rollup.trades}, журн. дн.={row.rollup.journalDays ?? '—'}, PnL={Number(row.rollup.pnl || 0).toFixed(2)}
                  {:else}
                    —
                  {/if}
                  {#if row.outcome?.lines?.length}
                    <ul class="analytics-focus-hist-ul">
                      {#each row.outcome.lines as hl, hi (hi)}
                        <li>{hl}</li>
                      {/each}
                    </ul>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {:else if analyticsTab === 'journal_pnl'}
  <section class="analytics-card analytics-subtab-lede">
    <h3 class="analytics-section-title analytics-section-title--tight">Дневник ↔ PnL (28 дн.)</h3>
    <p class="analytics-summary-text">{journal28.headline}</p>
    <div class="analytics-mini-metrics analytics-mini-metrics--block">
      <span>Торговых дн.: {journal28.tradeDays}</span>
      <span>Содержательных дней дн.: {journal28.journalDays}</span>
      <span>Оба: {journal28.bothTradeAndJournalDays}</span>
      <span>Плюсовых д.: {journal28.profitDays}</span>
      <span>Минусовых д.: {journal28.lossDays}</span>
      <span>Сделок без дн.: {journal28.tradedWithoutJournal}</span>
    </div>
    {#if journal28.tradeDays > 0}
      <div class="analytics-chart-panel analytics-chart-panel--wide">
        <h4 class="analytics-chart-panel-title">Торговые дни: дневник да / нет</h4>
        <AnalyticsTradeDaysJournalStackChart
          withJournal={journal28.bothTradeAndJournalDays}
          withoutJournal={journal28.tradedWithoutJournal}
        />
      </div>
      <div class="analytics-chart-panel analytics-chart-panel--wide">
        <h4 class="analytics-chart-panel-title">PnL по календарным дням окна</h4>
        <AnalyticsJournalDailyPnLChart
          days={journalDailyBars}
          currency={analyticsCurrency}
          moneyDecimals={analyticsAmtDec}
        />
      </div>
    {/if}
  </section>

  {:else if analyticsTab === 'setups'}
  <section class="analytics-card">
    <h3 class="analytics-section-title analytics-section-title--tight">Эдж по связке strategy/play</h3>
    <p class="analytics-section-lede analytics-section-lede--tight">
      Только сделки с заполненными strategyId/playId и закрытием из журнала (приоритет строк с ≥5 сделок для сортировки по ожиданию).
    </p>
    {#if playbookEdge.length === 0}
      <p class="analytics-muted">Нет привязок — добавь их в форме сделки.</p>
    {:else}
      <div class="analytics-chart-panel analytics-chart-panel--wide analytics-chart-panel--flush">
        <h4 class="analytics-chart-panel-title">Топ связок (до 12)</h4>
        <p class="analytics-chart-caption">
          Горизонтальные столбцы — суммарный PnL; подсказка по слою — WR и expectancy.
        </p>
        <StatisticsKillzoneChart
          rows={playbookChartRows}
          currency={analyticsCurrency}
          moneyDecimals={analyticsAmtDec}
          chartHeight={Math.min(440, 72 + playbookChartRows.length * 34)}
        />
      </div>
      <div class="analytics-table-wrap">
        <table class="analytics-data-table">
          <thead>
            <tr>
              <th>Сетап</th>
              <th>n</th>
              <th>WR%</th>
              <th>Сумма</th>
              <th>Е [сделка]</th>
              <th>PF</th>
            </tr>
          </thead>
          <tbody>
            {#each playbookEdge as row (row.key)}
              <tr>
                <td>{row.strategyName} → {row.playName}</td>
                <td>{row.count}</td>
                <td>{row.winRate.toFixed(1)}</td>
                <td class:analytics-delta-neg={row.sum < 0} class:analytics-delta-pos={row.sum > 0}>{row.sum.toFixed(2)}</td>
                <td>{row.expectancy.toFixed(3)}</td>
                <td>{formatPF(row.profitFactor)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {:else if analyticsTab === 'context'}
  <section class="analytics-card">
    <h3 class="analytics-section-title analytics-section-title--tight">Контекст</h3>
    <p class="analytics-muted">{heatmaps.tzNote}</p>
    <h4 class="analytics-subhead">Primary killzone (по открытию)</h4>
    {#if heatmaps.killzones.length === 0}
      <p class="analytics-muted">Нет закрытых с датой.</p>
    {:else}
      <div class="analytics-chart-panel analytics-chart-panel--flush">
        <h4 class="analytics-chart-panel-title">Killzone · Net PnL</h4>
        <StatisticsKillzoneChart
          rows={kzChartRows}
          currency={analyticsCurrency}
          moneyDecimals={analyticsAmtDec}
          chartHeight={Math.min(320, 68 + kzChartRows.filter((r) => r.count > 0).length * 36)}
        />
      </div>
      <div class="analytics-table-wrap">
        <table class="analytics-data-table">
          <thead>
            <tr>
              <th>Зона</th>
              <th>n</th>
              <th>Сумма</th>
              <th>Ср.</th>
              <th>WR%</th>
            </tr>
          </thead>
          <tbody>
            {#each heatmaps.killzones as row (row.id + row.label)}
              <tr>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td class:analytics-delta-neg={row.sum < 0} class:analytics-delta-pos={row.sum > 0}>{row.sum.toFixed(2)}</td>
                <td>{row.avgPnL.toFixed(2)}</td>
                <td>{row.winRatePct.toFixed(0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <h4 class="analytics-subhead">День недели (дата закрытия)</h4>
    {#if heatmaps.weekdays.length === 0}
      <p class="analytics-muted">—</p>
    {:else}
      <div class="analytics-chart-panel analytics-chart-panel--flush">
        <h4 class="analytics-chart-panel-title">День недели · Net PnL</h4>
        <StatisticsKillzoneChart
          rows={dowChartRows}
          currency={analyticsCurrency}
          moneyDecimals={analyticsAmtDec}
          chartHeight={Math.min(260, 68 + dowChartRows.filter((r) => r.count > 0).length * 36)}
        />
      </div>
      <div class="analytics-table-wrap">
        <table class="analytics-data-table">
          <thead>
            <tr>
              <th>День</th>
              <th>n</th>
              <th>Сумма</th>
              <th>Ср.</th>
              <th>WR%</th>
            </tr>
          </thead>
          <tbody>
            {#each heatmaps.weekdays as row (row.dow)}
              <tr>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td class:analytics-delta-neg={row.sum < 0} class:analytics-delta-pos={row.sum > 0}>{row.sum.toFixed(2)}</td>
                <td>{row.avgPnL.toFixed(2)}</td>
                <td>{row.winRatePct.toFixed(0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {:else if analyticsTab === 'faq'}
  <section class="analytics-card analytics-faq">
    <h3 class="analytics-section-title analytics-section-title--tight">Вопросы и ответы</h3>
    <p class="analytics-section-lede analytics-section-lede--tight">
      Готовые разборы типичных тем — без ИИ. Поиск и категории; у пункта с привязкой к базе — ⓘ: полный текст поста (при двух авторах — вкладки).
    </p>
    <div class="analytics-faq-toolbar form-group">
      <label for="analytics-faq-search">Поиск по формулировке</label>
      <input
        id="analytics-faq-search"
        type="search"
        class="analytics-faq-search"
        placeholder="Например: журнал, тильт, риск на сделку…"
        autocomplete="off"
        bind:value={faqSearch}
      />
    </div>
    <div class="analytics-faq-cats" role="group" aria-label="Категории вопросов">
      <button
        type="button"
        class="analytics-faq-chip"
        class:analytics-faq-chip--active={faqCategory === 'all'}
        on:click={() => setFaqCategory('all')}>Все</button>
      {#each ANALYTICS_QUESTION_CATEGORIES as cat (cat.id)}
        <button
          type="button"
          class="analytics-faq-chip"
          class:analytics-faq-chip--active={faqCategory === cat.id}
          on:click={() => setFaqCategory(cat.id)}>{cat.label}</button>
      {/each}
    </div>
    {#if filteredFaq.length === 0}
      <p class="analytics-muted analytics-faq-empty">Ничего не нашлось — смени фильтр или поиск.</p>
    {:else}
      <ul class="analytics-faq-list">
        {#each filteredFaq as item (item.id)}
          <li class="analytics-faq-item">
            <div class="analytics-faq-q-row">
              <button
                type="button"
                class="analytics-faq-q"
                aria-expanded={faqOpenId === item.id}
                aria-controls="faq-a-{item.id}"
                on:click={() => toggleFaq(item.id)}>
                <span class="analytics-faq-q-text">{item.question}</span>
                <span class="analytics-faq-chevron" aria-hidden="true">{faqOpenId === item.id ? '▼' : '▶'}</span>
              </button>
              {#if item.sourceRefs?.length}
                <JournalSourceHint sourceIds={item.sourceRefs} />
              {/if}
            </div>
            {#if faqOpenId === item.id}
              <div class="analytics-faq-a" id="faq-a-{item.id}" role="region">
                {#each item.answer as para}
                  <p>{para}</p>
                {/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {/if}
</div>

<style>
  .analytics-root {
    max-width: 940px;
    margin: 0 auto;
    padding: 8px 4px 28px;
    box-sizing: border-box;
  }
  .analytics-tabbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 96%, var(--border));
  }
  .analytics-tab {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      color 0.12s;
  }
  .analytics-tab:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    color: var(--text-strong);
  }
  .analytics-tab--active {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--text-strong);
  }
  .analytics-subhead {
    margin: 16px 0 8px;
    font-size: 12px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .analytics-table-wrap {
    overflow-x: auto;
    margin-top: 10px;
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .analytics-data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .analytics-data-table th,
  .analytics-data-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .analytics-data-table th {
    font-weight: 650;
    color: var(--text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .analytics-data-table tbody tr:last-child td {
    border-bottom: none;
  }
  .analytics-delta-pos {
    color: var(--profit, #16a34a);
    font-weight: 600;
  }
  .analytics-delta-neg {
    color: var(--loss, #c44);
    font-weight: 600;
  }
  .analytics-delta-bullets {
    margin: 12px 0 0;
    padding-left: 1.25rem;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .analytics-delta-bullets li {
    margin: 6px 0;
  }
  .analytics-mini-metrics--block {
    flex-direction: column;
    gap: 6px;
  }
  .analytics-focus-card {
    margin-top: 10px;
    padding: 12px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, var(--bg));
  }
  .analytics-focus-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 650;
    color: var(--text-strong);
    line-height: 1.4;
  }
  .analytics-focus-meta {
    margin: 12px 0;
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .analytics-badge-ok {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--profit, #16a34a) 18%, transparent);
    color: var(--profit, #16a34a);
  }
  .analytics-badge-soft {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning, #d97706) 16%, transparent);
    color: var(--warning, #d97706);
  }
  .analytics-focus-description {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.52;
    color: var(--text-muted);
    white-space: pre-wrap;
  }
  .analytics-focus-metric {
    margin: 10px 0 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text);
  }
  .analytics-focus-preview {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--bg) 97%, var(--border));
  }
  .analytics-focus-preview-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-strong);
  }
  .analytics-focus-progress {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .analytics-focus-progress-caption {
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .analytics-focus-progress-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .analytics-focus-progress-track {
    flex: 1;
    min-width: 0;
    height: 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 55%, var(--bg));
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .analytics-focus-progress-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.25s ease;
  }
  .analytics-focus-progress-fill--up {
    background: color-mix(in srgb, #1d8f4a 82%, var(--accent));
  }
  .analytics-focus-progress-fill--flat {
    background: color-mix(in srgb, var(--warning) 75%, var(--accent));
  }
  .analytics-focus-progress-fill--down {
    background: color-mix(in srgb, var(--stance-warn, var(--warning)) 85%, #a31f1f);
  }
  .analytics-focus-progress-fill--manual {
    background: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .analytics-focus-progress-fill--na {
    width: 100% !important;
    background: repeating-linear-gradient(
      -12deg,
      color-mix(in srgb, var(--border) 70%, transparent),
      color-mix(in srgb, var(--border) 70%, transparent) 6px,
      color-mix(in srgb, var(--bg) 92%, var(--border)) 6px,
      color-mix(in srgb, var(--bg) 92%, var(--border)) 12px
    );
  }
  .analytics-focus-progress-value {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    color: var(--text-strong);
    min-width: 2.5rem;
    text-align: right;
  }
  .analytics-focus-progress-value--muted {
    font-weight: 600;
    color: var(--text-muted);
  }
  .analytics-focus-hist-verdict {
    font-size: 12px;
    margin-bottom: 4px;
  }
  .analytics-focus-hist-bar {
    display: block;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 55%, var(--bg));
    overflow: hidden;
    max-width: 120px;
  }
  .analytics-focus-hist-bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }
  .analytics-verdict-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--text-muted);
  }
  .analytics-focus-preview-lines {
    margin: 8px 0 0;
    padding-left: 1.15rem;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .analytics-focus-preview-lines li {
    margin: 4px 0;
  }
  .analytics-focus-preview-note {
    margin: 8px 0 0;
    font-size: 11.5px;
  }
  .analytics-focus-hist-table td.analytics-focus-hist-detail {
    font-size: 11.5px;
    color: var(--text-muted);
    max-width: 320px;
  }
  .analytics-focus-hist-ul {
    margin: 6px 0 0;
    padding-left: 1rem;
    font-size: 11px;
    line-height: 1.4;
  }
  .analytics-focus-hist-ul li {
    margin: 3px 0;
  }
  .analytics-subtab-lede .analytics-summary-text {
    margin-top: 8px;
  }
  .analytics-chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 14px 0 4px;
    align-items: stretch;
  }
  @media (max-width: 720px) {
    .analytics-chart-grid {
      grid-template-columns: 1fr;
    }
  }
  .analytics-chart-panel {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--bg) 93%, var(--border));
    box-sizing: border-box;
    min-width: 0;
  }
  .analytics-chart-panel--wide {
    margin-top: 14px;
  }
  .analytics-chart-panel--flush {
    padding-bottom: 8px;
  }
  .analytics-chart-panel-title {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
  }
  .analytics-chart-caption {
    margin: 0 0 8px;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .analytics-hero {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .analytics-title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-strong);
    letter-spacing: 0.02em;
  }
  .analytics-sub {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-muted);
    max-width: 520px;
  }
  .analytics-phase-badge {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .analytics-phase-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
  }
  .analytics-phase-value {
    font-size: 15px;
    font-weight: 650;
    color: var(--text-strong);
  }
  .analytics-phase-meta {
    font-size: 12px;
    color: var(--text-muted);
  }
  .analytics-stances {
    padding: 12px 14px;
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
  }
  .analytics-stances-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 14px;
    margin-bottom: 10px;
  }
  .analytics-stances-kicker {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .analytics-stances-hint {
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
    flex: 1;
    min-width: min(100%, 220px);
  }
  .analytics-stances-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: stretch;
  }
  .analytics-stance {
    flex: 1 1 100px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 96%, var(--border));
    box-sizing: border-box;
    cursor: help;
  }
  .analytics-stance-title {
    font-size: 12px;
    font-weight: 650;
    color: var(--text-strong);
    line-height: 1.25;
  }
  .analytics-stance-lvl {
    font-size: 11.5px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .analytics-stance--ok {
    border-left: 3px solid var(--stance-ok, var(--profit, #16a34a));
  }
  .analytics-stance--watch {
    border-left: 3px solid var(--stance-watch, var(--accent));
  }
  .analytics-stance--warn {
    border-left: 3px solid var(--stance-warn, var(--warning, #d97706));
  }
  .analytics-stance--danger {
    border-left: 3px solid var(--stance-danger, var(--loss, #c44));
  }
  .analytics-stance--ok .analytics-stance-lvl {
    color: var(--stance-ok, var(--profit, #16a34a));
  }
  .analytics-stance--watch .analytics-stance-lvl {
    color: color-mix(in srgb, var(--stance-watch, var(--accent)) 88%, var(--text-muted));
  }
  .analytics-stance--warn .analytics-stance-lvl {
    color: var(--stance-warn, var(--warning, #d97706));
  }
  .analytics-stance--danger .analytics-stance-lvl {
    color: var(--stance-danger, var(--loss, #c44));
  }
  .analytics-card {
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 96%, var(--border));
    margin-bottom: 18px;
  }
  .analytics-summary-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text);
  }
  .analytics-mini-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 18px;
    margin-top: 12px;
    font-size: 12px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .analytics-mini-metrics span.analytics-metric-warn {
    color: var(--loss, #c44);
    font-weight: 600;
  }
  .analytics-section {
    margin-bottom: 22px;
  }
  .analytics-section-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-strong);
  }
  .analytics-section-title--tight {
    margin-bottom: 8px;
  }
  .analytics-section-lede {
    margin: 0 0 12px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .analytics-section-lede--tight {
    margin-bottom: 10px;
  }
  .analytics-faq-cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }
  .analytics-faq-chip {
    padding: 6px 11px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      color 0.12s;
  }
  .analytics-faq-chip:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    color: var(--text-strong);
  }
  .analytics-faq-chip--active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
    color: var(--text-strong);
  }
  .analytics-faq-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: min(70vh, 520px);
    overflow-y: auto;
    padding-right: 2px;
  }
  .analytics-faq-item {
    border: 1px solid var(--border);
    border-radius: 9px;
    overflow: hidden;
    background: var(--bg);
    flex-shrink: 0;
  }
  .analytics-faq-q-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 2px 8px 2px 2px;
    box-sizing: border-box;
  }
  .analytics-faq-q-row .analytics-faq-q {
    flex: 1;
    min-width: 0;
  }
  .analytics-faq-q {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    padding: 11px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: var(--text-strong);
    font-size: 13px;
    font-weight: 550;
    line-height: 1.45;
  }
  .analytics-faq-q:hover {
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
  .analytics-faq-q:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .analytics-faq-q-text {
    flex: 1;
    min-width: 0;
  }
  .analytics-faq-chevron {
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0.55;
    margin-top: 4px;
  }
  .analytics-faq-a {
    padding: 0 12px 12px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
    line-height: 1.52;
    color: var(--text);
    background: color-mix(in srgb, var(--bg) 96%, var(--border));
  }
  .analytics-faq-a p {
    margin: 10px 0 0;
  }
  .analytics-faq-empty {
    margin-top: 4px;
  }
  .analytics-muted {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }
  .analytics-beacons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .analytics-beacon {
    padding: 12px 14px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .analytics-beacon h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    color: var(--text-strong);
  }
  .analytics-beacon p {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }
  .analytics-beacon-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .analytics-beacon-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--text-muted);
  }
  .analytics-beacon--danger {
    border-color: color-mix(in srgb, var(--loss, #c44) 45%, var(--border));
    background: color-mix(in srgb, var(--loss, #c44) 7%, var(--bg));
  }
  .analytics-beacon--danger .analytics-beacon-dot {
    background: var(--loss, #c44);
  }
  .analytics-beacon--warn {
    border-color: color-mix(in srgb, var(--warning, #d97706) 40%, var(--border));
    background: color-mix(in srgb, var(--warning, #d97706) 8%, var(--bg));
  }
  .analytics-beacon--warn .analytics-beacon-dot {
    background: var(--warning, #d97706);
  }
  .analytics-beacon--good {
    border-color: color-mix(in srgb, var(--profit, #16a34a) 35%, var(--border));
    background: color-mix(in srgb, var(--profit, #16a34a) 7%, var(--bg));
  }
  .analytics-beacon--good .analytics-beacon-dot {
    background: var(--profit, #16a34a);
  }
  .analytics-beacon--calm {
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
  .analytics-beacon--calm .analytics-beacon-dot {
    background: var(--accent);
  }
  .analytics-roadmap {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .analytics-roadmap-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .analytics-roadmap-item:last-child {
    border-bottom: none;
  }
  .analytics-roadmap-item--done {
    background: color-mix(in srgb, var(--profit, #16a34a) 5%, var(--bg));
  }
  .analytics-roadmap-marker {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--profit, #16a34a);
  }
  .analytics-roadmap-item--done .analytics-roadmap-marker {
    border-color: color-mix(in srgb, var(--profit, #16a34a) 45%, var(--border));
    background: color-mix(in srgb, var(--profit, #16a34a) 12%, var(--bg));
  }
  .analytics-roadmap-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .analytics-roadmap-body strong {
    font-size: 13.5px;
    color: var(--text-strong);
  }
  .analytics-roadmap-hint {
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .analytics-inline-code {
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--border) 35%, transparent);
    word-break: break-all;
  }
  .analytics-advice {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .analytics-advice-card {
    padding: 12px 14px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 94%, var(--border));
  }
  .analytics-advice-head-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .analytics-advice-head-row .analytics-advice-title {
    flex: 1;
    min-width: 0;
  }
  .analytics-advice-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    color: var(--text-strong);
  }
  .analytics-advice-takeaway {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }
  .analytics-advice-steps {
    margin: 10px 0 0;
    padding-left: 1.2rem;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .analytics-advice-steps li {
    margin: 4px 0;
  }
  .analytics-advice-quote {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-left: 3px solid color-mix(in srgb, var(--accent) 50%, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, var(--bg));
    border-radius: 0 8px 8px 0;
  }
  .analytics-advice-quote p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    font-style: italic;
    color: var(--text);
    white-space: pre-wrap;
  }
  .analytics-advice-quote footer {
    margin-top: 8px;
    font-size: 11px;
    font-style: normal;
    color: var(--text-muted);
  }
  .analytics-advice-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }
  .analytics-advice-link:hover {
    text-decoration: underline;
  }
  .analytics-reflection {
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--accent) 6%, var(--bg)),
      color-mix(in srgb, var(--bg) 98%, var(--border))
    );
  }
  .analytics-reflection-q {
    margin: 0 0 14px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text);
  }
  .analytics-reflection-btn {
    align-self: flex-start;
  }
</style>
