<script>
  import { formatNumber } from '../lib/utils';

  /** Цели D/W/M/Y — тот же shape, что formData в ProfileModal. */
  export let formData = {};

  /** Сводка: баланс, лимиты, цели, дисциплина (считается в ProfileModal). */
  export let currentBalance = 0;
  export let maxRiskAmount = 0;
  export let maxDailyLossAmount = 0;
  export let goalMonthAmount = 0;
  export let goalYearAmount = 0;
  /** Сводка дисциплины (объект из getDisciplineScore в ProfileModal). */
  export let discipline = /** @type {Record<string, number>} */ ({
    score: 0,
    violationsCount: 0,
    total: 0,
    clean: 0,
    blockViolationItems: 0,
    warnViolationItems: 0
  });
  export let pnlGap = 0;
</script>

<div class="profile-goals-tab">
  <div class="profile-summary-grid profile-summary-grid--stretch">
    <div class="profile-metric">
      <div class="profile-metric-label">Текущий баланс</div>
      <div
        class="profile-metric-value {currentBalance >= Number(formData.initialCapital || 0) ? 'profit' : 'loss'}"
      >
        {formatNumber(currentBalance, 2)} {formData.accountCurrency || 'USD'}
      </div>
    </div>
    <div class="profile-metric">
      <div class="profile-metric-label">Риск на сделку</div>
      <div class="profile-metric-value">
        {formatNumber(maxRiskAmount, 2)} {formData.accountCurrency || 'USD'}
      </div>
    </div>
    <div class="profile-metric">
      <div class="profile-metric-label">Дневной лимит убытка</div>
      <div class="profile-metric-value">
        {formatNumber(maxDailyLossAmount, 2)} {formData.accountCurrency || 'USD'}
      </div>
    </div>
    <div class="profile-metric">
      <div class="profile-metric-label">Цель на месяц</div>
      <div class="profile-metric-value">
        {formatNumber(goalMonthAmount, 2)} {formData.accountCurrency || 'USD'}
      </div>
    </div>
    <div class="profile-metric">
      <div class="profile-metric-label">Цель на год</div>
      <div class="profile-metric-value">
        {formatNumber(goalYearAmount, 2)} {formData.accountCurrency || 'USD'}
      </div>
    </div>
    <div class="profile-metric">
      <div class="profile-metric-label">Дисциплина</div>
      <div
        class="profile-metric-value {discipline.score >= 95
          ? 'profit'
          : discipline.score >= 80
            ? ''
            : 'loss'}"
      >
        {formatNumber(discipline.score, 1)}%
      </div>
      <div class="profile-metric-sub">
        {#if discipline.violationsCount > 0}
          {discipline.violationsCount} записей в {discipline.total - discipline.clean} сделках
          {#if discipline.blockViolationItems > 0 || discipline.warnViolationItems > 0}
            · block {discipline.blockViolationItems} / warn {discipline.warnViolationItems}
          {/if}
          {#if pnlGap !== 0}
            · разрыв PnL <span class={pnlGap >= 0 ? 'loss' : 'profit'}>{formatNumber(pnlGap, 2)}</span>
          {/if}
        {:else}
          {discipline.total} сделок без нарушений
        {/if}
      </div>
    </div>
  </div>

  <p class="profile-goals-lede">
    Числовые ориентиры в валюте счёта или в % от капитала. Связаны с HUD и напоминанием «закрой день при цели» —
    <strong>его переключатель в карточке правил</strong> на вкладке «Правила и ограничения».
  </p>

  <div class="profile-section">
    <div class="profile-section-title">Торговые цели</div>
    <div class="form-group">
      <label for="goals-goal-mode">Формат целей</label>
      <select id="goals-goal-mode" bind:value={formData.goalMode}>
        <option value="percent">В процентах</option>
        <option value="amount">В сумме</option>
      </select>
    </div>
    <div class="goal-grid">
      <div class="form-group goal-day-block">
        <label for="goals-goal-day">Цель на день</label>
        <div class="goal-day-input-row">
          <input
            id="goals-goal-day"
            type="number"
            min="0"
            step="0.1"
            bind:value={formData.goalDayValue}
            placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'}
          />
        </div>
      </div>
      <div class="form-group">
        <label for="goals-goal-week">Цель на неделю</label>
        <input
          id="goals-goal-week"
          type="number"
          min="0"
          step="0.1"
          bind:value={formData.goalWeekValue}
          placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'}
        />
      </div>
      <div class="form-group">
        <label for="goals-goal-month">Цель на месяц</label>
        <input
          id="goals-goal-month"
          type="number"
          min="0"
          step="0.1"
          bind:value={formData.goalMonthValue}
          placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'}
        />
      </div>
      <div class="form-group">
        <label for="goals-goal-year">Цель на год</label>
        <input
          id="goals-goal-year"
          type="number"
          min="0"
          step="0.1"
          bind:value={formData.goalYearValue}
          placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'}
        />
      </div>
    </div>
    <p class="profile-goals-foot-hint">Модалка при достижении дневной цели настраивается отдельно — см. вкладку с правилами.</p>
  </div>
</div>

<style>
  .profile-goals-tab {
    padding-bottom: 12px;
  }
  .profile-goals-tab .profile-summary-grid {
    margin-bottom: 16px;
  }
  .profile-goals-lede {
    margin: 0 0 16px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
    background: color-mix(in srgb, var(--accent) 6%, var(--bg-2));
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text);
  }
  .profile-goals-foot-hint {
    margin: 12px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .goal-day-block .goal-day-input-row {
    margin-bottom: 8px;
  }
</style>
