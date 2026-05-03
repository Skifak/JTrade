<script>
  import { trades, userProfile } from '../lib/stores';
  import { activeJournalAccount, activeJournalAccountId } from '../lib/accounts';
  import { get } from 'svelte/store';
  import { convertAmount, formatNumber, getConversionQuote } from '../lib/utils';
  import { getDisciplineScore, getDisciplinedPnL } from '../lib/risk';
  import Modal from './Modal.svelte';
  import ProfileAccountsTab from './ProfileAccountsTab.svelte';

  export let open = false;
  export let closedTrades = [];

  /** Счёт из импорта — блок «Основное» не показываем. */
  $: hideBasicsSection = $activeJournalAccount?.createdFrom === 'import';
  /** Только старый single-storage Legacy может менять валюту здесь; clean — только при создании счёта. */
  $: currencySelectableInProfile = $activeJournalAccount?.createdFrom === 'legacy';

  $: discipline = getDisciplineScore($trades);
  $: disciplinedPnL = getDisciplinedPnL(closedTrades);
  $: totalClosedPnLRaw = closedTrades.reduce((s, t) => s + (Number(t.profit) || 0), 0);
  $: pnlGap = totalClosedPnLRaw - disciplinedPnL;

  let formData = {
    traderName: '',
    accountCurrency: 'USD',
    initialCapital: 10000,
    riskMode: 'percent',
    riskPerTradePercent: 1,
    riskPerTradeAmount: 100,
    dailyLossLimitMode: 'percent',
    dailyLossLimitPercent: 3,
    dailyLossLimitAmount: 300,
    goalMode: 'percent',
    goalDayValue: 1,
    goalWeekValue: 2,
    goalMonthValue: 5,
    goalYearValue: 20,
    maxOpenTrades: 3,
    maxTradesPerDay: 0,
    maxConsecutiveLosses: 3,
    commissionPerLot: 0,
    notes: '',
    cooldownAfterLossMin: 0,
    streakScalingEnabled: false,
    dailyReviewEnabled: true,
    journalDayReminderEnabled: true,
    journalDayReminderHourLocal: 21
  };
  let wasOpen = false;
  /** id счёта, под который синхронизирован formData — защита от записи профиля A в ключ счёта B */
  let lastProfileAccountId = '';
  /** setup — форма профиля текущего счёта; create — мастер нового счёта */
  let profileTab = 'setup';
  let previousCurrency = 'USD';
  let pnlConversionRate = 1;
  let conversionSource = 'identity';
  let isConvertingCurrency = false;
  let fxMessage = '';

  $: if (open) {
    const aid = String($activeJournalAccountId || '').trim();
    if (!wasOpen) {
      profileTab = 'setup';
      formData = { ...$userProfile };
      previousCurrency = formData.accountCurrency || 'USD';
      wasOpen = true;
      lastProfileAccountId = aid;
      refreshPnlConversionRate(previousCurrency);
    } else if (aid && aid !== lastProfileAccountId) {
      lastProfileAccountId = aid;
      formData = { ...$userProfile };
      previousCurrency = formData.accountCurrency || 'USD';
      fxMessage = '';
      pnlConversionRate = 1;
      refreshPnlConversionRate(previousCurrency);
    }
  } else if (wasOpen) {
    wasOpen = false;
    lastProfileAccountId = '';
    fxMessage = '';
    pnlConversionRate = 1;
  }

  $: totalClosedPnL = closedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
  $: convertedClosedPnL = convertAmount(totalClosedPnL, pnlConversionRate, 2);
  $: currentBalance = Number(formData.initialCapital || 0) + convertedClosedPnL;
  $: maxRiskAmount = formData.riskMode === 'amount'
    ? Number(formData.riskPerTradeAmount || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.riskPerTradePercent || 0)) / 100;
  $: maxDailyLossAmount = formData.dailyLossLimitMode === 'amount'
    ? Number(formData.dailyLossLimitAmount || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.dailyLossLimitPercent || 0)) / 100;
  $: goalDayAmount = formData.goalMode === 'amount'
    ? Number(formData.goalDayValue || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.goalDayValue || 0)) / 100;
  $: goalWeekAmount = formData.goalMode === 'amount'
    ? Number(formData.goalWeekValue || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.goalWeekValue || 0)) / 100;
  $: goalMonthAmount = formData.goalMode === 'amount'
    ? Number(formData.goalMonthValue || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.goalMonthValue || 0)) / 100;
  $: goalYearAmount = formData.goalMode === 'amount'
    ? Number(formData.goalYearValue || 0)
    : (Number(formData.initialCapital || 0) * Number(formData.goalYearValue || 0)) / 100;

  function closeModal() {
    open = false;
  }

  /** После создания счёта и записи профиля из мастера — подтянуть форму «Настройка счёта». */
  function syncFormAfterAccountMutation() {
    if (!open) return;
    formData = { ...get(userProfile) };
    previousCurrency = formData.accountCurrency || 'USD';
    lastProfileAccountId = String(get(activeJournalAccountId) || '').trim();
    fxMessage = '';
    pnlConversionRate = 1;
    refreshPnlConversionRate(previousCurrency);
  }

  function saveProfile() {
    const aid = String(get(activeJournalAccountId) || '').trim();
    if (aid !== lastProfileAccountId) {
      lastProfileAccountId = aid;
      formData = { ...get(userProfile) };
      previousCurrency = formData.accountCurrency || 'USD';
    }
    userProfile.updateProfile({
      ...formData,
      initialCapital: Number(formData.initialCapital) || 0,
      riskPerTradeAmount: Number(formData.riskPerTradeAmount) || 0,
      riskPerTradePercent: Number(formData.riskPerTradePercent) || 0,
      dailyLossLimitAmount: Number(formData.dailyLossLimitAmount) || 0,
      dailyLossLimitPercent: Number(formData.dailyLossLimitPercent) || 0,
      goalDayValue: Number(formData.goalDayValue) || 0,
      goalWeekValue: Number(formData.goalWeekValue) || 0,
      goalMonthValue: Number(formData.goalMonthValue) || 0,
      goalYearValue: Number(formData.goalYearValue) || 0,
      maxOpenTrades: Number(formData.maxOpenTrades) || 0,
      maxTradesPerDay: Math.max(0, Number(formData.maxTradesPerDay) || 0),
      maxConsecutiveLosses: Number(formData.maxConsecutiveLosses) || 0,
      commissionPerLot: Number(formData.commissionPerLot) || 0,
      cooldownAfterLossMin: Number(formData.cooldownAfterLossMin) || 0,
      streakScalingEnabled: !!formData.streakScalingEnabled,
      dailyReviewEnabled: !!formData.dailyReviewEnabled,
      journalDayReminderEnabled: !!formData.journalDayReminderEnabled,
      journalDayReminderHourLocal: (() => {
        const h = Number(formData.journalDayReminderHourLocal);
        const x = Number.isFinite(h) ? Math.floor(h) : 21;
        return Math.max(0, Math.min(23, x));
      })()
    });
    closeModal();
  }

  async function refreshPnlConversionRate(targetCurrency) {
    const quote = await getConversionQuote('USD', targetCurrency);
    if (quote?.rate) {
      pnlConversionRate = quote.rate;
      conversionSource = quote.source;
      return;
    }

    pnlConversionRate = 1;
    conversionSource = 'unavailable';
    fxMessage = `Не удалось получить live-курс USD/${targetCurrency}. Проверь сеть/API и повтори.`;
  }

  async function handleCurrencyChange(event) {
    const nextCurrency = event.currentTarget.value;
    if (!nextCurrency || nextCurrency === previousCurrency) return;

    isConvertingCurrency = true;
    fxMessage = '';

    const fromCurrency = previousCurrency;
    const quote = await getConversionQuote(fromCurrency, nextCurrency);
    if (!quote?.rate) {
      formData.accountCurrency = previousCurrency;
      fxMessage = `Курс ${previousCurrency}/${nextCurrency} недоступен, валюта не изменена.`;
      isConvertingCurrency = false;
      return;
    }
    const rate = quote.rate;

    formData = {
      ...formData,
      accountCurrency: nextCurrency,
      initialCapital: convertAmount(formData.initialCapital, rate, 2),
      riskPerTradeAmount: convertAmount(formData.riskPerTradeAmount, rate, 2),
      dailyLossLimitAmount: convertAmount(formData.dailyLossLimitAmount, rate, 2),
      goalDayValue: formData.goalMode === 'amount' ? convertAmount(formData.goalDayValue, rate, 2) : formData.goalDayValue,
      goalWeekValue: formData.goalMode === 'amount' ? convertAmount(formData.goalWeekValue, rate, 2) : formData.goalWeekValue,
      goalMonthValue: formData.goalMode === 'amount' ? convertAmount(formData.goalMonthValue, rate, 2) : formData.goalMonthValue,
      goalYearValue: formData.goalMode === 'amount' ? convertAmount(formData.goalYearValue, rate, 2) : formData.goalYearValue,
      commissionPerLot: convertAmount(formData.commissionPerLot, rate, 4)
    };
    previousCurrency = nextCurrency;
    await refreshPnlConversionRate(nextCurrency);
    fxMessage = `Конвертация выполнена по курсу ${formatNumber(rate, 6)} (${fromCurrency}/${nextCurrency}, ${quote.source}).`;
    isConvertingCurrency = false;
  }
