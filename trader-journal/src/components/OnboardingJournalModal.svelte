<script>
  import Modal from './Modal.svelte';
  import ProfileAccountsTab from './ProfileAccountsTab.svelte';
  import { journalAccounts } from '../lib/accounts.js';

  /** Скрыть (например, пока открыт профиль поверх) */
  export let suppress = false;

  /** choice — две кнопки; clean | import — форма */
  let step = 'choice';

  /** Удерживаем окно после создания счёта, чтобы показать результат и метаданные импорта */
  let holdUntilDismiss = false;

  let prevAccountLen = -1;
  $: {
    const n = $journalAccounts.length;
    if (prevAccountLen > 0 && n === 0) {
      step = 'choice';
      holdUntilDismiss = false;
    }
    prevAccountLen = n;
  }

  $: open = (!$journalAccounts.length || holdUntilDismiss) && !suppress;

  function releaseHold() {
    holdUntilDismiss = false;
    step = 'choice';
  }
</script>

<Modal
  {open}
  modalClass="onboarding-journal-modal"
  closeOnBackdrop={false}
  showCloseButton={false}
  on:close={() => {}}
>
  <div slot="header">
    <h2 class="onb-title">
      {#if step === 'choice'}
        Добро пожаловать в журнал
      {:else if step === 'clean'}
        Новый счёт — пустая история
      {:else}
        Новый счёт — импорт сделок
      {/if}
    </h2>
  </div>
  <div slot="body">
    {#if step === 'choice'}
      <p class="onb-text">
        Данные журнала привязаны к торговому счёту: сделки, профиль, глоссарий и настройки хранятся отдельно для
        каждого. Выбери способ создания первого счёта.
      </p>
      <div class="onb-choice-row">
        <button type="button" class="btn btn-primary onb-choice-btn" on:click={() => (step = 'clean')}>
          Создать счёт с пустой историей
        </button>
        <button type="button" class="btn btn-primary onb-choice-btn" on:click={() => (step = 'import')}>
          Создать счёт с импортом сделок
        </button>
      </div>
      <p class="onb-hint">
        Импорт: HTML отчёта MT5, JSON сделок или ZIP бандла приложения. Имя счёта в интерфейсе задаётся отдельно и не
        обязано совпадать с названием в файле.
      </p>
    {:else}
      {#key step}
        <ProfileAccountsTab
          variant="onboarding"
          forcedWizardMode={step}
          on:back={() => (step = 'choice')}
          on:will-create-account={() => (holdUntilDismiss = true)}
          on:postcreate-dismiss={releaseHold}
        />
      {/key}
    {/if}
  </div>
  <div slot="footer"></div>
</Modal>

<style>
  .onb-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }
  .onb-text {
    margin: 0 0 12px;
    line-height: 1.5;
    font-size: 14px;
    color: var(--text);
  }
  .onb-choice-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 16px 0 0;
  }
  .onb-choice-btn {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
  .onb-hint {
    margin: 14px 0 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
</style>
