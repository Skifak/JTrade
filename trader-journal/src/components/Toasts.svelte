<script>
  import { toasts } from '../lib/toasts';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div class="toast toast-{t.kind}" on:click={() => toasts.dismiss(t.id)}>
      <span class="toast-text">{t.text}</span>
      <button class="toast-close" type="button" aria-label="Закрыть">×</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    font-size: 13px;
    box-shadow: var(--shadow);
    cursor: pointer;
  }
  .toast-text { flex: 1; line-height: 1.4; white-space: pre-wrap; }
  .toast-close {
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .toast-info  { border-left: 3px solid var(--accent); }
  .toast-warn  { border-left: 3px solid var(--warning); }
  .toast-error { border-left: 3px solid var(--loss); }
</style>
