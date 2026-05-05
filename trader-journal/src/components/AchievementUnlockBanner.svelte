<script>
  import { createEventDispatcher } from 'svelte';

  /** @type {Array<{ id: string, title: string, body: string }>} */
  export let queue = [];

  const dispatch = createEventDispatcher();

  $: current = queue.length ? queue[0] : null;

  function dismiss() {
    dispatch('dismiss');
  }

  function openAchievements() {
    dispatch('openAchievements');
  }
</script>

{#if current}
  <div class="ach-banner" role="status">
    <div class="ach-banner-inner">
      <div class="ach-banner-kicker">Достижение</div>
      <div class="ach-banner-title">{current.title}</div>
      <p class="ach-banner-body">{current.body}</p>
      <div class="ach-banner-actions">
        <button type="button" class="btn btn-primary btn-sm" on:click={openAchievements}>Открыть достижение</button>
        <button type="button" class="btn btn-sm" on:click={dismiss}>Закрыть</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ach-banner {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 12000;
    max-width: 340px;
    width: calc(100vw - 36px);
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--accent) 12%, var(--bg-2)),
      var(--bg-2)
    );
    box-shadow:
      0 14px 40px color-mix(in srgb, var(--text) 18%, transparent),
      0 0 0 1px color-mix(in srgb, var(--text) 6%, transparent);
    box-sizing: border-box;
    animation: ach-pop 0.35s ease-out;
  }
  @keyframes ach-pop {
    from {
      transform: translateY(12px) scale(0.97);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
  .ach-banner-inner {
    padding: 14px 16px 16px;
  }
  .ach-banner-kicker {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .ach-banner-title {
    font-size: 14px;
    font-weight: 800;
    color: var(--text-strong);
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .ach-banner-body {
    margin: 0 0 12px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text);
    max-height: 7.5em;
    overflow: auto;
  }
  .ach-banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
