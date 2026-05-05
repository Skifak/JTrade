<script>
  import { tick, onDestroy } from 'svelte';
  import {
    resolveSourceIds,
    sourceIdsHaveMultipleAuthors,
    getChunkSegments
  } from '../lib/adviceSourcesRegistry';

  /** @type {string[]} */
  export let sourceIds = [];

  let open = false;
  /** @type {HTMLElement | undefined} */
  let wrapEl;

  /** @type {'rufat' | 'victor'} */
  let authorTab = 'rufat';

  $: resolved = resolveSourceIds(sourceIds);
  $: multiAuthorPanel = sourceIdsHaveMultipleAuthors(sourceIds);
  $: rufatRows = resolved.filter((r) => r.chunk.authorKey === 'rufat');
  $: victorRows = resolved.filter((r) => r.chunk.authorKey === 'victor');

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
    authorTab = 'rufat';
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

{#if resolved.length}
  <span class="jsh-wrap" bind:this={wrapEl}>
    <span
      class="jsh-trigger"
      tabindex="0"
      role="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Оригиналы постов"
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
      aria-label="Тексты авторов"
      aria-hidden={!open}
    >
      <div class="jsh-panel-head">
        <span class="jsh-panel-title">Оригиналы</span>
        <button type="button" class="jsh-close" aria-label="Закрыть" on:click={closePanel}>×</button>
      </div>
      <div class="jsh-panel-scroll">
        {#if multiAuthorPanel}
          <div class="jsh-tabs" role="tablist" aria-label="Автор">
            <button
              type="button"
              role="tab"
              class="jsh-tab"
              class:jsh-tab--active={authorTab === 'rufat'}
              aria-selected={authorTab === 'rufat'}
              on:click={() => (authorTab = 'rufat')}
            >Руфат</button>
            <button
              type="button"
              role="tab"
              class="jsh-tab"
              class:jsh-tab--active={authorTab === 'victor'}
              aria-selected={authorTab === 'victor'}
              on:click={() => (authorTab = 'victor')}
            >Виктор</button>
          </div>
        {/if}

        {#if multiAuthorPanel}
          {#if authorTab === 'rufat'}
            <div class="jsh-tab-panel" role="tabpanel">
              {#each rufatRows as row (row.id)}
                <article class="jsh-post">
                  <header class="jsh-author-bar">
                    <a
                      href={row.chunk.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="jsh-author-link"
                    >{row.chunk.authorName}</a>
                  </header>
                  <div class="jsh-post-body">
                    {#each getChunkSegments(row.chunk) as seg, si (si)}
                      {#if seg.type === 'text'}{seg.value}{:else}
                        <a
                          href={seg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="jsh-inline-link"
                        >{seg.text}</a>
                      {/if}
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="jsh-tab-panel" role="tabpanel">
              {#each victorRows as row (row.id)}
                <article class="jsh-post">
                  <header class="jsh-author-bar">
                    <a
                      href={row.chunk.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="jsh-author-link"
                    >{row.chunk.authorName}</a>
                  </header>
                  <div class="jsh-post-body">
                    {#each getChunkSegments(row.chunk) as seg, si (si)}
                      {#if seg.type === 'text'}{seg.value}{:else}
                        <a
                          href={seg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="jsh-inline-link"
                        >{seg.text}</a>
                      {/if}
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        {:else}
          {#each resolved as row (row.id)}
            <article class="jsh-post">
              <header class="jsh-author-bar">
                <a
                  href={row.chunk.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="jsh-author-link"
                >{row.chunk.authorName}</a>
              </header>
              <div class="jsh-post-body">
                {#each getChunkSegments(row.chunk) as seg, si (si)}
                  {#if seg.type === 'text'}{seg.value}{:else}
                    <a
                      href={seg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="jsh-inline-link"
                    >{seg.text}</a>
                  {/if}
                {/each}
              </div>
            </article>
          {/each}
        {/if}
      </div>
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
  }
  .jsh-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    gap: 0;
    margin: 0 0 10px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-2);
  }
  .jsh-tab {
    margin: 0;
    padding: 9px 10px;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .jsh-tab:last-child {
    border-right: none;
  }
  .jsh-tab:hover {
    color: var(--text-strong);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
  .jsh-tab--active {
    color: var(--text-strong);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  }
  .jsh-tab-panel {
    min-height: 0;
  }
  .jsh-post {
    margin-bottom: 14px;
  }
  .jsh-post:last-child {
    margin-bottom: 0;
  }
  .jsh-author-bar {
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    background: color-mix(in srgb, var(--accent) 7%, var(--bg));
  }
  .jsh-author-link {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
  }
  .jsh-author-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .jsh-post-body {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
  }
  .jsh-inline-link {
    color: var(--accent);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .jsh-inline-link:hover {
    color: color-mix(in srgb, var(--accent) 85%, var(--text));
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