</script>

<Modal {open} modalClass="profile-modal" on:close={closeModal}>
  <div slot="header">
    <h2>Профиль трейдера</h2>
  </div>

  <div slot="body">
    <div class="profile-modal-body">
      <div class="profile-modal-tabs" role="tablist" aria-label="Разделы профиля">
        <button
          type="button"
          role="tab"
          class="profile-modal-tab"
          class:active={profileTab === 'setup'}
          aria-selected={profileTab === 'setup'}
          on:click={() => (profileTab = 'setup')}
        >
          Настройка счёта
        </button>
        <button
          type="button"
          role="tab"
          class="profile-modal-tab"
          class:active={profileTab === 'create'}
          aria-selected={profileTab === 'create'}
          on:click={() => (profileTab = 'create')}
        >
          Создание счёта
        </button>
      </div>

      {#if profileTab === 'setup'}
        <ProfileAccountsTab
          variant="full"
          profileSplit="account"
          on:account-profile-seeded={syncFormAfterAccountMutation}
        />

        <div class="profile-summary-grid profile-summary-grid--stretch">
      <div class="profile-metric">
        <div class="profile-metric-label">Текущий баланс</div>
        <div class="profile-metric-value {currentBalance >= Number(formData.initialCapital || 0) ? 'profit' : 'loss'}">
          {formatNumber(currentBalance, 2)} {formData.accountCurrency}
        </div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Риск на сделку</div>
        <div class="profile-metric-value">{formatNumber(maxRiskAmount, 2)} {formData.accountCurrency}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Дневной лимит убытка</div>
        <div class="profile-metric-value">{formatNumber(maxDailyLossAmount, 2)} {formData.accountCurrency}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Цель на месяц</div>
        <div class="profile-metric-value">{formatNumber(goalMonthAmount, 2)} {formData.accountCurrency}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Цель на год</div>
        <div class="profile-metric-value">{formatNumber(goalYearAmount, 2)} {formData.accountCurrency}</div>
      </div>
      <div class="profile-metric">
        <div class="profile-metric-label">Дисциплина</div>
        <div class="profile-metric-value {discipline.score >= 95 ? 'profit' : discipline.score >= 80 ? '' : 'loss'}">
          {formatNumber(discipline.score, 1)}%
        </div>
        <div class="profile-metric-sub">
          {#if discipline.violationsCount > 0}
            {discipline.violationsCount} нарушений в {discipline.total - discipline.clean} сделках
            {#if pnlGap !== 0}
              · разрыв PnL <span class={pnlGap >= 0 ? 'loss' : 'profit'}>{formatNumber(pnlGap, 2)}</span>
            {/if}
          {:else}
            {discipline.total} сделок без нарушений
          {/if}
        </div>
      </div>
    </div>

    {#if !hideBasicsSection}
      <div class="profile-section profile-section--basics">
        <div class="profile-section-title">Основное</div>
        <div class="form-row">
          <div class="form-group">
            <label for="trader-name">Имя</label>
            <input id="trader-name" type="text" bind:value={formData.traderName} placeholder="Например, Alex" />
          </div>
          <div class="form-group">
            <label for="account-currency">Валюта счёта</label>
            {#if currencySelectableInProfile}
              <select
                id="account-currency"
                bind:value={formData.accountCurrency}
                on:change={handleCurrencyChange}
                disabled={isConvertingCurrency}
              >
                <optgroup label="Фиат">
                  <option value="USD">USD — Доллар США</option>
                  <option value="EUR">EUR — Евро</option>
                  <option value="GBP">GBP — Фунт</option>
                  <option value="JPY">JPY — Иена</option>
                  <option value="CHF">CHF — Франк</option>
                  <option value="CAD">CAD — Канадский $</option>
                  <option value="AUD">AUD — Австралийский $</option>
                  <option value="NZD">NZD — Новозеландский $</option>
                </optgroup>
                <optgroup label="Стейблкоины">
                  <option value="USDT">USDT</option>
                </optgroup>
                <optgroup label="Крипта">
                  <option value="BTC">BTC — Биткоин</option>
                </optgroup>
              </select>
            {:else}
              <div id="account-currency" class="currency-readonly" title="Задаётся при создании счёта">
                {formData.accountCurrency || 'USD'}
              </div>
              <span class="field-note">Фиксируется в мастере создания счёта</span>
            {/if}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="initial-capital">Размер капитала</label>
            <input id="initial-capital" type="number" min="0" step="10" bind:value={formData.initialCapital} />
          </div>
          <div class="form-group">
            <label for="commission-per-lot">Комиссия за 1 лот</label>
            <input id="commission-per-lot" type="number" min="0" step="0.01" bind:value={formData.commissionPerLot} />
          </div>
        </div>
      </div>
    {/if}

    <div class="profile-section">
      <div class="profile-section-title">Риск и ограничения</div>
      <div class="form-row">
        <div class="form-group">
          <label for="risk-mode">Риск на сделку</label>
          <div class="value-mode-row">
            <select id="risk-mode" bind:value={formData.riskMode}>
              <option value="percent">В процентах</option>
              <option value="amount">Фикс. сумма</option>
            </select>
            {#if formData.riskMode === 'amount'}
              <input type="number" min="0" step="1" bind:value={formData.riskPerTradeAmount} placeholder={`Сумма (${formData.accountCurrency})`} />
            {:else}
              <input id="risk-per-trade" type="number" min="0" max="100" step="0.1" bind:value={formData.riskPerTradePercent} placeholder="% от капитала" />
            {/if}
          </div>
        </div>
        <div class="form-group">
          <label for="daily-loss-mode">Дневной лимит убытка</label>
          <div class="value-mode-row">
            <select id="daily-loss-mode" bind:value={formData.dailyLossLimitMode}>
              <option value="percent">В процентах</option>
              <option value="amount">Фикс. сумма</option>
            </select>
            {#if formData.dailyLossLimitMode === 'amount'}
              <input type="number" min="0" step="1" bind:value={formData.dailyLossLimitAmount} placeholder={`Сумма (${formData.accountCurrency})`} />
            {:else}
              <input id="daily-loss-limit" type="number" min="0" max="100" step="0.1" bind:value={formData.dailyLossLimitPercent} placeholder="% от капитала" />
            {/if}
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="max-open-trades">Макс. открытых позиций</label>
          <input id="max-open-trades" type="number" min="1" step="1" bind:value={formData.maxOpenTrades} />
        </div>
        <div class="form-group">
          <label for="max-trades-per-day">
            Макс. сделок за день (закрытых)
            <span class="hint-inline">0 — без лимита</span>
          </label>
          <input id="max-trades-per-day" type="number" min="0" step="1" bind:value={formData.maxTradesPerDay} />
        </div>
        <div class="form-group">
          <label for="max-consecutive-losses">Макс. убыточных подряд</label>
          <input id="max-consecutive-losses" type="number" min="1" step="1" bind:value={formData.maxConsecutiveLosses} />
        </div>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-title">Поведенческие ограничения</div>
      <div class="form-row">
        <div class="form-group">
          <label for="cooldown-after-loss">
            Cooldown после убытка (мин)
            <span class="hint-inline">0 — выкл</span>
          </label>
          <input id="cooldown-after-loss" type="number" min="0" max="240" step="1" bind:value={formData.cooldownAfterLossMin} />
        </div>
        <div class="form-group">
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={formData.streakScalingEnabled} />
            <span>Anti-martingale (после 2+ убытков подряд резать риск ×½)</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={formData.dailyReviewEnabled} />
            <span>Напоминание «закрой день при цели»</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={formData.journalDayReminderEnabled} />
            <span>Напоминание закрыть день в дневнике</span>
          </label>
          <div class="form-group">
            <label for="journal-reminder-hour">
              Час напоминания (локально, 0–23)
              <span class="hint-inline">если запись за сегодня пустая</span>
            </label>
            <input
              id="journal-reminder-hour"
              type="number"
              min="0"
              max="23"
              step="1"
              bind:value={formData.journalDayReminderHourLocal}
              disabled={!formData.journalDayReminderEnabled}
            />
          </div>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-title">Цели (Prop Plan)</div>
      <div class="form-group">
        <label for="goal-mode">Формат целей</label>
        <select id="goal-mode" bind:value={formData.goalMode}>
          <option value="percent">В процентах</option>
          <option value="amount">В сумме</option>
        </select>
      </div>
      <div class="goal-grid">
        <div class="form-group">
          <label for="goal-day">Цель на день</label>
          <input id="goal-day" type="number" min="0" step="0.1" bind:value={formData.goalDayValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
        </div>
        <div class="form-group">
          <label for="goal-week">Цель на неделю</label>
          <input id="goal-week" type="number" min="0" step="0.1" bind:value={formData.goalWeekValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
        </div>
        <div class="form-group">
          <label for="goal-month">Цель на месяц</label>
          <input id="goal-month" type="number" min="0" step="0.1" bind:value={formData.goalMonthValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
        </div>
        <div class="form-group">
          <label for="goal-year">Цель на год</label>
          <input id="goal-year" type="number" min="0" step="0.1" bind:value={formData.goalYearValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
        </div>
      </div>
    </div>

    <div class="profile-hint profile-hint--compact">
      {#if hideBasicsSection}
        Импорт-счёт: имя, валюта и стартовый капитал задаются данными импорта и мастером счёта — блок «Основное» скрыт.
      {:else if !currencySelectableInProfile}
        Валюта счёта зафиксирована при создании и здесь не меняется.
      {:else if conversionSource === 'live'}
        Пересчёт сумм при смене валюты — по актуальному курсу.
      {:else if conversionSource === 'live-proxy-usdt'}
        Курс через USD-прокси для USDT.
      {:else if conversionSource === 'identity'}
        Конвертация при смене валюты не требуется (USD).
      {:else}
        Live-курс для пересчёта может быть недоступен.
      {/if}
      Лимиты и цели в {formData.accountCurrency}: риск {formatNumber(maxRiskAmount, 2)}, дневной стоп {formatNumber(maxDailyLossAmount, 2)}, D/W/M/Y {formatNumber(goalDayAmount, 2)} / {formatNumber(goalWeekAmount, 2)} / {formatNumber(goalMonthAmount, 2)} / {formatNumber(goalYearAmount, 2)}.
    </div>

    {#if fxMessage}
      <div class="profile-fx-message">{fxMessage}</div>
    {/if}

    <div class="form-group profile-notes-wrap">
      <label for="profile-notes">Заметки к профилю</label>
      <textarea id="profile-notes" rows="3" bind:value={formData.notes} placeholder="Правила, ограничения, checklist перед входом"></textarea>
    </div>
      {:else}
        <ProfileAccountsTab
          variant="full"
          profileSplit="create"
          on:account-profile-seeded={syncFormAfterAccountMutation}
        />
      {/if}
    </div>
  </div>

  <div slot="footer">
    <button type="button" on:click={closeModal}>{profileTab === 'setup' ? 'Отмена' : 'Закрыть'}</button>
    {#if profileTab === 'setup'}
      <button type="button" class="btn btn-primary" on:click={saveProfile}>Сохранить профиль</button>
    {/if}
  </div>
</Modal>
