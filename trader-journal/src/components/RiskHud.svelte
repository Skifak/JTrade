<script>
  import { trades, userProfile } from '../lib/stores';
  import { livePrices, tickClock } from '../lib/livePrices';
  import { normalizeSymbolKey } from '../lib/constants';
  import { formatNumber } from '../lib/utils';
  import {
    getDailyPnL,
    getCurrentStreak,
    getOpenRisk,
    getOpenFloatingPnL,
    getDisciplineScore,
    computeMaxRiskAmount,
    computeMaxDailyLossAmount,
    computeGoalAmount
  } from '../lib/risk';

  $: openTrades = $trades.filter((t) => t.status === 'open');
  $: closedTrades = $trades.filter((t) => t.status === 'closed');

  $: maxRiskAmount = computeMaxRiskAmount($userProfile);
  $: maxDailyLossAmount = computeMaxDailyLossAmount($userProfile);
  $: goalDayAmount = computeGoalAmount($userProfile, 'Day');
  $: goalWeekAmount = computeGoalAmount($userProfile, 'Week');
  $: goalMonthAmount = computeGoalAmount($userProfile, 'Month');

  // Σ floating PnL — реактивно зависит от $livePrices и $tickClock
  $: floatingPnL = ($tickClock, getOpenFloatingPnL(openTrades, $livePrices, (t) => normalizeSymbolKey(t.pair)));

  $: closedPnLTotal = closedTrades.reduce((s, t) => s + (Number(t.profit) || 0), 0);
  $: equity = Number($userProfile?.initialCapital || 0) + closedPnLTotal + floatingPnL;
  $: equityDelta = equity - Number($userProfile?.initialCapital || 0);

  $: dailyPnL = getDailyPnL(closedTrades);
  $: weeklyPnL = closedTrades.reduce((s, t) => {
    if (!t?.dateClose) return s;
    const d = new Date(t.dateClose);
    const now = new Date();
    const startWeek = new Date(now);
    const dow = (now.getDay() + 6) % 7; // понедельник = 0
    startWeek.setDate(now.getDate() - dow);
    startWeek.setHours(0, 0, 0, 0);
    return d >= startWeek ? s + (Number(t.profit) || 0) : s;
  }, 0);
  $: monthlyPnL = closedTrades.reduce((s, t) => {
    if (!t?.dateClose) return s;
    const d = new Date(t.dateClose);
    const now = new Date();
    return (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
      ? s + (Number(t.profit) || 0) : s;
  }, 0);

  $: streak = getCurrentStreak(closedTrades);
  $: openRisk = getOpenRisk(openTrades, $userProfile);
  $: discipline = getDisciplineScore($trades);

  $: maxOpen = Number($userProfile?.maxOpenTrades || 0);
  $: maxStreak = Number($userProfile?.maxConsecutiveLosses || 0);

  // Лимит exposure = максРиск × maxOpenTrades (если задан)
  $: riskBudget = maxRiskAmount > 0 && maxOpen > 0 ? maxRiskAmount * maxOpen : 0;

  function pct(used, limit) {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.max(0, (used / limit) * 100));
  }

  // Цветовые состояния
  $: dailyState = (() => {
    if (!maxDailyLossAmount) return 'neutral';
    const used = -Math.min(0, dailyPnL); // только убыток
    const ratio = used / maxDailyLossAmount;
    if (dailyPnL >= 0) return 'profit';
    if (ratio >= 1) return 'danger';
    if (ratio >= 0.8) return 'warn';
    return 'loss';
  })();

  $: riskState = (() => {
    if (!riskBudget) return 'neutral';
    const ratio = openRisk.totalRisk / riskBudget;
    if (ratio > 1) return 'danger';
    if (ratio > 0.8) return 'warn';
    return 'ok';
  })();

  $: openState = (() => {
    if (!maxOpen) return 'neutral';
    if (openTrades.length >= maxOpen) return 'danger';
    if (openTrades.length >= maxOpen - 1) return 'warn';
    return 'ok';
  })();

  $: streakState = (() => {
    if (!maxStreak || streak.kind !== 'loss') return 'neutral';
    if (streak.length >= maxStreak) return 'danger';
    if (streak.length >= maxStreak - 1) return 'warn';
    return 'ok';
  })();

  $: disciplineState = (() => {
    if (discipline.score >= 95) return 'ok';
    if (discipline.score >= 80) return 'warn';
    return 'danger';
  })();

  $: ccy = $userProfile?.accountCurrency || 'USD';
</script>

