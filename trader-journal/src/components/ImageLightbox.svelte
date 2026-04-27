<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  /** @type {boolean} */
  export let open = false;
  /** @type {boolean} */
  export let deletable = false;
  /** @type {string[]} object URLs from attachmentApi */
  export let urls = [];
  export let startIndex = 0;
  let index = 0;
  let prevOpen = false;
  $: {
    if (open && !prevOpen && urls.length) {
      index = Math.min(Math.max(0, startIndex), urls.length - 1);
    }
    prevOpen = open;
  }
  $: if (open && urls.length) {
    index = Math.min(index, urls.length - 1);
  }

  $: current = urls[index] || '';

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }

  function next() {
    if (urls.length < 2) return;
    index = (index + 1) % urls.length;
  }
  function prev() {
    if (urls.length < 2) return;
    index = (index - 1 + urls.length) % urls.length;
  }

  function close() {
    open = false;
  }

  function del() {
    dispatch('remove', { index });
  }

</script>

<svelte:window on:keydown={onKey} />

{#if open && current}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="ilb-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Просмотр изображения"
    tabindex="-1"
    on:click|self={close}
  >
    <button type="button" class="ilb-close" on:click={close} aria-label="Закрыть">×</button>
    {#if deletable && urls.length}
      <button type="button" class="ilb-trash" on:click|stopPropagation={del} title="Удалить это фото"
        >🗑</button
      >
    {/if}
    {#if urls.length > 1}
      <button type="button" class="ilb-nav ilb-prev" on:click|stopPropagation={prev} aria-label="Предыдущее"
        >‹</button
      >
      <button type="button" class="ilb-nav ilb-next" on:click|stopPropagation={next} aria-label="Следующее"
        >›</button
      >
      <div class="ilb-count">{index + 1} / {urls.length}</div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ilb-frame" on:click|stopPropagation>
      <img src={current} alt="" class="ilb-img" />
    </div>
  </div>
{/if}

<style>
  .ilb-overlay {
    position: fixed;
    inset: 0;
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: min(3vh, 28px) min(3vw, 32px);
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.9);
  }
  .ilb-frame {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ilb-img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  }
  .ilb-close {
    position: fixed;
    top: min(2vh, 16px);
    right: min(2vw, 20px);
    z-index: 20001;
    width: 44px;
    height: 44px;
    font-size: 28px;
    line-height: 1;
    border: 1px solid color-mix(in srgb, #fff 35%, transparent);
    border-radius: 8px;
    background: rgba(20, 20, 20, 0.6);
    color: #fff;
    cursor: pointer;
  }
  .ilb-close:hover {
    background: rgba(40, 40, 40, 0.85);
  }
  .ilb-trash {
    position: fixed;
    top: min(2vh, 16px);
    right: min(calc(2vw + 52px), 80px);
    z-index: 20001;
    width: 44px;
    height: 44px;
    font-size: 18px;
    line-height: 1;
    border: 1px solid color-mix(in srgb, #fff 35%, transparent);
    border-radius: 8px;
    background: rgba(20, 20, 20, 0.6);
    color: #fff;
    cursor: pointer;
  }
  .ilb-trash:hover {
    background: rgba(100, 30, 30, 0.85);
  }
  .ilb-nav {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 20001;
    width: 48px;
    height: 72px;
    font-size: 36px;
    line-height: 1;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid color-mix(in srgb, #fff 25%, transparent);
    border-radius: 8px;
    cursor: pointer;
  }
  .ilb-nav:hover {
    background: rgba(0, 0, 0, 0.55);
  }
  .ilb-prev {
    left: min(2vw, 20px);
  }
  .ilb-next {
    right: min(2vw, 20px);
  }
  .ilb-count {
    position: fixed;
    bottom: min(2vh, 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20001;
    font-size: 13px;
    color: #ddd;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 8px;
  }
</style>
