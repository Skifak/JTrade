<script>
  import { DEFAULT_STREAK_SCALING_MULTIPLIERS } from '../lib/streakScaling.js';

  /** Поля профиля, прикреплённые к карточке правила по её `id` из profileRulesRegistry. */
  export let ruleId = '';
  export let formData = {};

  function ensureStreakMultipliers() {
    if (!Array.isArray(formData.streakScalingMultipliers) || formData.streakScalingMultipliers.length === 0) {
      formData.streakScalingMultipliers = [...DEFAULT_STREAK_SCALING_MULTIPLIERS];
    }
  }

  function addStreakStep() {
    ensureStreakMultipliers();
    const arr = formData.streakScalingMultipliers;
    const last = Number(arr[arr.length - 1]);
    const base = Number.isFinite(last) && last > 0 ? last : 0.5;
    const next = Math.max(0.01, Math.min(1, Math.round(base * 0.5 * 10_000) / 10_000));
    formData.streakScalingMultipliers = [...arr, next];
  }

  function removeStreakStep() {
    ensureStreakMultipliers();
    if (formData.streakScalingMultipliers.length <= 1) return;
    formData.streakScalingMultipliers = formData.streakScalingMultipliers.slice(0, -1);
  }

  $: if (ruleId === 'anti-martingale' && formData?.streakScalingEnabled) {
    if (!Array.isArray(formData.streakScalingMultipliers) || formData.streakScalingMultipliers.length === 0) {
      formData.streakScalingMultipliers = [...DEFAULT_STREAK_SCALING_MULTIPLIERS];
    }
  }

  const FIELD_RULE_IDS = new Set([
    'risk-per-trade',
    'exposure-budget',
    'daily-stop',
    'max-open',
    'max-trades-day',
    'loss-streak-stop',
    'cooldown',
    'notes-checklist',
    'anti-martingale',
    'goal-day-popup',
    'journal-day-reminder',
    'post-close-chart',
    'weekly-loss-stop',
    'daily-profit-lock',
    'after-hours-cutoff',
    'min-trade-interval',
    'rr-min-block'
  ]);

  $: showFields = FIELD_RULE_IDS.has(ruleId);
</script>

