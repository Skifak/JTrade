<script>
  import Modal from './Modal.svelte';
  import { formatNumber } from '../lib/utils';
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let dailyPnL = 0;
  export let goalDayAmount = 0;
  export let currency = 'USD';

  const dispatch = createEventDispatcher();
  function close() { dispatch('close'); }
</script>

<Modal {open} on:close={close}>
  <div slot="header"><h2>🎯 Цель дня выполнена</h2></div>
  <div slot="body">
    <p class="dr-line">
      Дневной P/L: <strong class="profit">+{formatNumber(dailyPnL, 2)} {currency}</strong>
      &nbsp;·&nbsp;цель: {formatNumber(goalDayAmount, 2)} {currency}
    </p>
    <div class="dr-quote">
      «Жадность чаще всего убивает дневной плюс. Заверши день — статистика
      покажет, что трейдеры с дисциплиной exit'а превосходят тех, кто пытается
      выжать ещё.»
    </div>
    <p class="dr-tip">
      Подумай:
    </p>
    <ul class="dr-list">
      <li>Закрыть терминал и разобрать сегодняшние сделки в журнале.</li>
      <li>Если решишь продолжить — следующая сделка засчитается как «после-цели».</li>
      <li>Снять напоминание можно в Профиле (флажок «Daily review»).</li>
    </ul>
  </div>
  <div slot="footer">
    <button type="button" class="btn btn-primary" on:click={close}>Понял, спасибо</button>
  </div>
</Modal>

<style>
  .dr-line { margin: 0 0 10px; font-size: 14px; }
  .profit { color: var(--profit); }
  .dr-quote {
    padding: 10px 12px;
    border-left: 3px solid var(--accent);
    background: var(--bg-2);
    color: var(--text);
    font-style: italic;
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 12px;
  }
  .dr-tip { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
  .dr-list {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }
</style>
