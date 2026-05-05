<script>
  import ProfileRulesBlock from './ProfileRulesBlock.svelte';
  import ProfileOwnRulesSection from './ProfileOwnRulesSection.svelte';
  import { PROFILE_RULE_ENTRIES_TAB } from '../lib/profileRulesRegistry';
  import { getRulesTabDefaults } from '../lib/profileRulesDefaults';
  import { formatNumber } from '../lib/utils';
  import { activeJournalAccount } from '../lib/accounts';

  export let formData = {};

  export let hideBasicsSection = false;
  export let currencySelectableInProfile = false;
  export let conversionSource = '';
  export let maxRiskAmount = 0;
  export let maxDailyLossAmount = 0;
  export let goalDayAmount = 0;
  export let goalWeekAmount = 0;
  export let goalMonthAmount = 0;
  export let goalYearAmount = 0;
  export let fxMessage = '';

  function applyRulesTabDefaults() {
    const d = getRulesTabDefaults();
    for (const k of Object.keys(d)) {
      formData[k] = d[k];
    }
  }
</script>

<div class="profile-rules-tab">
  <p class="profile-rules-tab-account-line">
    {#if $activeJournalAccount}
      Правила и лимиты для счёта <strong class="profile-rules-tab-account-name">{$activeJournalAccount.name}</strong>
    {:else}
      <span class="profile-rules-tab-account-missing">Нет активного счёта — выбери или создай во вкладках профиля выше.</span>
    {/if}
  </p>

  <div class="profile-rules-tab-callout" role="note">
    <p class="profile-rules-tab-callout-title">Чувствительные условия</p>
    <p class="profile-rules-tab-callout-text">
      Здесь настраиваются пороги и триггеры, от которых зависит, <strong>когда журнал блокирует сделку</strong>, снимает
      кнопку входа, включает паузы и показывает напоминания. Это не «косметика» — после «Сохранить профиль» логика
      начинает работать по новым числам сразу.
    </p>
    <p class="profile-rules-tab-callout-text profile-rules-tab-callout-text--warn">
      Меняй поля только с пониманием: слишком жёсткие лимиты душат нормальный вход, слишком мягкие — оставляют тебя без
      стоп-крана в плохой день. Если сомневаешься — зафиксируй старые значения и двигай один параметр за раз.
    </p>
  </div>

  <ProfileOwnRulesSection {formData} />

  <ProfileRulesBlock
    formData={formData}
    entries={PROFILE_RULE_ENTRIES_TAB}
    shellTitle="Правила и ограничения"
    shellLede="Каждая карточка — краткое резюме, при необходимости поля в карточке и «Подробнее». Блок «Свои правила» выше; числовые цели D/W/M/Y — на вкладке «Торговые цели»."
  >
    <div slot="headActions">
      <button type="button" class="btn btn-sm profile-rules-defaults-btn" on:click={applyRulesTabDefaults}>
        Установить по умолчанию
      </button>
    </div>
  </ProfileRulesBlock>

  <div class="profile-hint profile-hint--compact">
    {#if hideBasicsSection}
      Импорт-счёт: капитал для расчёта % берётся из данных счёта.
    {:else if !currencySelectableInProfile}
      Валюта счёта зафиксирована при создании — лимиты в {formData.accountCurrency}.
    {:else if conversionSource === 'live'}
      Пересчёт сумм при смене валюты — на вкладке «Настройка счёта».
    {:else if conversionSource === 'live-proxy-usdt'}
      Курс через USD-прокси для USDT — при смене валюты в «Настройке счёта».
    {:else if conversionSource === 'identity'}
      Базовая валюта без пересчёта.
    {:else}
      Live-курс может быть недоступен.
    {/if}
    Лимиты в {formData.accountCurrency}: риск {formatNumber(maxRiskAmount, 2)}, дневной стоп {formatNumber(maxDailyLossAmount, 2)}. Суммы целей см. вкладку «Торговые цели» (сейчас D/W/M/Y {formatNumber(goalDayAmount, 2)} / {formatNumber(goalWeekAmount, 2)} / {formatNumber(goalMonthAmount, 2)} / {formatNumber(goalYearAmount, 2)}).
  </div>

  {#if fxMessage}
    <div class="profile-fx-message">{fxMessage}</div>
  {/if}
</div>

<style>
  .profile-rules-tab {
    padding-bottom: 8px;
  }
  .profile-rules-tab-account-line {
    margin: 0 0 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .profile-rules-tab-account-name {
    color: var(--text-strong);
    font-weight: 700;
  }
  .profile-rules-tab-account-missing {
    color: var(--warning);
    font-weight: 500;
  }
  .profile-rules-tab-callout {
    margin: 0 0 14px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--warning, #b45309) 38%, var(--border));
    border-left-width: 4px;
    border-left-color: color-mix(in srgb, var(--warning, #b45309) 72%, var(--border));
    background: color-mix(in srgb, var(--warning, #b45309) 7%, var(--bg-2));
    box-sizing: border-box;
  }
  .profile-rules-tab-callout-title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-strong);
  }
  .profile-rules-tab-callout-text {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
  }
  .profile-rules-tab-callout-text:last-child {
    margin-bottom: 0;
  }
  .profile-rules-tab-callout-text--warn {
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--warning, #b45309) 22%, var(--border));
    font-weight: 500;
    color: var(--text-strong);
  }
  .profile-rules-defaults-btn {
    font-size: 11.5px;
  }
</style>
