<script>
  /** Тот же shape, что formData в ProfileModal */
  export let formData = {};
</script>

<div class="profile-section">
  <div class="profile-section-title">Риск и ограничения</div>
  <div class="form-row">
    <div class="form-group">
      <label for="rules-risk-mode">Риск на сделку</label>
      <div class="value-mode-row">
        <select id="rules-risk-mode" bind:value={formData.riskMode}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.riskMode === 'amount'}
          <input type="number" min="0" step="1" bind:value={formData.riskPerTradeAmount} placeholder={`Сумма (${formData.accountCurrency})`} />
        {:else}
          <input id="rules-risk-per-trade" type="number" min="0" max="100" step="0.1" bind:value={formData.riskPerTradePercent} placeholder="% от капитала" />
        {/if}
      </div>
    </div>
    <div class="form-group">
      <label for="rules-daily-loss-mode">Дневной лимит убытка</label>
      <div class="value-mode-row">
        <select id="rules-daily-loss-mode" bind:value={formData.dailyLossLimitMode}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.dailyLossLimitMode === 'amount'}
          <input type="number" min="0" step="1" bind:value={formData.dailyLossLimitAmount} placeholder={`Сумма (${formData.accountCurrency})`} />
        {:else}
          <input id="rules-daily-loss-limit" type="number" min="0" max="100" step="0.1" bind:value={formData.dailyLossLimitPercent} placeholder="% от капитала" />
        {/if}
      </div>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.weeklyLossLimitEnabled} />
        <span>Недельный лимит убытка (ISO-неделя)</span>
      </label>
      <div class="value-mode-row">
        <select id="rules-weekly-loss-mode" bind:value={formData.weeklyLossLimitMode} disabled={!formData.weeklyLossLimitEnabled}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.weeklyLossLimitMode === 'amount'}
          <input
            type="number"
            min="0"
            step="1"
            bind:value={formData.weeklyLossLimitAmount}
            placeholder={`Сумма (${formData.accountCurrency})`}
            disabled={!formData.weeklyLossLimitEnabled}
          />
        {:else}
          <input
            id="rules-weekly-loss-pct"
            type="number"
            min="0"
            max="100"
            step="0.1"
            bind:value={formData.weeklyLossLimitPercent}
            placeholder="% от капитала"
            disabled={!formData.weeklyLossLimitEnabled}
          />
        {/if}
      </div>
    </div>
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.dailyProfitLockEnabled} />
        <span>Потолок дневной прибыли (блок новых входов)</span>
      </label>
      <div class="value-mode-row">
        <select id="rules-daily-profit-lock-mode" bind:value={formData.dailyProfitLockMode} disabled={!formData.dailyProfitLockEnabled}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.dailyProfitLockMode === 'amount'}
          <input
            type="number"
            min="0"
            step="1"
            bind:value={formData.dailyProfitLockAmount}
            placeholder={`Сумма (${formData.accountCurrency})`}
            disabled={!formData.dailyProfitLockEnabled}
          />
        {:else}
          <input
            id="rules-daily-profit-lock-pct"
            type="number"
            min="0"
            max="100"
            step="0.1"
            bind:value={formData.dailyProfitLockPercent}
            placeholder="% от капитала"
            disabled={!formData.dailyProfitLockEnabled}
          />
        {/if}
      </div>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label for="rules-max-open-trades">Макс. открытых позиций</label>
      <input id="rules-max-open-trades" type="number" min="1" step="1" bind:value={formData.maxOpenTrades} />
    </div>
    <div class="form-group">
      <label for="rules-max-trades-per-day">
        Макс. сделок за день (закрытых)
        <span class="hint-inline">0 — без лимита</span>
      </label>
      <input id="rules-max-trades-per-day" type="number" min="0" step="1" bind:value={formData.maxTradesPerDay} />
    </div>
    <div class="form-group">
      <label for="rules-max-consecutive-losses">Макс. убыточных подряд</label>
      <input id="rules-max-consecutive-losses" type="number" min="1" step="1" bind:value={formData.maxConsecutiveLosses} />
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.afterHoursCutoffEnabled} />
        <span>Не открывать новые сделки после часа (локально)</span>
      </label>
      <div class="value-mode-row value-mode-row--narrow">
        <input
          id="rules-no-new-after-hour"
          type="number"
          min="0"
          max="23"
          step="1"
          bind:value={formData.noNewTradesAfterHourLocal}
          disabled={!formData.afterHoursCutoffEnabled}
          title="1–23: с этого часа; при выкл. чекбокса не действует"
        />
        <span class="rules-suffix-hint">час (1–23)</span>
      </div>
    </div>
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.minTradeIntervalEnabled} />
        <span>Мин. минут после последнего закрытия</span>
      </label>
      <div class="value-mode-row value-mode-row--narrow">
        <input
          id="rules-min-minutes-between"
          type="number"
          min="0"
          max="1440"
          step="1"
          bind:value={formData.minMinutesBetweenTrades}
          disabled={!formData.minTradeIntervalEnabled}
        />
      </div>
    </div>
  </div>
