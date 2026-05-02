<script>
  import Modal from './Modal.svelte';
  import { createEventDispatcher } from 'svelte';

  /** @type {boolean} */
  export let open = false;
  /** @type {Array<{severity:'block'|'warn',code:string,message:string}>} */
  export let violations = [];

  const dispatch = createEventDispatcher();

  let acknowledged = false;

  $: hasBlocks = violations.some((v) => v.severity === 'block');
  $: if (!open) acknowledged = false;

  function close() {
    dispatch('close');
  }
  function confirm() {
    if (hasBlocks && !acknowledged) return;
    dispatch('confirm');
  }
</script>

<Modal {open} on:close={close}>
  <div slot="header">
    <h2 class="risk-confirm-title {hasBlocks ? 'block' : 'warn'}">
      {hasBlocks ? '⛔ Нарушение правил риск-менеджмента' : '⚠️ Предупреждение'}
    </h2>
  </div>

  <div slot="body">
    <p class="risk-confirm-intro">
      Сделка нарушает {violations.length === 1 ? 'правило' : 'правила'} из твоего профиля:
    </p>

    <ul class="risk-confirm-list">
      {#each violations as v}
        <li class="risk-violation severity-{v.severity}">
          <span class="risk-badge">{v.severity === 'block' ? 'BLOCK' : 'WARN'}</span>
          <span class="risk-text">{v.message}</span>
        </li>
      {/each}
    </ul>

    {#if hasBlocks}
      <label class="risk-confirm-ack">
        <input type="checkbox" bind:checked={acknowledged} />
        <span>
          Я осознаю, что нарушаю своё правило, и беру ответственность.
          <em>Сделка будет помечена в журнале как «нарушение дисциплины».</em>
        </span>
      </label>
    {:else}
      <p class="risk-confirm-soft">
        Это soft-warning, можно продолжить. Нарушения сохранятся в истории сделки
        для анализа дисциплины.
      </p>
    {/if}
  </div>

  <div slot="footer">
    <button type="button" on:click={close}>Отменить сделку</button>
    <button
      type="button"
      class="btn {hasBlocks ? 'btn-danger' : 'btn-primary'}"
      disabled={hasBlocks && !acknowledged}
      on:click={confirm}
    >
      {hasBlocks ? 'Всё равно сохранить' : 'Сохранить'}
    </button>
  </div>
</Modal>

<style>
  .risk-confirm-title { margin: 0; font-size: 16px; }
  .risk-confirm-title.block { color: var(--loss); }
  .risk-confirm-title.warn  { color: var(--warning); }

  .risk-confirm-intro { margin: 0 0 8px 0; font-size: 13px; }
  .risk-confirm-list  { list-style: none; padding: 0; margin: 0 0 12px 0; }

  .risk-violation {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 3px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    font-size: 13px;
    line-height: 1.4;
  }
  .risk-violation.severity-block { border-left: 3px solid var(--loss); }
  .risk-violation.severity-warn  { border-left: 3px solid var(--warning); }

  .risk-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    padding: 2px 6px;
    border-radius: 2px;
    background: var(--bg-3);
    color: var(--text-strong);
    flex-shrink: 0;
  }
  .severity-block .risk-badge {
    background: color-mix(in srgb, var(--loss) 22%, var(--bg-2));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--loss) 55%, var(--border));
  }
  .severity-warn .risk-badge {
    background: color-mix(in srgb, var(--warning) 35%, var(--bg-2));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--border));
  }

  .risk-text { flex: 1; color: var(--text); }

  .risk-confirm-ack {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px;
    border: 1px dashed var(--loss);
    border-radius: 3px;
    background: var(--bg-2);
    font-size: 13px;
    cursor: pointer;
  }
  .risk-confirm-ack input { margin-top: 3px; }
  .risk-confirm-ack em { color: var(--text-muted); font-style: normal; display: block; margin-top: 4px; font-size: 12px; }

  .risk-confirm-soft { font-size: 12px; color: var(--text-muted); margin: 0; }
</style>
