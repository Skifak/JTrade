<script>
  import { tick, onDestroy } from 'svelte';

  export let title = '';
  export let definition = '';

  /** Подпись категории из глоссария */
  export let categoryName = '';

  let open = false;
  /** @type {HTMLElement | undefined} */
  let wrapEl;
  /** @type {HTMLButtonElement | undefined} */
  let chipEl;
  /** @type {HTMLElement | undefined} */
  let panelEl;

  let scrollOrResizeTicking = false;

  function detachOutside() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', onOutsideClick, true);
  }

  function detachReposition() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', onScrollResize, true);
    window.removeEventListener('resize', onScrollResize);
  }

  /** @param {MouseEvent} e */
  function onOutsideClick(e) {
    if (!wrapEl) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (wrapEl.contains(t)) return;
    if (panelEl && panelEl.contains(t)) return;
    open = false;
    detachOutside();
    detachReposition();
  }

  function updatePanelPosition() {
    if (!open || !chipEl || !panelEl || typeof window === 'undefined') return;
    const cr = chipEl.getBoundingClientRect();
    const margin = 8;
    const pw = panelEl.offsetWidth;
    const ph = panelEl.offsetHeight;
    if (pw < 4 || ph < 4) return;

    let left = cr.left + cr.width / 2 - pw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

    let top = cr.top - ph - margin;
    if (top < margin) {
      top = cr.bottom + margin;
    }
    if (top + ph > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - ph - margin);
    }

    panelEl.style.left = `${Math.round(left)}px`;
    panelEl.style.top = `${Math.round(top)}px`;
  }

  function schedulePosition() {
    if (scrollOrResizeTicking) return;
    scrollOrResizeTicking = true;
    requestAnimationFrame(() => {
      scrollOrResizeTicking = false;
      updatePanelPosition();
    });
  }

  function onScrollResize() {
    schedulePosition();
  }

  /** @param {HTMLElement} node */
  function elevateToBody(node) {
    if (typeof document === 'undefined') return {};
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  /** @param {MouseEvent | KeyboardEvent} e */
  async function toggleOpen(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!String(title || '').trim()) return;
    if (open) {
      open = false;
      detachOutside();
      detachReposition();
      return;
    }
    detachOutside();
    detachReposition();
    open = true;
    await tick();
    await tick();
    requestAnimationFrame(() => {
      updatePanelPosition();
      requestAnimationFrame(() => {
        updatePanelPosition();
        if (typeof document !== 'undefined') {
          document.addEventListener('click', onOutsideClick, true);
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('scroll', onScrollResize, true);
          window.addEventListener('resize', onScrollResize);
        }
      });
    });
  }

  /** @param {MouseEvent} e */
  function closePanel(e) {
    e.preventDefault();
    e.stopPropagation();
    open = false;
    detachOutside();
    detachReposition();
  }

  /** @param {KeyboardEvent} e */
  function onTriggerKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleOpen(e);
    }
  }

  $: if (open && panelEl && chipEl) {
    queueMicrotask(schedulePosition);
  }

  onDestroy(() => {
    detachOutside();
    detachReposition();
  });

  $: safeDef = String(definition ?? '').trim();
</script>

{#if String(title || '').trim()}
  <span class="gtp-wrap" bind:this={wrapEl}>
    <button
      type="button"
      class="gtp-chip"
      class:gtp-chip--open={open}
      bind:this={chipEl}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Подсказка глоссария: {title}"
      on:click|stopPropagation={toggleOpen}
      on:keydown={onTriggerKeydown}
    >
      <span class="gtp-chip-title">{title}</span>
    </button>
    {#if open}
      <div
        bind:this={panelEl}
        use:elevateToBody
        class="gtp-panel gtp-panel--open gtp-panel--fixed"
        role="dialog"
        aria-label={title}
        aria-hidden="false"
      >
        <div class="gtp-panel-head">
          <span class="gtp-panel-title">{title}</span>
          <button type="button" class="gtp-close" aria-label="Закрыть" on:click={closePanel}>×</button>
        </div>
        <div class="gtp-panel-scroll">
          {#if categoryName}
            <div class="gtp-cat">{categoryName}</div>
          {/if}
          {#if safeDef}
            <div class="gtp-body">{safeDef}</div>
          {:else}
            <div class="gtp-body gtp-body--empty">Определение пока пустое — дополни карточку во вкладке «Глоссарий».</div>
          {/if}
        </div>
      </div>
    {/if}
  </span>
{/if}

<style>
  .gtp-wrap {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
  }

  .gtp-chip {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    padding: 7px 10px;
    margin: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
    color: var(--text-strong);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.12s ease,
      background 0.12s ease,
      box-shadow 0.12s ease;
  }
  .gtp-chip:hover {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .gtp-chip--open {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  }
  .gtp-chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .gtp-chip-title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  /* Панель вынесена в body; fixed + z поверх модалки (.modal-overlay ~ 13500) */
  .gtp-panel.gtp-panel--fixed {
    position: fixed;
    z-index: 20000;
    margin: 0;
    transform: none;
    left: 0;
    top: 0;
    bottom: auto;
    right: auto;
    display: flex;
    flex-direction: column;
    width: min(268px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: min(52vh, 340px);
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
    text-align: left;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .gtp-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
    border-radius: 10px 10px 0 0;
  }
  .gtp-panel-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-strong);
    line-height: 1.35;
    word-break: break-word;
  }

  .gtp-close {
    flex-shrink: 0;
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
  .gtp-close:hover {
    background: color-mix(in srgb, var(--loss, #c44) 12%, var(--bg));
    color: var(--text-strong);
  }
  .gtp-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .gtp-panel-scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px 12px 12px;
    flex: 1;
    min-height: 0;
  }

  .gtp-cat {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .gtp-body {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
  }
  .gtp-body--empty {
    color: var(--text-muted);
    font-style: italic;
    white-space: normal;
  }

  @media (max-width: 520px) {
    .gtp-panel.gtp-panel--fixed {
      width: min(260px, calc(100vw - 16px));
    }
  }
</style>