{#if showFields}
  <div class="profile-rule-card-fields">
    {#if ruleId === 'risk-per-trade'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-risk-mode">Риск на сделку</label>
          <div class="value-mode-row">
            <select id="pcf-risk-mode" class="pr-control" bind:value={formData.riskMode}>
              <option value="percent">В процентах</option>
              <option value="amount">Фикс. сумма</option>
            </select>
            {#if formData.riskMode === 'amount'}
              <input class="pr-control" type="number" min="0" step="1" bind:value={formData.riskPerTradeAmount} placeholder={`Сумма (${formData.accountCurrency})`} />
            {:else}
              <input id="pcf-risk-pct" class="pr-control" type="number" min="0" max="100" step="0.1" bind:value={formData.riskPerTradePercent} placeholder="% от капитала" />
            {/if}
          </div>
        </div>
      </div>
    {:else if ruleId === 'exposure-budget'}
      <p class="pr-card-hint">
        Σ-риск считается из лимита на одну сделку и числа открытых позиций — задай их в карточках «Риск на сделку» и «Максимум открытых позиций».
      </p>
    {:else if ruleId === 'daily-stop'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-daily-loss-mode">Дневной лимит убытка</label>
          <div class="value-mode-row">
            <select id="pcf-daily-loss-mode" class="pr-control" bind:value={formData.dailyLossLimitMode}>
              <option value="percent">В процентах</option>
              <option value="amount">Фикс. сумма</option>
            </select>
            {#if formData.dailyLossLimitMode === 'amount'}
              <input
                id="pcf-daily-loss-amt"
                class="pr-control"
                type="number"
                min="0"
                step="1"
                bind:value={formData.dailyLossLimitAmount}
                placeholder={`Сумма (${formData.accountCurrency})`}
              />
            {:else}
              <input id="pcf-daily-loss-pct" class="pr-control" type="number" min="0" max="100" step="0.1" bind:value={formData.dailyLossLimitPercent} placeholder="% от капитала" />
            {/if}
          </div>
        </div>
      </div>
    {:else if ruleId === 'max-open'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-max-open">Макс. открытых позиций</label>
          <input id="pcf-max-open" class="pr-control pr-control--narrow" type="number" min="1" step="1" bind:value={formData.maxOpenTrades} />
        </div>
      </div>
    {:else if ruleId === 'max-trades-day'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-max-day">
            Макс. закрытых за день <span class="pr-hint">0 — без лимита</span>
          </label>
          <input id="pcf-max-day" class="pr-control pr-control--narrow" type="number" min="0" step="1" bind:value={formData.maxTradesPerDay} />
        </div>
      </div>
    {:else if ruleId === 'loss-streak-stop'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-streak">Макс. убыточных подряд</label>
          <input id="pcf-streak" class="pr-control pr-control--narrow" type="number" min="1" step="1" bind:value={formData.maxConsecutiveLosses} />
        </div>
      </div>
    {:else if ruleId === 'cooldown'}
      <div class="form-row">
        <div class="form-group">
          <label class="pr-label" for="pcf-cooldown">
            Cooldown после убытка (мин) <span class="pr-hint">0 — выкл</span>
          </label>
          <input id="pcf-cooldown" class="pr-control pr-control--narrow" type="number" min="0" max="240" step="1" bind:value={formData.cooldownAfterLossMin} />
        </div>
      </div>
    {:else if ruleId === 'notes-checklist'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.profileNotesChecklistEnabled} />
        <span>Требовать галочки по строкам заметок в форме сделки</span>
      </label>
    {:else if ruleId === 'anti-martingale'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.streakScalingEnabled} />
        <span>Включить урезание лимита риска после серии убытков (сетка множителей)</span>
      </label>
      <div class="pr-streak-panel">
        <div class="form-row pr-row-tight">
          <div class="form-group">
            <label class="pr-label" for="pcf-streak-from">С какого убытка подряд</label>
            <input
              id="pcf-streak-from"
              class="pr-control pr-control--narrow"
              type="number"
              min="1"
              max="99"
              step="1"
              bind:value={formData.streakScalingApplyFromLossCount}
              disabled={!formData.streakScalingEnabled}
            />
            <p class="pr-field-hint">1 — с первого убытка; 2 — как раньше (первый «полный» шанс без штрафа).</p>
          </div>
        </div>
        <p class="pr-label pr-label--row">Множители по шагам</p>
        <ul class="pr-streak-grid" aria-label="Сетка anti-martingale">
          {#each formData.streakScalingMultipliers ?? [] as mult, i (i)}
            <li class="pr-streak-row">
              <span class="pr-streak-row-label">
                {Number(formData.streakScalingApplyFromLossCount) >= 1
                  ? Math.floor(Number(formData.streakScalingApplyFromLossCount)) + i
                  : 2 + i} уб.
              </span>
              <input
                class="pr-control pr-streak-mult-input"
                type="number"
                min="0.01"
                max="1"
                step="0.05"
                bind:value={formData.streakScalingMultipliers[i]}
                disabled={!formData.streakScalingEnabled}
              />
            </li>
          {/each}
        </ul>
        <div class="pr-streak-actions">
          <button type="button" class="btn btn-sm btn-primary" disabled={!formData.streakScalingEnabled} on:click={addStreakStep}>
            + шаг
          </button>
          <button type="button" class="btn btn-sm" disabled={!formData.streakScalingEnabled || (formData.streakScalingMultipliers?.length || 0) <= 1} on:click={removeStreakStep}>
            − шаг
          </button>
        </div>
      </div>
      <p class="pr-card-hint">Влияет на лимит риска и бюджет экспозиции. Последний множитель не снимается при длинной серии.</p>
    {:else if ruleId === 'goal-day-popup'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.dailyReviewEnabled} />
        <span>Напоминание «закрой день при цели»</span>
      </label>
      <p class="pr-card-hint">Числовые цели D/W/M/Y — вкладка «Торговые цели» в профиле.</p>
    {:else if ruleId === 'journal-day-reminder'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.journalDayReminderEnabled} />
        <span>Включить напоминание</span>
      </label>
      <div class="form-row pr-row-tight">
        <div class="form-group">
          <label class="pr-label" for="pcf-jhour">Час локально (0–23)</label>
          <input
            id="pcf-jhour"
            class="pr-control pr-control--narrow"
            type="number"
            min="0"
            max="23"
            step="1"
            bind:value={formData.journalDayReminderHourLocal}
            disabled={!formData.journalDayReminderEnabled}
          />
        </div>
      </div>
    {:else if ruleId === 'post-close-chart'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.postCloseChartReminderEnabled} />
        <span>Скрин графика после закрытия</span>
      </label>
      <p class="pr-card-hint">
        После закрытия сделки — тост и баннер под шапкой с предложением прикрепить изображение. В форме редактирования закрытой сделки без фото — мягкое предупреждение гейта (можно подтвердить); после добавления скрина запись «без скрина» снимается с метрики дисциплины.
      </p>
    {:else if ruleId === 'weekly-loss-stop'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.weeklyLossLimitEnabled} />
        <span>Включить недельный лимит убытка</span>
      </label>
      <div class="value-mode-row">
        <select id="pcf-weekly-mode" class="pr-control" bind:value={formData.weeklyLossLimitMode} disabled={!formData.weeklyLossLimitEnabled}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.weeklyLossLimitMode === 'amount'}
          <input class="pr-control" type="number" min="0" step="1" bind:value={formData.weeklyLossLimitAmount} placeholder={`Сумма (${formData.accountCurrency})`} disabled={!formData.weeklyLossLimitEnabled} />
        {:else}
          <input class="pr-control" type="number" min="0" max="100" step="0.1" bind:value={formData.weeklyLossLimitPercent} placeholder="%" disabled={!formData.weeklyLossLimitEnabled} />
        {/if}
      </div>
    {:else if ruleId === 'daily-profit-lock'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.dailyProfitLockEnabled} />
        <span>Включить потолок дневной прибыли</span>
      </label>
      <div class="value-mode-row">
        <select id="pcf-pl-mode" class="pr-control" bind:value={formData.dailyProfitLockMode} disabled={!formData.dailyProfitLockEnabled}>
          <option value="percent">В процентах</option>
          <option value="amount">Фикс. сумма</option>
        </select>
        {#if formData.dailyProfitLockMode === 'amount'}
          <input class="pr-control" type="number" min="0" step="1" bind:value={formData.dailyProfitLockAmount} placeholder={`Сумма (${formData.accountCurrency})`} disabled={!formData.dailyProfitLockEnabled} />
        {:else}
          <input class="pr-control" type="number" min="0" max="100" step="0.1" bind:value={formData.dailyProfitLockPercent} placeholder="%" disabled={!formData.dailyProfitLockEnabled} />
        {/if}
      </div>
    {:else if ruleId === 'after-hours-cutoff'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.afterHoursCutoffEnabled} />
        <span>Не открывать новые сделки после локального часа</span>
      </label>
      <div class="form-row pr-row-tight">
        <div class="form-group">
          <label class="pr-label" for="pcf-after-h">Час (1–23)</label>
          <input
            id="pcf-after-h"
            class="pr-control pr-control--narrow"
            type="number"
            min="0"
            max="23"
            step="1"
            bind:value={formData.noNewTradesAfterHourLocal}
            disabled={!formData.afterHoursCutoffEnabled}
          />
        </div>
      </div>
    {:else if ruleId === 'min-trade-interval'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.minTradeIntervalEnabled} />
        <span>Включить паузу между сделками</span>
      </label>
      <div class="form-row pr-row-tight">
        <div class="form-group">
          <label class="pr-label" for="pcf-gap">Минут после последнего закрытия</label>
          <input
            id="pcf-gap"
            class="pr-control pr-control--narrow"
            type="number"
            min="0"
            max="1440"
            step="1"
            bind:value={formData.minMinutesBetweenTrades}
            disabled={!formData.minTradeIntervalEnabled}
          />
        </div>
      </div>
    {:else if ruleId === 'rr-min-block'}
      <label class="pr-check">
        <input type="checkbox" bind:checked={formData.minRiskRewardHardBlock} />
        <span>Жёсткий блок при R:R ниже порога (если заданы SL и TP)</span>
      </label>
      <div class="form-row pr-row-tight">
        <div class="form-group">
          <label class="pr-label" for="pcf-min-rr">Минимальный R:R</label>
          <input
            id="pcf-min-rr"
            class="pr-control pr-control--narrow"
            type="number"
            min="0"
            step="0.05"
            bind:value={formData.minRiskRewardRatio}
            disabled={!formData.minRiskRewardHardBlock}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .profile-rule-card-fields {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--accent) 12%, var(--border));
  }
  .pr-label {
    display: block;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 5px;
  }
  .pr-hint {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 10.5px;
  }
  .pr-control {
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
    background: var(--bg);
    color: var(--text);
    padding: 6px 8px;
    font-size: 12px;
    box-sizing: border-box;
  }
  .pr-control:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .pr-control:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .pr-control--narrow {
    max-width: 200px;
  }
  .pr-check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.35;
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }
  .pr-check input {
    margin: 2px 0 0;
    width: 15px;
    height: 15px;
    accent-color: var(--accent);
    flex-shrink: 0;
  }
  .pr-check span {
    flex: 1;
    min-width: 0;
  }
  .pr-card-hint {
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .pr-row-tight {
    margin-top: 4px;
  }
  .pr-label--row {
    margin-top: 10px;
    margin-bottom: 6px;
  }
  .pr-field-hint {
    margin: 6px 0 0;
    font-size: 10.5px;
    line-height: 1.35;
    color: var(--text-muted);
  }
  .pr-streak-panel {
    margin-top: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--border));
    background: color-mix(in srgb, var(--bg-2) 65%, var(--bg));
  }
  .pr-streak-grid {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pr-streak-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pr-streak-row-label {
    min-width: 4.25rem;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .pr-streak-mult-input {
    max-width: 7rem;
  }
  .pr-streak-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .profile-rule-card-fields :global(.form-row) {
    margin-bottom: 6px;
  }
  .profile-rule-card-fields :global(.form-row:last-child) {
    margin-bottom: 0;
  }
  .profile-rule-card-fields :global(.value-mode-row) {
    margin-top: 0;
  }
</style>
