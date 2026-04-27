<script>
  import { createEventDispatcher } from 'svelte';
  import { userProfile } from '../lib/stores';
  import { formatNumber } from '../lib/utils';
  import { fxRate, formatAccountMoney, convertUsd } from '../lib/fxRate';
  import {
    computeGoalAmount,
    computeMaxRiskAmount,
    computeMaxDailyLossAmount,
    getPeriodPnL,
    getDailyPnL,
    countClosedTradesOnDay
  } from '../lib/risk';

  const dispatch = createEventDispatcher();

  export let closedTrades = [];

  function openProfile() {
    dispatch('openProfile');
  }

  $: goalDay = computeGoalAmount($userProfile, 'Day');
  $: goalWeek = computeGoalAmount($userProfile, 'Week');
  $: goalMonth = computeGoalAmount($userProfile, 'Month');
  $: goalYear = computeGoalAmount($userProfile, 'Year');

  $: pnlDayUsd = getDailyPnL(closedTrades);
  $: pnlWeekUsd = getPeriodPnL(closedTrades, 'week');
  $: pnlMonthUsd = getPeriodPnL(closedTrades, 'month');
  $: pnlYearUsd = getPeriodPnL(closedTrades, 'year');

  $: pnlDay = convertUsd(pnlDayUsd, $fxRate);
  $: pnlWeek = convertUsd(pnlWeekUsd, $fxRate);
  $: pnlMonth = convertUsd(pnlMonthUsd, $fxRate);
  $: pnlYear = convertUsd(pnlYearUsd, $fxRate);

  function pct(pnlAcc, goalAcc) {
    if (!goalAcc || goalAcc <= 0) return null;
    return Math.max(0, Math.min(100, (pnlAcc / goalAcc) * 100));
  }

  $: maxRisk = computeMaxRiskAmount($userProfile);
  $: maxDailyLoss = computeMaxDailyLossAmount($userProfile);
  $: dailyPnL = convertUsd(getDailyPnL(closedTrades), $fxRate);
  $: tradesToday = countClosedTradesOnDay(closedTrades);
  $: maxPerDay = Number($userProfile.maxTradesPerDay) || 0;

  function patchGoals(patch) {
    userProfile.updateProfile(patch);
  }
</script>

