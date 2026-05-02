<script>
  import { tick, onDestroy } from 'svelte';
  import { getMergedSourceTooltipText } from '../lib/adviceSourcesRegistry';

  /** @type {string[]} */
  export let sourceIds = [];

  let open = false;
  /** @type {HTMLElement | undefined} */
  let wrapEl;

  $: tooltipText =
    Array.isArray(sourceIds) && sourceIds.length
      ? getMergedSourceTooltipText(sourceIds)
      : '';

  function detachOutside() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', onOutsideClick, true);
  }

  /** @param {MouseEvent} e */
  function onOutsideClick(e) {
    if (!wrapEl) return;
    const t = e.target;
    if (t instanceof Node && wrapEl.contains(t)) return;
    open = false;
    detachOutside();
  }

  /** @param {MouseEvent | KeyboardEvent} e */
  async function toggleOpen(e) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      open = false;
      detachOutside();
      return;
    }
    detachOutside();
    open = true;
    await tick();
    requestAnimationFrame(() => {
      if (typeof document !== 'undefined') {
        document.addEventListener('click', onOutsideClick, true);
      }
    });
  }

  /** @param {MouseEvent} e */
  function closePanel(e) {
    e.preventDefault();
    e.stopPropagation();
    open = false;
    detachOutside();
  }

  /** @param {KeyboardEvent} e */
  function onTriggerKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleOpen(e);
    }
  }

  onDestroy(detachOutside);
</script>

{#if tooltipText}
  <span class="jsh-wrap" bind:this={wrapEl}>
    <span
      class="jsh-trigger"
      tabindex="0"
      role="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Открыть фрагменты базы"
      class:jsh-trigger--active={open}
      on:click|stopPropagation={toggleOpen}
      on:keydown={onTriggerKeydown}
    >
      ⓘ
    </span>
    <div
      class="jsh-panel"
      class:jsh-panel--open={open}
      role="dialog"
      aria-label="Текст из базы"
      aria-hidden={!open}
    >
      <div class="jsh-panel-head">
        <span class="jsh-panel-title">Источники</span>
        <button type="button" class="jsh-close" aria-label="Закрыть" on:click={closePanel}>×</button>
      </div>
      <div class="jsh-panel-scroll">{tooltipText}</div>
    </div>
  </span>
{/if}

<style>
  .jsh-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    vertical-align: middle;
  }
  .jsh-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    margin: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    opacity: 0.85;
    transition:
      opacity 0.12s,
      border-color 0.12s,
      background 0.12s;
  }
  .jsh-trigger:hover,
  .jsh-trigger--active {
    opacity: 1;
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 14%, var(--bg));
  }
  .jsh-trigger:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .jsh-panel {
    position: absolute;
    z-index: 80;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    min-width: min(280px, 70vw);
    max-width: min(440px, 92vw);
    max-height: min(52vh, 400px);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.48;
    letter-spacing: 0.01em;
    color: var(--text);
    background: color-mix(in srgb, var(--bg) 97%, var(--border));
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow:
      0 4px 6px rgba(0, 0, 0, 0.06),
      0 14px 32px rgba(0, 0, 0, 0.14);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.16s ease,
      visibility 0.16s ease;
    text-align: left;
  }
  .jsh-panel--open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  .jsh-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
    border-radius: 10px 10px 0 0;
  }
  .jsh-panel-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .jsh-close {
    width: 26px;
    height: 26px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .jsh-close:hover {
    background: color-mix(in srgb, var(--loss, #c44) 12%, var(--bg));
    color: var(--text-strong);
  }
  .jsh-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .jsh-panel-scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 11px 13px;
    flex: 1;
    min-height: 0;
    white-space: pre-wrap;
  }
  @media (max-width: 520px) {
    .jsh-panel {
      left: auto;
      right: 0;
      transform: none;
      min-width: 240px;
    }
  }
</style>
