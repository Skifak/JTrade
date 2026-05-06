<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { createEventDispatcher } from 'svelte';
  import { journalSettings } from '../lib/journalSettings';
  import { toasts } from '../lib/toasts';
  import { trades } from '../lib/stores';
  import { fxRate, formatAccountMoney, tradeProfitDisplayUnits, convertUsd } from '../lib/fxRate';
  import { livePrices } from '../lib/livePrices';
  import { normalizeSymbolKey } from '../lib/constants';
  import {
    formatDate,
    formatPrice,
    formatNumber,
    formatDuration,
    calculatePips,
    calculatePricePercent,
    calculateFloatingProfit,
    isMt5DepositCurrencyProfit
  } from '../lib/utils';
  import { primaryKillzone, killzoneLabel } from '../lib/killzones';
  import { findPlay, strategies } from '../lib/playbooks';
  import { tradingViewChartUrl } from '../lib/tradingView';

  /** Блокировка «Новая сделка» (лимиты / cooldown) */
  export let tradeAddDisabled = false;

  const dispatch = createEventDispatcher();

  let openCtx = false;
  let px = 0;
  let py = 0;
  /** @type {'sel' | 'field' | 'page' | 'tradeRow' | 'snippet'} */
  let mode = 'page';
  /** @type {HTMLElement | null} */
  let fieldRef = null;
  /** @type {HTMLElement | null} */
  let pasteTarget = null;
  let canCutSel = false;
  let canPaste = false;
  /** @type {string | null} */
  let ctxTradeId = null;
  /** @type {string} */
  let snippetText = '';
  /** @type {string} */
  let snippetLabel = 'Текст';
  /** @type {HTMLElement | undefined} */
  let panelEl;

  function closeMenu() {
    openCtx = false;
    ctxTradeId = null;
    snippetText = '';
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

  /**
   * @param {HTMLElement | null} target
   * @returns {{ label: string, text: string } | null}
   */
  function getSnippetFromTarget(target) {
    if (!target?.closest) return null;
    const dataCopy = target.closest('[data-tj-ctx-copy]');
    if (dataCopy) {
      const v = dataCopy.getAttribute('data-tj-ctx-copy');
      if (v != null && String(v).trim()) return { label: 'Текст из разметки', text: String(v).trim() };
    }
    const wc = target.closest('.world-clocks .wc-item');
    if (wc) return { label: 'Строка мирового времени', text: wc.innerText.replace(/\s+/g, ' ').trim() };
    const ping = target.closest('.ping-pill');
    if (ping) return { label: 'Статус потока котировок', text: ping.innerText.replace(/\s+/g, ' ').trim() };
    const th = target.closest('.trades-table th.sortable');
    if (th) return { label: 'Заголовок колонки', text: th.innerText.replace(/\s+/g, ' ').trim() };
    const h1 = target.closest('.journal-header h1');
    if (h1) return { label: 'Заголовок', text: h1.innerText.replace(/\s+/g, ' ').trim() };
    return null;
  }

  /** @param {string | null | undefined} id */
  function resolveTrade(id) {
    if (!id) return null;
    return get(trades).find((t) => t.id === id) || null;
  }

  /** @param {Record<string, any>} trade */
  function tradeKzCtx(trade) {
    void get(journalSettings);
    const kid = trade?.killzone || primaryKillzone(trade?.dateOpen);
    return kid ? killzoneLabel(kid) : '—';
  }

  /** @param {Record<string, any>} trade */
  function tradePlayCtx(trade) {
    if (!trade?.strategyId || !trade?.playId) return '';
    const p = findPlay(get(strategies), trade.strategyId, trade.playId);
    return p ? p.name : '';
  }

  /** @param {unknown} lp */
  /** @param {Record<string, unknown>} trade */
  function pickPrice(lp, trade) {
    if (lp && typeof lp === 'object' && lp !== null && 'price' in lp && lp.price != null)
      return Number(/** @type {{ price?: unknown }} */ (lp).price);
    if (trade?.marketPrice != null) return Number(trade.marketPrice);
    return null;
  }

  /** @param {unknown} lp */
  /** @param {Record<string, unknown>} trade */
  function floatingForCtx(lp, trade) {
    if (lp && typeof lp === 'object' && lp !== null && 'price' in lp && lp.price != null)
      return calculateFloatingProfit(/** @type {any} */ (trade), Number(/** @type {{ price?: unknown }} */ (lp).price));
    return trade?.profit != null ? Number(trade.profit) : null;
  }

  /** @param {Record<string, any>} trade */
  function formatTradeShortLine(trade) {
    const fx = get(fxRate);
    const lp = get(livePrices)[normalizeSymbolKey(String(trade.pair || ''))];
    const mp = pickPrice(lp, trade);
    const fp = floatingForCtx(lp, trade);
    const dir = trade.direction === 'long' ? 'Long' : 'Short';
    let plStr = '—';
    if (trade.status === 'closed') {
      const pd = tradeProfitDisplayUnits(trade, fx);
      plStr = formatAccountMoney(pd, fx);
    } else if (fp != null) {
      const fd = isMt5DepositCurrencyProfit(trade) ? Number(fp) : convertUsd(Number(fp), fx);
      plStr = formatAccountMoney(Number.isFinite(fd) ? fd : 0, fx);
    }
    const kz = tradeKzCtx(trade);
    const play = tradePlayCtx(trade);
    let s = `${trade.pair} ${dir} vol ${trade.volume} @ ${formatPrice(trade.priceOpen)}`;
    if (trade.sl) s += ` SL ${formatPrice(trade.sl)}`;
    if (trade.tp) s += ` TP ${formatPrice(trade.tp)}`;
    if (mp != null && trade.status === 'open') s += ` | рынок ${formatPrice(mp)}`;
    s += ` | KZ ${kz}`;
    if (play) s += ` · ${play}`;
    s += ` | P/L ${plStr}`;
    if (trade.comment) s += ` | ${String(trade.comment).slice(0, 200)}`;
    return s;
  }

  /** @param {Record<string, any>} trade */
  function formatTradeDetailBlock(trade) {
    const fx = get(fxRate);
    /** @type {string[]} */
    const lines = [];
    lines.push(`Пара: ${trade.pair}`);
    lines.push(`Направление: ${trade.direction === 'long' ? 'Long' : 'Short'}`);
    lines.push(`Статус: ${trade.status === 'open' ? 'Открыта' : 'Закрыта'}`);
    if (trade.dateOpen) lines.push(`Открыта: ${formatDate(trade.dateOpen)}`);
    if (trade.status === 'closed' && trade.dateClose) lines.push(`Закрыта: ${formatDate(trade.dateClose)}`);
    if (trade.status === 'closed')
      lines.push(`Длительность: ${formatDuration(trade.dateOpen, trade.dateClose)}`);
    else lines.push(`В работе: ${formatDuration(trade.dateOpen, null)}`);
    lines.push(`Объём: ${trade.volume}`);
    lines.push(`Цена входа: ${formatPrice(trade.priceOpen)}`);
    if (trade.status === 'closed' && trade.priceClose != null)
      lines.push(`Цена выхода: ${formatPrice(trade.priceClose)}`);
    const lp = get(livePrices)[normalizeSymbolKey(String(trade.pair || ''))];
    const mp = pickPrice(lp, trade);
    if (trade.status === 'open' && mp != null) lines.push(`Рынок сейчас: ${formatPrice(mp)}`);
    lines.push(`SL: ${trade.sl ? formatPrice(trade.sl) : '—'}`);
    lines.push(`TP: ${trade.tp ? formatPrice(trade.tp) : '—'}`);
    lines.push(`KZ: ${tradeKzCtx(trade)}`);
    const pl = tradePlayCtx(trade);
    if (pl) lines.push(`Setup: ${pl}`);
    if (trade.comment) lines.push(`Комментарий: ${trade.comment}`);
    if (trade.status === 'closed') {
      const pips = calculatePips(trade);
      const pct = calculatePricePercent(trade);
      if (pips != null) lines.push(`Pips: ${formatNumber(pips, 1)}`);
      if (pct != null) lines.push(`%: ${formatNumber(pct, 2)}`);
      lines.push(`Комиссия: ${formatNumber(Number(trade.commission) || 0, 2)}`);
      lines.push(`Своп: ${formatNumber(Number(trade.swap) || 0, 2)}`);
      lines.push(`P/L: ${formatAccountMoney(tradeProfitDisplayUnits(trade, fx), fx)}`);
    } else {
      const fp = floatingForCtx(lp, trade);
      if (fp != null) {
        const fd = isMt5DepositCurrencyProfit(trade) ? Number(fp) : convertUsd(Number(fp), fx);
        lines.push(`Плавающий P/L: ${formatAccountMoney(Number.isFinite(fd) ? fd : 0, fx)}`);
      }
    }
    lines.push(`ID: ${trade.id}`);
    return lines.join('\n');
  }

  function formatOpenPositionsSummary() {
    const open = get(trades).filter((t) => t.status === 'open');
    if (!open.length) return '';
    return open
      .map(
        (t) =>
          `${t.pair} ${t.direction === 'long' ? 'Long' : 'Short'} vol ${t.volume} @ ${formatPrice(t.priceOpen)}`
      )
      .join('\n');
  }

  async function clipboardWrite(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  /** @param {string} text */
  async function copyString(text, okMsg = 'Скопировано') {
    const t = String(text ?? '').trim();
    if (!t) {
      toasts.warn('Нечего копировать.', { ttl: 2000 });
      closeMenu();
      return;
    }
    const ok = await clipboardWrite(t);
    if (ok) toasts.info(okMsg, { ttl: 1500 });
    else toasts.warn('Не удалось скопировать.', { ttl: 2500 });
    closeMenu();
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

  /** @param {Record<string, any>} trade */
  function openTradingViewForTrade(trade) {
    const url = tradingViewChartUrl(String(trade.pair || ''));
    if (!url) {
      toasts.warn('Нет пары для графика.', { ttl: 2200 });
      closeMenu();
      return;
    }
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toasts.error('Не удалось открыть вкладку.', { ttl: 3000 });
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

    /** @type {'sel' | 'field' | 'page' | 'tradeRow' | 'snippet'} */
    let nextMode = 'page';
    /** @type {HTMLElement | null} */
    let nextField = null;
    /** @type {HTMLElement | null} */
    let nextPaste = null;
    let nextCanCut = false;
    /** @type {string | null} */
    let nextTradeId = null;
    /** @type {string} */
    let nextSnippetText = '';
    /** @type {string} */
    let nextSnippetLabel = 'Текст';

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
      const row = target?.closest?.('tr[data-tj-trade-id]');
      const inTable = !!(target && target.closest('.trades-table tbody'));
      if (row && inTable) {
        const tid = row.getAttribute('data-tj-trade-id');
        if (tid && resolveTrade(tid)) {
          nextMode = 'tradeRow';
          nextTradeId = tid;
        }
      }
      if (nextMode === 'page') {
        const snip = target ? getSnippetFromTarget(target) : null;
        if (snip && snip.text) {
          nextMode = 'snippet';
          nextSnippetText = snip.text;
          nextSnippetLabel = snip.label;
        }
      }
    }

    e.preventDefault();
    e.stopPropagation();

    mode = nextMode;
    fieldRef = nextField;
    pasteTarget = nextPaste;
    canCutSel = nextCanCut;
    canPaste = !!nextPaste;
    ctxTradeId = nextTradeId;
    snippetText = nextSnippetText;
    snippetLabel = nextSnippetLabel;
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

  $: ctxTrade = mode === 'tradeRow' && ctxTradeId ? resolveTrade(ctxTradeId) : null;

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
    {:else if mode === 'tradeRow' && !ctxTrade}
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
    {:else if mode === 'tradeRow' && ctxTrade}
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => copyString(formatTradeShortLine(ctxTrade))}
      >
        <span>📋 Копировать кратко (одна строка)</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => copyString(formatTradeDetailBlock(ctxTrade))}
      >
        <span>📋 Копировать подробно</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => copyString(String(ctxTrade.pair || ''))}
      >
        <span>📋 Копировать только пару</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        disabled={!ctxTrade.comment}
        on:click={() => copyString(String(ctxTrade.comment || ''))}
      >
        <span>📋 Копировать комментарий</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => copyString(String(ctxTrade.id || ''))}
      >
        <span>🆔 Копировать ID сделки</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() =>
          copyString(tradingViewChartUrl(String(ctxTrade.pair || '')) || '', 'Ссылка скопирована')}
      >
        <span>🔗 Копировать URL графика (TradingView)</span>
      </button>
      <button
        type="button"
        class="ctx-menu-item ctx-strong"
        role="menuitem"
        on:click={() => openTradingViewForTrade(ctxTrade)}
      >
        <span>📈 Открыть график в TradingView</span>
      </button>
      <div class="ctx-sep" role="separator"></div>
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
    {:else if mode === 'snippet'}
      <button
        type="button"
        class="ctx-menu-item"
        role="menuitem"
        on:click={() => copyString(snippetText)}
      >
        <span>📋 Копировать: {snippetLabel}</span>
      </button>
      <div class="ctx-sep" role="separator"></div>
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
    {:else}
      {#if formatOpenPositionsSummary()}
        <button
          type="button"
          class="ctx-menu-item"
          role="menuitem"
          on:click={() => copyString(formatOpenPositionsSummary(), 'Список скопирован')}
        >
          <span>📋 Копировать список открытых позиций</span>
        </button>
        <div class="ctx-sep" role="separator"></div>
      {/if}
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
    {/if}
  </div>
{/if}

<style>
  .ctx-menu-root {
    position: fixed;
    z-index: 200050;
    min-width: 220px;
    max-width: min(340px, 92vw);
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

  .ctx-menu-item.ctx-strong {
    font-weight: 600;
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
