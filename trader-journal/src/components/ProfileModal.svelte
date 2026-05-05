<script>
  import {
    trades,
    userProfile,
    journalTourProfileSubIndex,
    journalTourProfileSubNextBus
  } from '../lib/stores';
  import { activeJournalAccount, activeJournalAccountId } from '../lib/accounts';
  import { get } from 'svelte/store';
  import { tick, createEventDispatcher } from 'svelte';
  import { convertAmount, formatNumber, getConversionQuote } from '../lib/utils';
  import { getDisciplineScore, getDisciplinedPnL } from '../lib/risk';
  import { normalizeStreakScalingMultipliers } from '../lib/streakScaling.js';
  import { getProfileTourSubsteps } from '../lib/journalTourProfileSubsteps.js';
  import { JOURNAL_TOUR_PROFILE_MODAL_SPOT } from '../lib/journalTour.js';
  import { toasts } from '../lib/toasts';
  import Modal from './Modal.svelte';
  import ProfileAccountsTab from './ProfileAccountsTab.svelte';
  import ProfileRulesTab from './ProfileRulesTab.svelte';
  import ProfileGoalsTab from './ProfileGoalsTab.svelte';
  import ProfileAchievementsTab from './ProfileAchievementsTab.svelte';

  export let open = false;
  export let closedTrades = [];
  /** При открытии модалки перейти сразу на эту вкладку (setup | rules | goals | achievements | create). */
  export let startTab = 'setup';
  /** Внешний тур журнала на шаге «профиль» — подшаги внутри модалки и сохранение. */
  export let journalTourProfileActive = false;

  const dispatch = createEventDispatcher();

  const PROFILE_TAB_IDS = new Set(['setup', 'rules', 'goals', 'achievements', 'create']);

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
    streakScalingApplyFromLossCount: 2,
    streakScalingMultipliers: [0.5, 0.25, 0.125],
    dailyReviewEnabled: true,
    journalDayReminderEnabled: true,
    journalDayReminderHourLocal: 21,
    postCloseChartReminderEnabled: true,
    weeklyLossLimitMode: 'percent',
    weeklyLossLimitPercent: 0,
    weeklyLossLimitAmount: 0,
    dailyProfitLockMode: 'percent',
    dailyProfitLockPercent: 0,
    dailyProfitLockAmount: 0,
    noNewTradesAfterHourLocal: 0,
    minMinutesBetweenTrades: 0,
    minRiskRewardHardBlock: false,
    minRiskRewardRatio: 1.5,
    weeklyLossLimitEnabled: false,
    dailyProfitLockEnabled: false,
    afterHoursCutoffEnabled: false,
    minTradeIntervalEnabled: false,
    profileNotesChecklistEnabled: true,
    achievementUnlockToastEnabled: true
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

  $: profileTourSteps = getProfileTourSubsteps({
    hideBasicsSection,
    currencySelectableInProfile
  });

  /** @param {import('../lib/journalTourProfileSubsteps.js').ProfileTourSubstep | undefined} sub */
  function getProfileTourFocusSelector(sub) {
    if (!sub) return null;
    if (sub.isSavePrompt) return sub.focusSelector ?? null;
    if (typeof sub.resolveFocus === 'function') return sub.resolveFocus(formData);
    return sub.focusSelector;
  }

  function clearProfileModalTourSpot() {
    if (typeof document === 'undefined') return;
    document
      .querySelectorAll(`[data-tour="${JOURNAL_TOUR_PROFILE_MODAL_SPOT}"]`)
      .forEach((n) => n.removeAttribute('data-tour'));
  }

  function focusProfileTourField() {
    if (!journalTourProfileActive || !open) return;
    clearProfileModalTourSpot();
    const idx = Math.min(Math.max(0, $journalTourProfileSubIndex), Math.max(0, profileTourSteps.length - 1));
    const sub = profileTourSteps[idx];
    if (!sub) return;
    const sel = getProfileTourFocusSelector(sub);
    if (!sel) return;
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) {
      el.setAttribute('data-tour', JOURNAL_TOUR_PROFILE_MODAL_SPOT);
      el.focus();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  let profileSubNextSynced = 0;
  $: if (journalTourProfileActive && open) {
    const v = $journalTourProfileSubNextBus;
    if (v > profileSubNextSynced) {
      profileSubNextSynced = v;
      tick().then(() => advanceProfileTourSub());
    }
  } else {
    profileSubNextSynced = $journalTourProfileSubNextBus;
  }

  $: if (!journalTourProfileActive || !open) {
    clearProfileModalTourSpot();
  }

  $: if (journalTourProfileActive && open && profileTourSteps.length) {
    const idx = Math.min(Math.max(0, $journalTourProfileSubIndex), profileTourSteps.length - 1);
    const sub = profileTourSteps[idx];
    if (sub?.tab && profileTab !== sub.tab) profileTab = sub.tab;
  }

  $: tourRailKey =
    journalTourProfileActive && open
      ? `${$journalTourProfileSubIndex}:${profileTab}:${formData.dailyLossLimitMode}`
      : '';
  $: if (tourRailKey) {
    tick().then(() => requestAnimationFrame(() => focusProfileTourField()));
  }

  function advanceProfileTourSub() {
    if (!journalTourProfileActive || !open) return;
    const steps = profileTourSteps;
    const idx = $journalTourProfileSubIndex;
    const sub = steps[idx];
    if (!sub || sub.isSavePrompt) return;
    if (sub.validate && !sub.validate(formData)) {
      toasts.warn('Проверь значение в поле.', { ttl: 4000 });
      return;
    }
    journalTourProfileSubIndex.update((n) => Math.min(n + 1, steps.length - 1));
  }

  /** @param {KeyboardEvent} e */
  function onJournalTourProfileKeydown(e) {
    if (!journalTourProfileActive || !open) return;
    if (e.key !== 'Enter') return;
    const steps = profileTourSteps;
    const idx = $journalTourProfileSubIndex;
    const sub = steps[idx];
    if (!sub || sub.isSavePrompt) return;

    const sel = getProfileTourFocusSelector(sub);
    if (!sel) return;
    const focusEl = document.querySelector(sel);
    const t = e.target;
    if (!(t instanceof Node) || !focusEl || (t !== focusEl && !focusEl.contains(t))) return;

    if (sub.validate && !sub.validate(formData)) {
      toasts.warn('Проверь значение в поле.', { ttl: 4000 });
      e.preventDefault();
      return;
    }
    e.preventDefault();
    journalTourProfileSubIndex.update((n) => Math.min(n + 1, steps.length - 1));
  }

  $: if (open) {
    const aid = String($activeJournalAccountId || '').trim();
    if (!wasOpen) {
      profileTab = PROFILE_TAB_IDS.has(startTab) ? startTab : 'setup';
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
      weeklyLossLimitAmount: Number(formData.weeklyLossLimitAmount) || 0,
      weeklyLossLimitPercent: Number(formData.weeklyLossLimitPercent) || 0,
      weeklyLossLimitMode: formData.weeklyLossLimitMode === 'amount' ? 'amount' : 'percent',
      dailyProfitLockAmount: Number(formData.dailyProfitLockAmount) || 0,
      dailyProfitLockPercent: Number(formData.dailyProfitLockPercent) || 0,
      dailyProfitLockMode: formData.dailyProfitLockMode === 'amount' ? 'amount' : 'percent',
      noNewTradesAfterHourLocal: (() => {
        const h = Number(formData.noNewTradesAfterHourLocal);
        const x = Number.isFinite(h) ? Math.floor(h) : 0;
        return Math.max(0, Math.min(23, x));
      })(),
      minMinutesBetweenTrades: Math.max(0, Number(formData.minMinutesBetweenTrades) || 0),
      minRiskRewardHardBlock: !!formData.minRiskRewardHardBlock,
      minRiskRewardRatio: Math.max(0, Number(formData.minRiskRewardRatio) || 0),
      weeklyLossLimitEnabled: !!formData.weeklyLossLimitEnabled,
      dailyProfitLockEnabled: !!formData.dailyProfitLockEnabled,
      afterHoursCutoffEnabled: !!formData.afterHoursCutoffEnabled,
      minTradeIntervalEnabled: !!formData.minTradeIntervalEnabled,
      profileNotesChecklistEnabled: !!formData.profileNotesChecklistEnabled,
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
      streakScalingApplyFromLossCount: (() => {
        const h = Number(formData.streakScalingApplyFromLossCount);
        const x = Number.isFinite(h) ? Math.floor(h) : 2;
        return Math.max(1, Math.min(99, x));
      })(),
      streakScalingMultipliers: normalizeStreakScalingMultipliers(formData.streakScalingMultipliers),
      dailyReviewEnabled: !!formData.dailyReviewEnabled,
      journalDayReminderEnabled: !!formData.journalDayReminderEnabled,
      journalDayReminderHourLocal: (() => {
        const h = Number(formData.journalDayReminderHourLocal);
        const x = Number.isFinite(h) ? Math.floor(h) : 21;
        return Math.max(0, Math.min(23, x));
      })(),
      postCloseChartReminderEnabled: !!formData.postCloseChartReminderEnabled,
      achievementUnlockToastEnabled: !!formData.achievementUnlockToastEnabled
    });
    if (journalTourProfileActive) {
      dispatch('journalTourProfileSaved');
    }
    closeModal();
  }

  function toggleAchievementUnlockToasts() {
    const next = !(formData.achievementUnlockToastEnabled !== false);
    formData = { ...formData, achievementUnlockToastEnabled: next };
    userProfile.updateProfile({ achievementUnlockToastEnabled: next });
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
      weeklyLossLimitAmount:
        formData.weeklyLossLimitMode === 'amount'
          ? convertAmount(formData.weeklyLossLimitAmount, rate, 2)
          : formData.weeklyLossLimitAmount,
      dailyProfitLockAmount:
        formData.dailyProfitLockMode === 'amount'
          ? convertAmount(formData.dailyProfitLockAmount, rate, 2)
          : formData.dailyProfitLockAmount,
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

<svelte:window on:keydown={onJournalTourProfileKeydown} />

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
          class:active={profileTab === 'rules'}
          aria-selected={profileTab === 'rules'}
          on:click={() => (profileTab = 'rules')}
        >
          Правила и ограничения
        </button>
        <button
          type="button"
          role="tab"
          class="profile-modal-tab"
          class:active={profileTab === 'goals'}
          aria-selected={profileTab === 'goals'}
          on:click={() => (profileTab = 'goals')}
        >
          Торговые цели
        </button>
        <button
          type="button"
          role="tab"
          class="profile-modal-tab"
          class:active={profileTab === 'achievements'}
          aria-selected={profileTab === 'achievements'}
          on:click={() => (profileTab = 'achievements')}
        >
          Достижения
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

    <div class="profile-hint profile-hint--compact profile-hint--after-basics">
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
      Лимиты — вкладка «Правила и ограничения»; цели D/W/M/Y — «Торговые цели».
    </div>

    {#if fxMessage}
      <div class="profile-fx-message">{fxMessage}</div>
    {/if}
  {:else if profileTab === 'rules'}
    <ProfileRulesTab
      {formData}
      {hideBasicsSection}
      {currencySelectableInProfile}
      {conversionSource}
      {maxRiskAmount}
      {maxDailyLossAmount}
      {goalDayAmount}
      {goalWeekAmount}
      {goalMonthAmount}
      {goalYearAmount}
      {fxMessage}
    />
  {:else if profileTab === 'goals'}
    <ProfileGoalsTab {formData} />
  {:else if profileTab === 'achievements'}
    <ProfileAchievementsTab />
  {:else if profileTab === 'create'}
        <ProfileAccountsTab
          variant="full"
          profileSplit="create"
          on:account-profile-seeded={syncFormAfterAccountMutation}
        />
  {/if}
    </div>
  </div>

  <div slot="footer">
    <div
      class="profile-modal-footer-row"
      class:profile-modal-footer-row--split={profileTab === 'achievements'}
    >
      <div class="profile-modal-footer-start">
        <button type="button" on:click={closeModal}>
          {profileTab === 'setup' || profileTab === 'rules' || profileTab === 'goals' ? 'Отмена' : 'Закрыть'}
        </button>
        {#if profileTab === 'setup' || profileTab === 'rules' || profileTab === 'goals'}
          <button
            type="button"
            id="profile-modal-save-btn"
            class="btn btn-primary"
            on:click={saveProfile}
          >
            Сохранить профиль
          </button>
        {/if}
      </div>
      {#if profileTab === 'achievements'}
        <button
          type="button"
          class="btn btn-sm profile-achievement-toast-toggle"
          on:click={toggleAchievementUnlockToasts}
        >
          {#if formData.achievementUnlockToastEnabled !== false}
            Не уведомлять о достижениях
          {:else}
            Уведомлять о достижениях
          {/if}
        </button>
      {/if}
    </div>
  </div>
</Modal>
