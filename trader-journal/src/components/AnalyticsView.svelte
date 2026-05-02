<script>
  import { createEventDispatcher } from 'svelte';
  import { trades, userProfile } from '../lib/stores';
  import { dayJournal } from '../lib/dayJournal';
  import { fxRate, tradeProfitDisplayUnits } from '../lib/fxRate';
  import { calculateStats } from '../lib/utils';
  import { getCurrentStreak, checkDailyStop, getDailyPnL } from '../lib/risk';
  import { tickClock } from '../lib/livePrices';
  import { cooldown } from '../lib/cooldown';
  import { buildMentorPack } from '../lib/tradingMentor';
  import {
    ANALYTICS_QUESTION_CATEGORIES,
    filterAnalyticsQuestions
  } from '../lib/analyticsQuestions';
  import JournalSourceHint from './JournalSourceHint.svelte';

  const dispatch = createEventDispatcher();

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
</script>

<div class="analytics-root">
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
          >Общий срез по журналу. Блок «База советов» подмешивает темы всех ключей, кроме «Норма», к маякам.</span>
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

  <section class="analytics-card analytics-faq">
    <h3 class="analytics-section-title analytics-section-title--tight">Вопросы и ответы</h3>
    <p class="analytics-section-lede analytics-section-lede--tight">
      Готовые разборы типичных тем — без ИИ. Поиск и категории; у пункта с базой — иконка ⓘ: наведи или сфокусируй,
      чтобы прочитать исходные фрагменты постов.
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
        Релевантные записи по темам активных маяков. Исходные формулировки из базы — иконка ⓘ у заголовка. Расширение:
        <code class="analytics-inline-code">src/lib/adviceCorpus.js</code>
        или
        <code class="analytics-inline-code">localStorage['adviceCorpusExtension_v1']</code>.
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
</div>

<style>
  .analytics-root {
    max-width: 900px;
    margin: 0 auto;
    padding: 8px 4px 28px;
    box-sizing: border-box;
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
    border-left: 3px solid var(--profit, #16a34a);
  }
  .analytics-stance--watch {
    border-left: 3px solid color-mix(in srgb, var(--accent) 70%, var(--border));
  }
  .analytics-stance--warn {
    border-left: 3px solid var(--warning, #d97706);
  }
  .analytics-stance--danger {
    border-left: 3px solid var(--loss, #c44);
  }
  .analytics-stance--ok .analytics-stance-lvl {
    color: var(--profit, #16a34a);
  }
  .analytics-stance--watch .analytics-stance-lvl {
    color: color-mix(in srgb, var(--accent) 85%, var(--text-muted));
  }
  .analytics-stance--warn .analytics-stance-lvl {
    color: var(--warning, #d97706);
  }
  .analytics-stance--danger .analytics-stance-lvl {
    color: var(--loss, #c44);
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