</div>

<div class="profile-section">
  <div class="profile-section-title">Поведенческие ограничения</div>
  <div class="form-row">
    <div class="form-group">
      <label for="rules-cooldown-after-loss">
        Cooldown после убытка (мин)
        <span class="hint-inline">0 — выкл</span>
      </label>
      <input id="rules-cooldown-after-loss" type="number" min="0" max="240" step="1" bind:value={formData.cooldownAfterLossMin} />
    </div>
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.streakScalingEnabled} />
        <span>Anti-martingale (после 2+ убытков подряд резать риск ×½)</span>
      </label>
      <p class="rules-checkbox-note">Влияет на лимит риска и бюджет экспозиции.</p>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.journalDayReminderEnabled} />
        <span>Напоминание заполнить дневник</span>
      </label>
      <div class="value-mode-row value-mode-row--narrow">
        <label for="rules-journal-reminder-hour" class="rules-inline-label">Час (локально, 0–23)</label>
        <input
          id="rules-journal-reminder-hour"
          type="number"
          min="0"
          max="23"
          step="1"
          bind:value={formData.journalDayReminderHourLocal}
          disabled={!formData.journalDayReminderEnabled}
        />
      </div>
    </div>
    <div class="form-group">
      <label class="checkbox-row rules-field-lead">
        <input type="checkbox" bind:checked={formData.minRiskRewardHardBlock} />
        <span>Жёсткий блок по минимальному R:R (если заданы SL и TP)</span>
      </label>
      <div class="value-mode-row value-mode-row--narrow">
        <label for="rules-min-rr" class="rules-inline-label">Мин. R:R</label>
        <input
          id="rules-min-rr"
          type="number"
          min="0"
          step="0.05"
          bind:value={formData.minRiskRewardRatio}
          disabled={!formData.minRiskRewardHardBlock}
        />
      </div>
    </div>
  </div>
</div>

<div class="profile-section">
  <div class="profile-section-title">Цели (Prop Plan)</div>
  <div class="form-group">
    <label for="rules-goal-mode">Формат целей</label>
    <select id="rules-goal-mode" bind:value={formData.goalMode}>
      <option value="percent">В процентах</option>
      <option value="amount">В сумме</option>
    </select>
  </div>
  <div class="goal-grid">
    <div class="form-group goal-day-block">
      <label for="rules-goal-day">Цель на день</label>
      <div class="goal-day-input-row">
        <input id="rules-goal-day" type="number" min="0" step="0.1" bind:value={formData.goalDayValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
      </div>
      <label class="checkbox-row rules-goal-reminder">
        <input type="checkbox" bind:checked={formData.dailyReviewEnabled} />
        <span>Напоминание «закрой день при цели»</span>
      </label>
    </div>
    <div class="form-group">
      <label for="rules-goal-week">Цель на неделю</label>
      <input id="rules-goal-week" type="number" min="0" step="0.1" bind:value={formData.goalWeekValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
    <div class="form-group">
      <label for="rules-goal-month">Цель на месяц</label>
      <input id="rules-goal-month" type="number" min="0" step="0.1" bind:value={formData.goalMonthValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
    <div class="form-group">
      <label for="rules-goal-year">Цель на год</label>
      <input id="rules-goal-year" type="number" min="0" step="0.1" bind:value={formData.goalYearValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
  </div>
</div>

<div class="form-group profile-notes-wrap">
  <label class="checkbox-row rules-field-lead">
    <input id="rules-profile-notes-checklist" type="checkbox" bind:checked={formData.profileNotesChecklistEnabled} />
    <span>Чек-лист из заметок в форме сделки</span>
  </label>
  <p class="rules-checkbox-note">Каждая непустая строка заметок (кроме #) — пункт, который нужно отметить перед сохранением.</p>
  <label for="rules-profile-notes">Заметки к профилю</label>
  <textarea id="rules-profile-notes" rows="3" bind:value={formData.notes} placeholder="Правила, ограничения, checklist перед входом"></textarea>
</div>

<style>
  .rules-field-lead {
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--text-strong);
  }
  .rules-checkbox-note {
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .value-mode-row--narrow {
    max-width: 280px;
    align-items: center;
    gap: 8px;
  }
  .rules-inline-label {
    font-size: 11.5px;
    color: var(--text-muted);
    margin: 0;
    white-space: nowrap;
  }
  .rules-suffix-hint {
    font-size: 11px;
    color: var(--text-muted);
  }
  .goal-day-block .goal-day-input-row {
    margin-bottom: 8px;
  }
  .rules-goal-reminder {
    margin: 0;
    font-weight: 500;
    font-size: 12px;
  }
</style>
