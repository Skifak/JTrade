<script>
  import { onDestroy, tick, createEventDispatcher, onMount } from 'svelte';

  /** @type {import('../lib/journalTour.js').JournalTourStep | null} */
  export let step = null;
  export let stepIndex = 0;
  export let totalSteps = 1;
  export let open = false;
  /** Подпись тематического блока (HUD, сделки, …). */
  export let blockLabel = '';
  /** Подсветка: `data-tour` (если не задано — берётся из step.target). */
  export let spotlightTarget = null;
  /** Есть следующий блок для «Пропустить блок». */
  export let canSkipBlock = false;
  /** Сдвигается при смене шага / подшага профиля — перевесить класс свечения. */
  export let tourGlowKey = '';
  /**
   * Подшаг профиля в основной панели (null — не показывать).
   * @type {{ index: number, total: number, title: string, hint: string, showAdvance: boolean } | null}
   */
  export let profileSubstep = null;

  const dispatch = createEventDispatcher();

  const GLOW = 'journal-tour-glow-field';

  function spotTarget() {
    if (spotlightTarget) return spotlightTarget;
    return step?.target ?? null;
  }

  /** @type {HTMLDivElement | null} */
  let tourPanelEl = null;

  let openRef = false;
  /** @type {import('../lib/journalTour.js').JournalTourStep | null} */
  let stepRef = null;
  $: openRef = open;
  $: stepRef = step;

  /** @type {HTMLElement | null} */
  let lastGlowEl = null;

  /** Угол экрана: bl | br | tl | tr */
  let panelCorner = 'bl';

  const PANEL_MARGIN = 14;
  const TARGET_AVOID_PAD = 20;

  /** @param {{ left: number, top: number, right: number, bottom: number }} a */
  /** @param {{ left: number, top: number, right: number, bottom: number }} b */
  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  /** @param {{ left: number, top: number, right: number, bottom: number }} a */
  /** @param {{ left: number, top: number, right: number, bottom: number }} b */
  function overlapArea(a, b) {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  }

  /**
   * @param {'bl' | 'br' | 'tl' | 'tr'} corner
   * @param {number} pw
   * @param {number} ph
   */
  function panelRectForCorner(corner, pw, ph) {
    const m = PANEL_MARGIN;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    switch (corner) {
      case 'bl':
        return { left: m, top: vh - m - ph, right: m + pw, bottom: vh - m };
      case 'br':
        return { left: vw - m - pw, top: vh - m - ph, right: vw - m, bottom: vh - m };
      case 'tl':
        return { left: m, top: m, right: m + pw, bottom: m + ph };
      case 'tr':
        return { left: vw - m - pw, top: m, right: vw - m, bottom: m + ph };
      default:
        return { left: m, top: vh - m - ph, right: m + pw, bottom: vh - m };
    }
  }

  /** @param {HTMLElement | null} targetEl */
  function positionTourPanel(targetEl) {
    if (typeof window === 'undefined' || !tourPanelEl) return;

    const pw = tourPanelEl.offsetWidth;
    const ph = tourPanelEl.offsetHeight;
    if (pw <= 0 || ph <= 0) {
      panelCorner = 'bl';
      return;
    }

    let avoid = null;
    if (targetEl instanceof HTMLElement) {
      const r = targetEl.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        const p = TARGET_AVOID_PAD;
        avoid = { left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p };
      }
    }

    if (!avoid) {
      panelCorner = 'bl';
      return;
    }

    /** @type {Array<'bl' | 'br' | 'tl' | 'tr'>} */
    const order = ['bl', 'br', 'tl', 'tr'];
    for (const c of order) {
      const pr = panelRectForCorner(c, pw, ph);
      if (!rectsOverlap(pr, avoid)) {
        panelCorner = c;
        return;
      }
    }

    let best = 'bl';
    let minOv = Infinity;
    for (const c of order) {
      const pr = panelRectForCorner(c, pw, ph);
      const ov = overlapArea(pr, avoid);
      if (ov < minOv) {
        minOv = ov;
        best = c;
      }
    }
    panelCorner = best;
  }

  function clearTourGlow() {
    if (lastGlowEl) {
      lastGlowEl.classList.remove(GLOW);
      lastGlowEl = null;
    }
  }

  async function syncTourTargetGlow() {
    clearTourGlow();
    panelCorner = 'bl';
    if (!open || !step) return;

    const st = spotTarget();
    if (!st) {
      await tick();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      positionTourPanel(null);
      return;
    }

    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    let el = document.querySelector(`[data-tour="${st}"]`);
    if (!(el instanceof HTMLElement)) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      el = document.querySelector(`[data-tour="${st}"]`);
    }
    if (el instanceof HTMLElement) {
      el.classList.add(GLOW);
      lastGlowEl = el;
    }

    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    positionTourPanel(lastGlowEl);
    await tick();
    positionTourPanel(lastGlowEl);
  }

  $: if (open && step) {
    void step.id;
    void step.target;
    void spotlightTarget;
    void tourGlowKey;
    void profileSubstep;
    syncTourTargetGlow();
  } else if (!open) {
    clearTourGlow();
    panelCorner = 'bl';
  }

  /** @param {MouseEvent} e */
  function onDocumentClickCapture(e) {
    if (!openRef || !stepRef?.continueTourTarget) return;
    if (e.button !== 0) return;
    if (tourPanelEl?.contains(/** @type {Node} */ (e.target))) return;

    const zone = document.querySelector(`[data-tour="${stepRef.continueTourTarget}"]`);
    if (!zone || !(zone instanceof HTMLElement)) return;
    if (!zone.contains(/** @type {Node} */ (e.target))) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    dispatch('next');
  }

  function scheduleGlowResync() {
    if (open && step) syncTourTargetGlow();
  }

  onMount(() => {
    document.addEventListener('click', onDocumentClickCapture, true);
    window.addEventListener('resize', scheduleGlowResync);
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true);
      window.removeEventListener('resize', scheduleGlowResync);
    };
  });

  onDestroy(() => {
    clearTourGlow();
  });

  function next() {
    dispatch('next');
  }
  function prev() {
    dispatch('prev');
  }
  function close() {
    dispatch('close');
  }