<div class="goals-page">
  <header class="goals-head">
    <h2 class="goals-title">Цели и лимиты</h2>
    <p class="goals-sub">
      Прогресс к целям из профиля. Числа ниже сразу пишутся в профиль (как в модалке).
      <button type="button" class="linkish" on:click={openProfile}>Полный профиль →</button>
    </p>
  </header>

  <section class="goals-card">
    <div class="goals-k">Прогресс к целям</div>
    <div class="bar-list">
      <div class="bar-row">
        <div class="bar-hd">
          <span>День</span>
          <span class="mono">{formatAccountMoney(pnlDay, $fxRate)} / {formatAccountMoney(goalDay, $fxRate)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill profit" style="width: {pct(pnlDay, goalDay) ?? 0}%"></div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-hd">
          <span>Неделя</span>
          <span class="mono">{formatAccountMoney(pnlWeek, $fxRate)} / {formatAccountMoney(goalWeek, $fxRate)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill profit" style="width: {pct(pnlWeek, goalWeek) ?? 0}%"></div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-hd">
          <span>Месяц</span>
          <span class="mono">{formatAccountMoney(pnlMonth, $fxRate)} / {formatAccountMoney(goalMonth, $fxRate)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill profit" style="width: {pct(pnlMonth, goalMonth) ?? 0}%"></div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-hd">
          <span>Год</span>
          <span class="mono">{formatAccountMoney(pnlYear, $fxRate)} / {formatAccountMoney(goalYear, $fxRate)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill profit" style="width: {pct(pnlYear, goalYear) ?? 0}%"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="goals-card">
    <div class="goals-k">Редактировать цели (быстро)</div>
    <div class="goals-form">
      <label>
        Формат
        <select
          value={$userProfile.goalMode}
          on:change={(e) => patchGoals({ goalMode: e.currentTarget.value })}
        >
          <option value="percent">% от капитала</option>
          <option value="amount">Сумма</option>
        </select>
      </label>
      <label>
        День
        <input
          type="number"
          min="0"
          step="0.1"
          value={$userProfile.goalDayValue}
          on:change={(e) => patchGoals({ goalDayValue: Number(e.currentTarget.value) || 0 })}
        />
      </label>
      <label>
        Неделя
        <input
          type="number"
          min="0"
          step="0.1"
          value={$userProfile.goalWeekValue}
          on:change={(e) => patchGoals({ goalWeekValue: Number(e.currentTarget.value) || 0 })}
        />
      </label>
      <label>
        Месяц
        <input
          type="number"
          min="0"
          step="0.1"
          value={$userProfile.goalMonthValue}
          on:change={(e) => patchGoals({ goalMonthValue: Number(e.currentTarget.value) || 0 })}
        />
      </label>
      <label>
        Год
        <input
          type="number"
          min="0"
          step="0.1"
          value={$userProfile.goalYearValue}
          on:change={(e) => patchGoals({ goalYearValue: Number(e.currentTarget.value) || 0 })}
        />
      </label>
    </div>
  </section>

  <section class="goals-card">
    <div class="goals-k">«Красные линии» (из профиля)</div>
    <div class="lim-grid">
      <div class="lim">
        <div class="lim-t">Риск на сделку</div>
        <div class="lim-v mono">{formatAccountMoney(maxRisk, $fxRate)}</div>
      </div>
      <div class="lim">
        <div class="lim-t">Дневной лимит убытка</div>
        <div class="lim-v mono">{formatAccountMoney(maxDailyLoss, $fxRate)}</div>
        <div class="lim-s">
          Сегодня P/L:
          <span class:danger={dailyPnL <= -maxDailyLoss && maxDailyLoss > 0} class="mono">
            {formatAccountMoney(dailyPnL, $fxRate)}
          </span>
        </div>
      </div>
      <div class="lim">
        <div class="lim-t">Макс. сделок за сегодня</div>
        <input
          class="lim-input"
          type="number"
          min="0"
          step="1"
          title="0 — без лимита"
          value={maxPerDay}
          on:change={(e) => patchGoals({ maxTradesPerDay: Number(e.currentTarget.value) || 0 })}
        />
        <div class="lim-s">
          Закрыто сегодня: <strong>{tradesToday}</strong>
          {#if maxPerDay > 0}
            / {maxPerDay}
            {#if tradesToday >= maxPerDay}
              <span class="danger">лимит</span>
            {/if}
          {/if}
        </div>
      </div>
      <div class="lim">
        <div class="lim-t">Макс. открытых / убытков подряд</div>
        <div class="lim-v">
          {formatNumber($userProfile.maxOpenTrades, 0)} / {formatNumber($userProfile.maxConsecutiveLosses, 0)}
        </div>
        <button type="button" class="btn btn-sm" on:click={openProfile}>Править лимиты</button>
      </div>
    </div>
  </section>
</div>

<style>
  .goals-page {
    padding: 12px 20px 28px;
    max-width: 720px;
  }
  .goals-head {
    margin-bottom: 14px;
  }
  .goals-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  .goals-sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .linkish {
    border: none;
    background: none;
    padding: 0;
    margin-left: 6px;
    font: inherit;
    font-size: 13px;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .goals-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .goals-k {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  .bar-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bar-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bar-hd {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--text);
  }
  .bar-track {
    height: 8px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.2s ease;
  }
  .bar-fill.profit {
    background: var(--profit);
  }
  .goals-form {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px 12px;
  }
  .goals-form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .goals-form select,
  .goals-form input {
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .lim-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .lim-t {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .lim-v {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-strong);
  }
  .lim-s {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .lim-input {
    width: 100%;
    max-width: 120px;
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .danger {
    color: var(--loss);
    font-weight: 700;
  }
</style>
