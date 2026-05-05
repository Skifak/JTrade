<script>
  import { createEventDispatcher } from 'svelte';
  import { JOURNAL_TOUR_STEPS, getJournalTourBlock } from '../lib/journalTour.js';
  import { listProfileTourSubstepTitles } from '../lib/journalTourProfileSubsteps.js';

  const dispatch = createEventDispatcher();

  export let open = false;
  /** Текущий индекс шага в JOURNAL_TOUR_STEPS */
  export let currentStepIndex = 0;
  export let tourOpen = false;
  export let profileSubIndex = 0;
  export let profileCompletedOnce = false;
  /** @type {{ hideBasicsSection: boolean, currencySelectableInProfile: boolean }} */
  export let profileProgressCtx = {
    hideBasicsSection: false,
    currencySelectableInProfile: false
  };

  $: profileStepIndex = JOURNAL_TOUR_STEPS.findIndex((s) => s.id === 'profile');
  $: profileSubTitles = listProfileTourSubstepTitles(profileProgressCtx);

  function close() {
    open = false;
  }

  /** @param {number} idx */
  function mainDone(idx) {
    return currentStepIndex > idx;
  }

  /** @param {number} idx */
  function mainCurrent(idx) {
    return tourOpen && currentStepIndex === idx;
  }

  /** @param {number} si */
  function profDone(si) {
    if (profileStepIndex < 0) return false;
    if (currentStepIndex < profileStepIndex) return false;
    if (currentStepIndex > profileStepIndex || profileCompletedOnce) return true;
    return si < profileSubIndex;
  }

  /** @param {number} si */
  function profCurrent(si) {
    if (!tourOpen || profileStepIndex < 0 || profileCompletedOnce) return false;
    if (currentStepIndex !== profileStepIndex) return false;
    return si === profileSubIndex;
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }

  function onGlobalKeydown(/** @type {KeyboardEvent} */ e) {
    if (open && e.key === 'Escape') close();
  }

  /** @param {string} blockId */
  function requestJumpBlock(blockId) {
    dispatch('jumpBlock', { blockId });
    close();
  }
</script>

<svelte:window on:keydown={onGlobalKeydown} />

