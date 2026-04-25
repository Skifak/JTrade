<script>
  import { userProfile } from '../lib/stores';
  import { convertAmount, formatNumber, getConversionQuote } from '../lib/utils';
  import Modal from './Modal.svelte';

  export let open = false;
  export let closedTrades = [];

  let formData = {
    traderName: '',
    accountCurrency: 'USD',
    initialCapital: 10000,
    riskPerTradePercent: 1,
    dailyLossLimitPercent: 3,
    monthlyTargetPercent: 5,
    commissionPerLot: 0,
    notes: ''
  };
  let wasOpen = false;
  let previousCurrency = 'USD';
  let pnlConversionRate = 1;
  let conversionSource = 'identity';
  let isConvertingCurrency = false;
  let fxMessage = '';

  $: if (open && !wasOpen) {
    formData = { ...$userProfile };
    previousCurrency = formData.accountCurrency || 'USD';
    wasOpen = true;
    refreshPnlConversionRate(previousCurrency);
  }

  $: if (!open && wasOpen) {
    wasOpen = false;
    fxMessage = '';
    pnlConversionRate = 1;
  }

  $: totalClosedPnL = closedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
  $: convertedClosedPnL = convertAmount(totalClosedPnL, pnlConversionRate, 2);
  $: currentBalance = Number(formData.initialCapital || 0) + convertedClosedPnL;
  $: maxRiskAmount = (Number(formData.initialCapital || 0) * Number(formData.riskPerTradePercent || 0)) / 100;
  $: maxDailyLossAmount = (Number(formData.initialCapital || 0) * Number(formData.dailyLossLimitPercent || 0)) / 100;
  $: monthlyTargetAmount = (Number(formData.initialCapital || 0) * Number(formData.monthlyTargetPercent || 0)) / 100;

  function closeModal() {
    open = false;
  }

  function saveProfile() {
    userProfile.updateProfile({
      ...formData,
      initialCapital: Number(formData.initialCapital) || 0,
      riskPerTradePercent: Number(formData.riskPerTradePercent) || 0,
      dailyLossLimitPercent: Number(formData.dailyLossLimitPercent) || 0,
      monthlyTargetPercent: Number(formData.monthlyTargetPercent) || 0,
      commissionPerLot: Number(formData.commissionPerLot) || 0
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
      commissionPerLot: convertAmount(formData.commissionPerLot, rate, 4)
    };
    previousCurrency = nextCurrency;
    await refreshPnlConversionRate(nextCurrency);
    fxMessage = `Конвертация выполнена по курсу ${formatNumber(rate, 6)} (${fromCurrency}/${nextCurrency}, ${quote.source}).`;
    isConvertingCurrency = false;
  }
</script>

<Modal {open} on:close={closeModal}>
  <div slot="header">
    <h2>Профиль трейдера</h2>
  </div>

  <div slot="body">
    <div class="profile-summary-grid">
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
        <div class="profile-metric-value">{formatNumber(monthlyTargetAmount, 2)} {formData.accountCurrency}</div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="trader-name">Имя</label>
        <input id="trader-name" type="text" bind:value={formData.traderName} placeholder="Например, Alex" />
      </div>
      <div class="form-group">
        <label for="account-currency">Валюта счета</label>
        <select
          id="account-currency"
          bind:value={formData.accountCurrency}
          on:change={handleCurrencyChange}
          disabled={isConvertingCurrency}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="RUB">RUB</option>
          <option value="USDT">USDT</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="initial-capital">Размер капитала</label>
        <input id="initial-capital" type="number" min="0" step="10" bind:value={formData.initialCapital} />
      </div>
      <div class="form-group">
        <label for="risk-per-trade">Риск на сделку (%)</label>
        <input id="risk-per-trade" type="number" min="0" max="100" step="0.1" bind:value={formData.riskPerTradePercent} />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="daily-loss-limit">Дневной лимит убытка (%)</label>
        <input id="daily-loss-limit" type="number" min="0" max="100" step="0.1" bind:value={formData.dailyLossLimitPercent} />
      </div>
      <div class="form-group">
        <label for="monthly-target">Цель на месяц (%)</label>
        <input id="monthly-target" type="number" min="0" max="1000" step="0.1" bind:value={formData.monthlyTargetPercent} />
      </div>
    </div>

    <div class="form-group">
      <label for="commission-per-lot">Комиссия за 1 лот</label>
      <input id="commission-per-lot" type="number" min="0" step="0.01" bind:value={formData.commissionPerLot} />
    </div>

    <div class="profile-hint">
      PnL в сделках считается в USD и конвертируется в валюту счета.
      {#if conversionSource === 'live'}
        Использован актуальный курс.
      {:else if conversionSource === 'live-proxy-usdt'}
        Использован актуальный курс через USD-прокси для USDT.
      {:else if conversionSource === 'identity'}
        Конвертация не требуется.
      {:else}
        Live-курс сейчас недоступен.
      {/if}
    </div>

    {#if fxMessage}
      <div class="profile-fx-message">{fxMessage}</div>
    {/if}

    <div class="form-group">
      <label for="profile-notes">Заметки к профилю</label>
      <textarea id="profile-notes" rows="3" bind:value={formData.notes} placeholder="Правила, ограничения, checklist перед входом"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button type="button" on:click={closeModal}>Отмена</button>
    <button type="button" class="btn btn-primary" on:click={saveProfile}>Сохранить профиль</button>
  </div>
</Modal>
