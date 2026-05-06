<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { createEventDispatcher } from 'svelte';
  import { journalSettings } from '../lib/journalSettings';
  import { toasts } from '../lib/toasts';

  /** Блокировка «Новая сделка» (лимиты / cooldown) */
  export let tradeAddDisabled = false;

  const dispatch = createEventDispatcher();

  let openCtx = false;
  let px = 0;
  let py = 0;
  /** @type {'sel' | 'field' | 'page'} */
  let mode = 'page';
  /** @type {HTMLElement | null} */
  let fieldRef = null;
  /** Поле под курсором для «Вставить» (может отличаться от якоря выделения) */
  /** @type {HTMLElement | null} */
  let pasteTarget = null;
  let canCutSel = false;
  let canPaste = false;
  /** @type {HTMLElement | undefined} */
  let panelEl;

  function closeMenu() {
    openCtx = false;
  }

  /** @param {Node | null | undefined} node */
  function getTextField(node) {
    if (!node) return null;
    const el =
      node.nodeType === Node.TEXT_NODE
        ? /** @type {Element | null} */ (node.parentElement)
        : /** @type {Element | null} */ (node);
    if (!el || typeof el.closest !== 'function') return null;
    const t = el.closest(
      'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="reset"]), [contenteditable="true"]'
    );
    if (!t) return null;
    if (t.tagName === 'INPUT') {
      const typ = /** @type {HTMLInputElement} */ (t).type?.toLowerCase() || 'text';
      if (!['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(typ)) return null;
    }
    return /** @type {HTMLElement} */ (t);
  }

  /** @param {HTMLElement | null} el */
  function fieldWritable(el) {
    if (!el) return false;
    if (el.isContentEditable) {
      const dis = el.closest('[contenteditable="false"]');
      return !dis || dis === el;
    }
    const inp = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
    if (inp.disabled) return false;
    if (inp.readOnly) return false;
    return true;
  }

  function runCopy() {
    try {
      const ok = document.execCommand('copy');
      if (ok) toasts.info('Скопировано', { ttl: 1500 });
      else toasts.warn('Не удалось скопировать.', { ttl: 2500 });
    } catch {
      toasts.warn('Копирование недоступно.', { ttl: 2500 });
    }
    closeMenu();
  }

  function runCut() {
    try {
      const ok = document.execCommand('cut');
      if (ok) toasts.info('Вырезано', { ttl: 1500 });
      else toasts.warn('Вырезание недоступно.', { ttl: 2500 });
    } catch {
      toasts.warn('Вырезание недоступно.', { ttl: 2500 });
    }
    closeMenu();
  }

  async function runPaste() {
    const el = pasteTarget;
    if (!el) {
      closeMenu();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (el.isContentEditable) {
        el.focus();
        document.execCommand('insertText', false, text);
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const inp = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
        inp.focus();
        const start = inp.selectionStart ?? inp.value.length;
        const end = inp.selectionEnd ?? inp.value.length;
        const v = inp.value;
        inp.value = v.slice(0, start) + text + v.slice(end);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.selectionStart = inp.selectionEnd = start + text.length;
      }
      toasts.info('Вставлено', { ttl: 1400 });
    } catch {
      toasts.warn('Вставка из буфера недоступна (нет доступа или пустой буфер).', {
        ttl: 4000
      });
    }
    closeMenu();
  }

  function runSelectAll() {
    const el = fieldRef;
    if (el) {
      try {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const inp = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
          inp.focus();
          inp.select();
        } else if (el.isContentEditable) {
          el.focus();
          const r = document.createRange();
          r.selectNodeContents(el);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
        }
      } catch {
        /* ignore */
      }
    } else {
      try {
        document.execCommand('selectAll');
      } catch {
        /* ignore */
      }
    }
    closeMenu();
  }

  /** @param {MouseEvent} e */
  async function onGlobalContextMenu(e) {
    const st = get(journalSettings);
    if (st.useNativeBrowserContextMenu) return;

    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];

    const forceNativeOnEl = /** @type {unknown[]} */ (path).some(
      (node) =>
        node instanceof HTMLElement && node.closest('[data-native-contextmenu]')
    );
    if (forceNativeOnEl) return;

    const onBuiltInMenu = /** @type {unknown[]} */ (path).some(
      (node) =>
        node instanceof HTMLElement && node.closest('.ctx-menu-root')
    );
    if (onBuiltInMenu) {
      e.preventDefault();
      return;
    }

    const target = /** @type {HTMLElement | null} */ (e.target);
    const field = target ? getTextField(target) : null;
    const sel = window.getSelection();
    const hasSel = !!(
      sel &&
      !sel.isCollapsed &&
      sel.toString &&
      String(sel.toString()).length > 0
    );

    const anchorField = sel && sel.anchorNode ? getTextField(sel.anchorNode) : null;

    /** @type {'sel' | 'field' | 'page'} */
    let nextMode = 'page';
    /** @type {HTMLElement | null} */
    let nextField = null;
    /** @type {HTMLElement | null} */
    let nextPaste = null;
    let nextCanCut = false;

    if (hasSel) {
      nextMode = 'sel';
      nextField = anchorField;
      nextCanCut = !!(anchorField && fieldWritable(anchorField));
      nextPaste = field && fieldWritable(field) ? field : null;
    } else if (field) {
      nextMode = 'field';
      nextField = field;
      nextCanCut = false;
      nextPaste = fieldWritable(field) ? field : null;
    } else {
      nextMode = 'page';
    }

    e.preventDefault();
    e.stopPropagation();

    mode = nextMode;
    fieldRef = nextField;
    pasteTarget = nextPaste;
    canCutSel = nextCanCut;
    canPaste = !!nextPaste;
    px = e.clientX;
    py = e.clientY;
    openCtx = true;

    await tick();
    await tick();
    clampPanel();
  }

  function clampPanel() {
    if (!panelEl || typeof window === 'undefined') return;
    const pad = 8;
    const r = panelEl.getBoundingClientRect();
    let x = px;
    let y = py;
    if (x + r.width > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - r.width - pad);
    if (y + r.height > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - r.height - pad);
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    px = x;
    py = y;
  }

  /** @param {MouseEvent} e */
  function onDocPointerDown(e) {
    if (!openCtx) return;
    if (panelEl && panelEl.contains(/** @type {Node} */ (e.target))) return;
    closeMenu();
  }

  /** @param {KeyboardEvent} e */
  function onDocKey(e) {
    if (e.key === 'Escape') closeMenu();
  }

  function onWinScroll() {
    if (openCtx) closeMenu();
  }

  onMount(() => {
    document.addEventListener('contextmenu', onGlobalContextMenu, true);
    document.addEventListener('mousedown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('scroll', onWinScroll, true);
  });

  onDestroy(() => {
    document.removeEventListener('contextmenu', onGlobalContextMenu, true);
    document.removeEventListener('mousedown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKey, true);
    window.removeEventListener('scroll', onWinScroll, true);
  });
</script>

{#if openCtx}
  <div
    class="ctx-menu-root"
    bind:this={panelEl}
    style:left="{px}px"
    style:top="{py}px"
    role="menu"
  >
    {#if mode === 'sel'}
      <button type="button" class="ctx-menu-item" role="menuitem" on:click={runCopy}>
        <span>Копировать</span>
        <kbd class="ctx-kbd">Ctrl+C</kbd>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        disabled={!canCutSel}
        on:click={runCut}
      >
        <span>Вырезать</span>
        <kbd class="ctx-kbd">Ctrl+X</kbd>
      </button>
      {#if canPaste}
        <button type="button" class="ctx-menu-item" role="menuitem" on:click={runPaste}>
          <span>Вставить</span>
          <kbd class="ctx-kbd">Ctrl+V</kbd>
        </button>
      {/if}
      <div class="ctx-sep" role="separator"></div>
      <button type="button" class="ctx-menu-item" role="menuitem" on:click={runSelectAll}>
        <span>Выделить всё</span>
        <kbd class="ctx-kbd">Ctrl+A</kbd>
      </button>
    {:else if mode === 'field'}
      <button type="button" class="ctx-menu-item" role="menuitem" disabled={!canPaste} on:click={runPaste}>
        <span>Вставить</span>
        <kbd class="ctx-kbd">Ctrl+V</kbd>
      </button>
      <button type="button" class="ctx-menu-item" role="menuitem" on:click={runSelectAll}>
        <span>Выделить всё</span>
        <kbd class="ctx-kbd">Ctrl+A</kbd>
      </button>
    {:else}
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('journalSettings');
          closeMenu();
        }}
      >
        <span>⚙ Параметры журнала</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        disabled={tradeAddDisabled}
        title={tradeAddDisabled ? 'Входы сейчас недоступны (лимиты / cooldown)' : ''}
        on:click={() => {
          if (tradeAddDisabled) return;
          dispatch('newTrade');
          closeMenu();
        }}
      >
        <span>➕ Новая сделка</span>
      </button>
      <div class="ctx-sep" role="separator"></div>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('navigateTab', { tab: 'open' });
          closeMenu();
        }}
      >
        <span>Вкладка «Открытые»</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('navigateTab', { tab: 'journal' });
          closeMenu();
        }}
      >
        <span>Дневник дня</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('navigateTab', { tab: 'glossary' });
          closeMenu();
        }}
      >
        <span>Глоссарий</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('navigateTab', { tab: 'guide' });
          closeMenu();
        }}
      >
        <span>Советы / гайд</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => {
          dispatch('reload');
          closeMenu();
        }}
      >
        <span>Перезагрузить приложение</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .ctx-menu-root {
    position: fixed;
    z-index: 200050;
    min-width: 220px;
    max-width: min(320px, 92vw);
    padding: 6px;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-2) 96%, transparent);
    box-shadow:
      var(--shadow),
      0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
    backdrop-filter: blur(10px);
  }

  .ctx-sep {
    height: 1px;
    margin: 6px 4px;
    background: var(--border);
    border: none;
    padding: 0;
  }

  .ctx-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    margin: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-strong);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease,
      opacity 0.12s ease;
  }

  .ctx-menu-item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-3));
    color: var(--text-strong);
  }

  .ctx-menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ctx-menu-item:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .ctx-kbd {
    flex-shrink: 0;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-3);
  }
</style>