{#if open}
  <div
    class="jtp-backdrop"
    role="presentation"
    on:click={onBackdrop}
    on:keydown={(e) => e.key === 'Escape' && close()}
    tabindex="-1"
  >
    <div
      class="jtp-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jtp-title"
      on:click|stopPropagation
    >
      <div class="jtp-head">
        <h2 id="jtp-title" class="jtp-title">Прогресс обучения</h2>
        <button type="button" class="jtp-close btn btn-sm" on:click={close} aria-label="Закрыть">×</button>
      </div>
      <p class="jtp-lede">
        Чеклист по блокам. «К началу блока» — перейти к первому шагу темы (тур откроется, если был закрыт). Галочка — шаг пройден;
        «сейчас» — текущий шаг (если тур открыт).
      </p>

      <div class="jtp-scroll">
        {#each JOURNAL_TOUR_STEPS as st, idx (st.id)}
          {#if idx === 0 || st.blockId !== JOURNAL_TOUR_STEPS[idx - 1].blockId}
            {@const blk = getJournalTourBlock(st.blockId)}
            <div class="jtp-block">
              <div class="jtp-block-head">
                <div class="jtp-block-text">
                  <div class="jtp-block-title">{blk?.label ?? st.blockId}</div>
                  {#if blk?.lede}
                    <div class="jtp-block-lede">{blk.lede}</div>
                  {/if}
                </div>
                <button
                  type="button"
                  class="btn btn-sm jtp-block-jump"
                  on:click|stopPropagation={() => requestJumpBlock(st.blockId)}
                >
                  К началу блока
                </button>
              </div>
            </div>
          {/if}

          <div
            class="jtp-step"
            class:jtp-step--done={mainDone(idx)}
            class:jtp-step--current={mainCurrent(idx)}
          >
            <span class="jtp-step-icon" aria-hidden="true">
              {#if mainDone(idx)}
                ✓
              {:else if mainCurrent(idx)}
                ◉
              {:else}
                ○
              {/if}
            </span>
            <div class="jtp-step-body">
              <div class="jtp-step-label">{st.progressLabel || st.title}</div>
              <div class="jtp-step-meta">{st.title}</div>
            </div>
          </div>

          {#if st.id === 'profile' && profileSubTitles.length}
            <ul class="jtp-subs" aria-label="Подшаги профиля">
              {#each profileSubTitles as subTitle, si (si)}
                <li
                  class="jtp-sub"
                  class:jtp-sub--done={profDone(si)}
                  class:jtp-sub--current={profCurrent(si)}
                >
                  <span class="jtp-sub-icon" aria-hidden="true">
                    {#if profDone(si)}
                      ✓
                    {:else if profCurrent(si)}
                      ◉
                    {:else}
                      ·
                    {/if}
                  </span>
                  {subTitle}
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      </div>

      <div class="jtp-footer">
        <button type="button" class="btn btn-primary btn-sm" on:click={close}>Закрыть</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .jtp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 13740;
    background: color-mix(in srgb, var(--bg-0, #0b0f14) 55%, rgba(0, 0, 0, 0.35));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
    backdrop-filter: blur(3px);
  }

  .jtp-dialog {
    width: min(420px, 100%);
    max-height: min(76vh, 560px);
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 10%, var(--bg-2)),
      var(--bg-2)
    );
    box-shadow:
      0 24px 60px color-mix(in srgb, var(--text) 18%, transparent),
      0 0 0 1px color-mix(in srgb, var(--text) 6%, transparent);
    box-sizing: border-box;
  }

  .jtp-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 8px;
    border-bottom: 1px solid var(--border);
  }

  .jtp-title {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    color: var(--text-strong);
    line-height: 1.25;
  }

  .jtp-close {
    flex-shrink: 0;
    min-width: 28px;
    padding: 0 6px;
    font-size: 18px;
    line-height: 1;
    border-radius: 6px;
  }

  .jtp-lede {
    margin: 0;
    padding: 10px 16px 12px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .jtp-scroll {
    overflow: auto;
    padding: 10px 12px 12px;
    flex: 1;
    min-height: 0;
  }

  .jtp-block {
    margin-top: 10px;
    margin-bottom: 6px;
  }
  .jtp-block:first-child {
    margin-top: 0;
  }

  .jtp-block-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .jtp-block-text {
    min-width: 0;
  }

  .jtp-block-jump {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-2));
  }

  .jtp-block-jump:hover {
    border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-2));
  }

  .jtp-block-title {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .jtp-block-lede {
    margin-top: 3px;
    font-size: 10.5px;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .jtp-step {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 8px;
    margin: 2px 0;
    border-radius: 8px;
    border: 1px solid transparent;
  }

  .jtp-step--current {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    background: color-mix(in srgb, var(--accent) 7%, var(--bg));
  }

  .jtp-step--done .jtp-step-icon {
    color: var(--accent);
    font-weight: 800;
  }

  .jtp-step--current .jtp-step-icon {
    color: var(--accent);
  }

  .jtp-step-icon {
    flex-shrink: 0;
    width: 1.2em;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .jtp-step-label {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-strong);
    line-height: 1.3;
  }

  .jtp-step-meta {
    font-size: 10.5px;
    color: var(--text-muted);
    margin-top: 2px;
    line-height: 1.35;
  }

  .jtp-subs {
    list-style: none;
    margin: 0 0 8px 0;
    padding: 0 0 0 26px;
  }

  .jtp-subs--muted {
    opacity: 0.92;
  }

  .jtp-sub {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text);
    padding: 3px 0;
  }

  .jtp-sub--hint {
    color: var(--text-muted);
  }

  .jtp-sub--done .jtp-sub-icon {
    color: var(--accent);
    font-weight: 700;
  }

  .jtp-sub--current {
    font-weight: 600;
    color: var(--text-strong);
  }

  .jtp-sub-icon {
    flex-shrink: 0;
    width: 1em;
    text-align: center;
    font-size: 11px;
    color: var(--text-muted);
  }

  .jtp-footer {
    padding: 10px 16px 14px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
  }
</style>
