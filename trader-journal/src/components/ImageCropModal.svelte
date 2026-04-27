<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';

  /** @type {boolean} */
  export let open = false;
  /** @type {string | null} */
  export let itemId = null;
  /** @type {Blob | null} */
  export let sourceBlob = null;

  const dispatch = createEventDispatcher();

  /** @type {HTMLImageElement | undefined} */
  let imgEl;
  let objectUrl = '';
  /** @type {InstanceType<typeof Cropper> | null} */
  let cropper = null;
  /** @type {ReturnType<typeof cloneData>[] } */
  let dataHistory = [];
  let debTimer = 0;

  function cloneData(/** @type {object} */ d) {
    return JSON.parse(JSON.stringify(d));
  }

  function nearlySame(/** @type {any} */ a, /** @type {any} */ b) {
    if (!a || !b) return false;
    const k = ['x', 'y', 'width', 'height', 'rotate', 'scaleX', 'scaleY'];
    return k.every((key) => Math.abs((a[key] ?? 0) - (b[key] ?? 0)) < 0.5);
  }

  function destroyCropper() {
    if (cropper) {
      try {
        cropper.destroy();
      } catch {
        // ignore
      }
      cropper = null;
    }
    dataHistory = [];
  }

  function revokeUrl() {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      objectUrl = '';
    }
  }

  $: if (open && sourceBlob) {
    revokeUrl();
    objectUrl = URL.createObjectURL(sourceBlob);
  } else if (!open) {
    destroyCropper();
    revokeUrl();
  }

  function onCropEndDebounced() {
    if (!cropper) return;
    clearTimeout(debTimer);
    debTimer = window.setTimeout(() => {
      if (!cropper) return;
      const d = cloneData(cropper.getData(true));
      const prev = dataHistory[dataHistory.length - 1];
      if (prev && nearlySame(d, prev)) return;
      dataHistory.push(d);
      if (dataHistory.length > 25) {
        dataHistory = dataHistory.slice(-25);
      }
    }, 380);
  }

  function onImgLoad() {
    if (!open || !imgEl) return;
    destroyCropper();
    cropper = new Cropper(imgEl, {
      viewMode: 1,
      autoCropArea: 1,
      responsive: true,
      background: false
    });
    cropper.on('ready', () => {
      if (!cropper) return;
      dataHistory = [cloneData(cropper.getData(true))];
    });
    cropper.on('cropend', onCropEndDebounced);
  }

  function undo() {
    if (!cropper || dataHistory.length <= 1) return;
    dataHistory.pop();
    const prev = dataHistory[dataHistory.length - 1];
    cropper.setData(prev);
  }

  function save() {
    if (!cropper || !itemId) return;
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 8192,
      maxHeight: 8192,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    canvas.toBlob(
      (b) => {
        if (!b) return;
        dispatch('save', { newBlob: b, itemId });
      },
      'image/webp',
      0.92
    );
  }

  function close() {
    dispatch('close');
  }

  onDestroy(() => {
    if (debTimer) {
      clearTimeout(debTimer);
    }
    destroyCropper();
    revokeUrl();
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="icrop-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Обрезка"
    tabindex="-1"
    on:click|self={close}
  >
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="icrop-panel" on:click|stopPropagation>
      <div class="icrop-top">
        <h2 class="icrop-title">Обрезка</h2>
        <button type="button" class="icrop-x" on:click={close} aria-label="Закрыть">×</button>
      </div>
      <div class="icrop-body">
        {#if objectUrl}
          <div class="icrop-canvas-wrap">
            {#key objectUrl}
              <img
                bind:this={imgEl}
                class="icrop-target"
                src={objectUrl}
                alt=""
                on:load={onImgLoad}
              />
            {/key}
          </div>
        {/if}
        <p class="icrop-hint">Тяни углы рамки. «Откат» — к предыдущему положению рамки.</p>
      </div>
      <div class="icrop-foot">
        <button type="button" class="btn" on:click={close}>Отмена</button>
        <button
          type="button"
          class="btn"
          disabled={!cropper || dataHistory.length <= 1}
          on:click={undo}
        >Откатить</button>
        <button type="button" class="btn btn-primary" disabled={!cropper} on:click={save}
          >Сохранить</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .icrop-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.65);
  }
  .icrop-panel {
    width: min(96vw, 900px);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-2, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  }
  .icrop-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border, #333);
  }
  .icrop-title {
    margin: 0;
    font-size: 1.1rem;
  }
  .icrop-x {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text, #fff);
    width: 36px;
    height: 36px;
    font-size: 22px;
    line-height: 1;
    border-radius: 6px;
    cursor: pointer;
  }
  .icrop-body {
    padding: 12px 14px;
    overflow: auto;
    min-height: 0;
  }
  .icrop-canvas-wrap {
    max-height: 58vh;
    overflow: hidden;
  }
  :global(.icrop-canvas-wrap .cropper-container) {
    max-height: 58vh;
  }
  .icrop-target {
    display: block;
    max-width: 100%;
    max-height: 58vh;
  }
  .icrop-hint {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--text-muted, #999);
  }
  .icrop-foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 14px 12px;
    border-top: 1px solid var(--border, #333);
  }
</style>