</script>

{#if open && step}
  <div
    bind:this={tourPanelEl}
    class="tour-panel tour-panel--{panelCorner}"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-panel-title"
    tabindex="-1"
  >
    <div class="tour-panel-head">
      <div class="tour-panel-head-row">
        <span class="tour-step-badge">Шаг {stepIndex + 1} / {totalSteps}</span>
        {#if blockLabel}
          <span class="tour-block-badge">{blockLabel}</span>
        {/if}
      </div>
      <h2 id="tour-panel-title" class="tour-panel-title">{step.title}</h2>
    </div>
    <p class="tour-panel-body">{step.body}</p>
    {#if step.actionHint}
      <p class="tour-panel-hint">{step.actionHint}</p>
    {/if}
    {#if profileSubstep}
      <div class="tour-profile-sub" aria-live="polite">
        <div class="tour-profile-sub-meta">
          Подшаг {profileSubstep.index + 1} / {profileSubstep.total}
        </div>
        <div class="tour-profile-sub-title">{profileSubstep.title}</div>
        <p class="tour-profile-sub-hint">{profileSubstep.hint}</p>
        {#if profileSubstep.showAdvance}
          <button
            type="button"
            class="btn btn-sm btn-primary tour-profile-sub-advance"
            on:click={() => dispatch('profileSubNext')}
          >
            Далее по полю
          </button>
        {/if}
      </div>
    {/if}
    <div class="tour-panel-progress-row">
      <button type="button" class="btn btn-sm tour-progress-btn" on:click={() => dispatch('progress')}>
        Прогресс обучения
      </button>
    </div>
    {#if canSkipBlock}
      <div class="tour-panel-skip-row">
        <button type="button" class="btn btn-sm tour-skip-block-btn" on:click={() => dispatch('skipBlock')}>
          Пропустить блок
        </button>
      </div>
    {/if}
    <div class="tour-panel-actions">
      <button type="button" class="btn btn-sm" on:click={close}>Закрыть обучение</button>
      <div class="tour-panel-nav">
        <button type="button" class="btn btn-sm" disabled={stepIndex <= 0} on:click={prev}>Назад</button>
        {#if stepIndex >= totalSteps - 1}
          <button type="button" class="btn btn-sm btn-primary" on:click={close}>Готово</button>
        {:else}
          <button type="button" class="btn btn-sm btn-primary" on:click={next}>Далее</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .tour-panel {
    position: fixed;
    z-index: 13660;
    transform: none;
    width: min(320px, calc(100vw - 24px));
    max-height: min(38vh, 360px);
    overflow: auto;
    padding: 11px 12px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 9%, var(--bg-2)),
      var(--bg-2)
    );
    box-shadow:
      0 12px 36px color-mix(in srgb, var(--text) 16%, transparent),
      0 0 0 1px color-mix(in srgb, var(--text) 5%, transparent);
    box-sizing: border-box;
  }

  .tour-panel--bl {
    left: 14px;
    bottom: 14px;
    right: auto;
    top: auto;
  }
  .tour-panel--br {
    right: 14px;
    bottom: 14px;
    left: auto;
    top: auto;
  }
  .tour-panel--tl {
    left: 14px;
    top: 14px;
    right: auto;
    bottom: auto;
  }
  .tour-panel--tr {
    right: 14px;
    top: 14px;
    left: auto;
    bottom: auto;
  }

  .tour-panel-head {
    margin-bottom: 6px;
  }
  .tour-panel-head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .tour-step-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0;
  }
  .tour-block-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--text-strong);
  }
  .tour-panel-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--text-strong);
    line-height: 1.25;
  }
  .tour-panel-body {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.48;
    color: var(--text);
  }
  .tour-panel-hint {
    margin: 0 0 8px;
    padding: 7px 9px;
    border-radius: 7px;
    font-size: 11px;
    line-height: 1.42;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--accent) 7%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
  }

  .tour-profile-sub {
    margin: 0 0 10px;
    padding: 10px 11px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 14%, var(--bg-2)),
      color-mix(in srgb, var(--accent) 5%, var(--bg-2))
    );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text) 8%, transparent),
      0 4px 14px color-mix(in srgb, var(--accent) 10%, transparent);
    box-sizing: border-box;
  }
  .tour-profile-sub-meta {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .tour-profile-sub-title {
    font-size: 12.5px;
    font-weight: 800;
    color: var(--text-strong);
    line-height: 1.3;
    margin: 0 0 6px;
  }
  .tour-profile-sub-hint {
    margin: 0 0 10px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text);
  }
  .tour-profile-sub-advance {
    width: 100%;
    justify-content: center;
    font-weight: 700;
  }
  .tour-panel-progress-row {
    margin: 0 0 6px;
  }

  .tour-panel-skip-row {
    margin: 0 0 8px;
  }

  .tour-skip-block-btn {
    width: 100%;
    justify-content: center;
    border-style: dashed;
    border-color: color-mix(in srgb, var(--warning, #b45309) 40%, var(--border));
    color: var(--text-muted);
    font-weight: 600;
    font-size: 11px;
  }

  .tour-skip-block-btn:hover {
    border-color: color-mix(in srgb, var(--warning, #b45309) 65%, var(--border));
    color: var(--text-strong);
  }
  .tour-progress-btn {
    width: 100%;
    justify-content: center;
    border-style: dashed;
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, var(--bg-2));
    color: var(--text-strong);
    font-weight: 600;
    font-size: 11px;
  }
  .tour-progress-btn:hover {
    background: color-mix(in srgb, var(--accent) 11%, var(--bg-2));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .tour-panel-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .tour-panel-nav {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
</style>
