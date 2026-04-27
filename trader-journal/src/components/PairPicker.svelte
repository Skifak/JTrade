<script>
  /**
   * Пар-пикер: 4-колоночный dropdown с категориями + поиск.
   * Заменяет нативный <select>: позволяет видеть все ~70 инструментов
   * сразу, грипперно по категориям (FX Majors, Crosses, Metals, Commodities,
   * Indices, Crypto Majors/Alts).
   *
   *   <PairPicker bind:value={formData.pair} />
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { PAIR_CATEGORIES, PAIRS } from '../lib/constants';

  export let value = '';

  const dispatch = createEventDispatcher();

  let openMenu = false;
  let search = '';
  let triggerEl;
  let menuEl;
  let searchInput;

  $: filtered = filterCategories(search);

  function filterCategories(q) {
    const term = String(q || '').trim().toUpperCase();
    if (!term) return PAIR_CATEGORIES;
    const out = [];
    for (const cat of PAIR_CATEGORIES) {
      const items = cat.items.filter((p) => p.includes(term));
      if (items.length) out.push({ ...cat, items });
    }
    // Если поиск ничего не нашёл по имени категории — пустой массив.
    return out;
  }

  function toggleMenu() {
    openMenu = !openMenu;
    if (openMenu) {
      // фокус на поиск через тик, чтобы DOM успел отрендериться
      setTimeout(() => searchInput?.focus(), 0);
    }
  }

  function closeMenu() {
    openMenu = false;
    search = '';
  }

  function selectPair(p) {
    value = p;
    dispatch('change', p);
    closeMenu();
  }

  function onDocClick(ev) {
    if (!openMenu) return;
    if (
      triggerEl && !triggerEl.contains(ev.target) &&
      menuEl && !menuEl.contains(ev.target)
    ) {
      closeMenu();
    }
  }

  function onKeyDown(ev) {
    if (!openMenu) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeMenu();
      triggerEl?.focus();
    }
    if (ev.key === 'Enter') {
      // первый match выбираем
      const first = filtered[0]?.items?.[0];
      if (first) selectPair(first);
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
  });
  onDestroy(() => {
    document.removeEventListener('mousedown', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  });
</script>

<div class="pair-picker">
  <button
    type="button"
    class="pair-trigger"
    bind:this={triggerEl}
    on:click={toggleMenu}
    aria-haspopup="listbox"
    aria-expanded={openMenu}
  >
    <span class="pair-trigger-value">{value || 'Выбрать инструмент'}</span>
    <span class="pair-trigger-caret" class:open={openMenu}>▾</span>
  </button>

  {#if openMenu}
    <div class="pair-menu" bind:this={menuEl} role="listbox">
      <input
        bind:this={searchInput}
        bind:value={search}
        class="pair-search"
        type="text"
        placeholder="Поиск (например USD, JPY, BTC)…"
      />

      {#if filtered.length === 0}
        <div class="pair-empty">Ничего не найдено</div>
      {/if}

      {#each filtered as cat}
        <div class="pair-category">
          <div class="pair-category-label">{cat.label}</div>
          <div class="pair-grid">
            {#each cat.items as p}
              <button
                type="button"
                class="pair-item"
                class:active={p === value}
                on:click={() => selectPair(p)}
                role="option"
                aria-selected={p === value}
              >{p}</button>
            {/each}
          </div>
        </div>
      {/each}

      <div class="pair-footer">
        Всего инструментов: {PAIRS.length}{search ? ` · показано ${filtered.reduce((s, c) => s + c.items.length, 0)}` : ''}
      </div>
    </div>
  {/if}
</div>

<style>
  .pair-picker {
    position: relative;
    width: 100%;
  }
  .pair-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-strong);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .pair-trigger:hover { border-color: var(--border-strong); }
  .pair-trigger-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .pair-trigger-caret {
    margin-left: 8px;
    color: var(--text-muted);
    transition: transform 120ms;
  }
  .pair-trigger-caret.open { transform: rotate(180deg); }

  .pair-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 460px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    box-shadow: var(--shadow);
    padding: 8px;
  }
  .pair-search {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    border-radius: 3px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .pair-search:focus { outline: 1px solid var(--accent); }

  .pair-empty {
    padding: 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .pair-category { margin-bottom: 8px; }
  .pair-category:last-child { margin-bottom: 0; }
  .pair-category-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    font-weight: 700;
    padding: 4px 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .pair-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
  .pair-item {
    padding: 5px 6px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    border-radius: 2px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    cursor: pointer;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: background 100ms, border-color 100ms;
  }
  .pair-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    color: var(--text-strong);
  }
  .pair-item.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
  }

  .pair-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--border);
    font-size: 10.5px;
    color: var(--text-muted);
    text-align: right;
  }
</style>