<section class="hud" aria-label="Риск-показатели">
  <!-- Equity -->
  <div class="hud-card">
    <div class="hud-label">Equity</div>
    <div class="hud-value {equityDelta >= 0 ? 'profit' : 'loss'}">
      {formatNumber(equity, 2)} {ccy}
    </div>
    <div class="hud-sub">
      {equityDelta >= 0 ? '+' : ''}{formatNumber(equityDelta, 2)}
      <span class="muted">· float {formatNumber(floatingPnL, 2)}</span>
    </div>
  </div>

  <!-- Daily P/L -->
  <div class="hud-card">
    <div class="hud-label">Дневной P/L</div>
    <div class="hud-value state-{dailyState}">
      {dailyPnL >= 0 ? '+' : ''}{formatNumber(dailyPnL, 2)} {ccy}
    </div>
    {#if maxDailyLossAmount > 0}
      <div class="hud-bar">
        <div
          class="hud-bar-fill state-{dailyState}"
          style="width: {pct(Math.max(0, -dailyPnL), maxDailyLossAmount)}%"
        ></div>
      </div>
      <div class="hud-sub muted">
        стоп −{formatNumber(maxDailyLossAmount, 0)} {ccy}
      </div>
    {:else}
      <div class="hud-sub muted">лимит не задан</div>
    {/if}
  </div>

  <!-- Risk used -->
  <div class="hud-card">
    <div class="hud-label">Открытый риск</div>
    <div class="hud-value state-{riskState}">
      {formatNumber(openRisk.totalRisk, 2)} {ccy}
    </div>
    {#if riskBudget > 0}
      <div class="hud-bar">
        <div
          class="hud-bar-fill state-{riskState}"
          style="width: {pct(openRisk.totalRisk, riskBudget)}%"
        ></div>
      </div>
      <div class="hud-sub muted">
        бюджет {formatNumber(riskBudget, 0)} {ccy}
        {#if openRisk.withoutSlCount > 0}
          · <span class="warn">{openRisk.withoutSlCount} без SL</span>
        {/if}
      </div>
    {:else}
      <div class="hud-sub muted">
        {openRisk.withoutSlCount > 0 ? `${openRisk.withoutSlCount} без SL` : 'нет открытых с SL'}
      </div>
    {/if}
  </div>

  <!-- Open positions -->
  <div class="hud-card">
    <div class="hud-label">Позиций открыто</div>
    <div class="hud-value state-{openState}">
      {openTrades.length}{maxOpen ? ` / ${maxOpen}` : ''}
    </div>
    {#if maxOpen > 0}
      <div class="hud-bar">
        <div
          class="hud-bar-fill state-{openState}"
          style="width: {pct(openTrades.length, maxOpen)}%"
        ></div>
      </div>
    {:else}
      <div class="hud-sub muted">лимит не задан</div>
    {/if}
  </div>

  <!-- Streak -->
  <div class="hud-card">
    <div class="hud-label">Серия</div>
    <div class="hud-value state-{streakState}">
      {#if streak.kind === 'none'}
        —
      {:else if streak.kind === 'win'}
        +{streak.length} <span class="muted">побед</span>
      {:else}
        −{streak.length} <span class="muted">убытков</span>
      {/if}
    </div>
    <div class="hud-sub muted">
      {#if maxStreak > 0 && streak.kind === 'loss'}
        стоп при {maxStreak}
      {:else}
        {formatNumber(streak.sum, 2)} {ccy}
      {/if}
    </div>
  </div>

  <!-- Goals D/W/M -->
  <div class="hud-card">
    <div class="hud-label">Цель день</div>
    <div class="hud-value {dailyPnL >= goalDayAmount && goalDayAmount > 0 ? 'profit' : ''}">
      {formatNumber(dailyPnL, 0)} / {formatNumber(goalDayAmount, 0)}
    </div>
    {#if goalDayAmount > 0}
      <div class="hud-bar">
        <div
          class="hud-bar-fill profit"
          style="width: {pct(Math.max(0, dailyPnL), goalDayAmount)}%"
        ></div>
      </div>
      <div class="hud-sub muted">
        нед {formatNumber(weeklyPnL, 0)}/{formatNumber(goalWeekAmount, 0)} ·
        мес {formatNumber(monthlyPnL, 0)}/{formatNumber(goalMonthAmount, 0)}
      </div>
    {:else}
      <div class="hud-sub muted">цели не заданы</div>
    {/if}
  </div>

  <!-- Discipline -->
  <div class="hud-card">
    <div class="hud-label">Дисциплина</div>
    <div class="hud-value state-{disciplineState}">
      {formatNumber(discipline.score, 1)}%
    </div>
    <div class="hud-sub muted">
      {discipline.violationsCount > 0
        ? `${discipline.violationsCount} наруш. в ${discipline.total - discipline.clean} сделках`
        : `${discipline.total} сделок без нарушений`}
    </div>
  </div>
</section>

<style>
  .hud {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
    padding: 10px;
    margin: 10px 0;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .hud-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    min-width: 0;
  }
  .hud-label {
    font-size: 10.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--text-muted);
  }
  .hud-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hud-sub {
    font-size: 11px;
    color: var(--text);
    line-height: 1.3;
  }
  .muted { color: var(--text-muted); }
  .warn  { color: var(--warning); }

  .hud-bar {
    height: 4px;
    background: var(--bg-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .hud-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 240ms ease;
  }

  .hud-value.profit, .hud-bar-fill.profit { color: var(--profit); }
  .hud-bar-fill.profit { background: var(--profit); }
  .hud-value.loss { color: var(--loss); }

  .state-ok      { color: var(--profit); }
  .state-warn    { color: var(--warning); }
  .state-danger  { color: var(--loss); }
  .state-loss    { color: var(--loss); }
  .hud-bar-fill.state-ok     { background: var(--profit); }
  .hud-bar-fill.state-warn   { background: var(--warning); }
  .hud-bar-fill.state-danger { background: var(--loss); }
  .hud-bar-fill.state-loss   { background: var(--loss); }
  .state-neutral, .hud-bar-fill.state-neutral { color: inherit; background: var(--accent); }
</style>
