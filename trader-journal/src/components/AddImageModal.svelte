<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Modal from './Modal.svelte';
  import { convertToWebP, formatKb } from '../lib/imageCompress.js';

  /** @type {boolean} */
  export let open = false;

  const dispatch = createEventDispatcher();

  let fileInput;
  let zoneEl;
  let previewUrl = '';
  let busy = false;
  let err = '';
  /** @type {Blob | null} */
  let resultBlob = null;
  let resultSize = 0;

  function clearPreview() {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        // ignore
      }
    }
    previewUrl = '';
    resultBlob = null;
    resultSize = 0;
    err = '';
  }

  $: if (!open) {
    clearPreview();
  }

  $: if (open) {
    void focusZone();
  }

  async function focusZone() {
    await tick();
    zoneEl?.focus();
  }

  function handlePaste(/** @type {ClipboardEvent} */ e) {
    if (!open) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'string') continue;
      if (it.type && it.type.indexOf('image') === 0) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) {
          void handleIncoming(f);
        }
        return;
      }
    }
  }

  function onFileChange(/** @type {Event} */ e) {
    const t = e.target;
    const f = t && 'files' in t ? t.files?.[0] : null;
    if (t) t.value = '';
    if (f) void handleIncoming(f);
  }

  function onDrop(/** @type {DragEvent} */ e) {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) {
      void handleIncoming(f);
    } else if (f) {
      err = 'Нужен файл изображения';
    }
  }

  async function handleIncoming(/** @type {File} */ f) {
    if (!f.type.startsWith('image/')) {
      err = 'Только изображения (JPG, PNG, WebP, …)';
      return;
    }
    err = '';
    busy = true;
    clearPreview();
    try {
      const r = await convertToWebP(f);
      resultBlob = r.blob;
      resultSize = r.size;
      previewUrl = URL.createObjectURL(r.blob);
    } catch (c) {
      console.error(c);
      err = 'Не удалось обработать файл';
    } finally {
      busy = false;
    }
  }

  function commit() {
    if (!resultBlob) return;
    dispatch('add', { blob: resultBlob, ext: 'webp' });
  }

  function requestClose() {
    dispatch('close');
  }
</script>

<svelte:window
  on:paste={(e) => {
    if (!open) return;
    handlePaste(e);
  }}
/>

<Modal {open} modalClass="add-img-modal" on:close={requestClose}>
  <div slot="header">
    <h2>Добавить фото</h2>
  </div>
  <div slot="body" class="add-img-body">
    <p class="add-img-hint">
      Всё сохраняется как WebP. Ctrl+V — скрин · клик — файл из проводника · можно перетащить.
    </p>

    <div
      class="add-img-zone"
      class:add-img-zone--busy={busy}
      bind:this={zoneEl}
      tabindex="0"
      role="button"
      aria-label="Область вставки и выбора файла"
      on:click|stopPropagation={() => fileInput?.click()}
      on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInput?.click())}
      on:dragover|preventDefault
      on:dragleave|preventDefault
      on:drop|stopPropagation|preventDefault={onDrop}
    >
      {#if busy}
        <span class="add-img-skel">WebP…</span>
      {:else if previewUrl}
        <img src={previewUrl} class="add-img-preview" alt="Превью" />
      {:else}
        <span class="add-img-placeholder">Сюда: вставь скрин или кликни для выбора файла</span>
      {/if}
    </div>

    <input
      type="file"
      class="add-img-inp"
      accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
      bind:this={fileInput}
      on:change={onFileChange}
    />

    {#if resultBlob && !busy}
      <p class="add-img-meta">WebP · {formatKb(resultSize)}</p>
    {/if}
    {#if err}
      <p class="add-img-err" role="alert">{err}</p>
    {/if}
  </div>
  <div slot="footer" class="add-img-foot">
    <button type="button" class="btn" on:click={requestClose}>Отмена</button>
    <button type="button" class="btn btn-primary" disabled={!resultBlob || busy} on:click={commit}
      >Добавить</button
    >
  </div>
</Modal>

<style>
  :global(.add-img-modal .modal-body) {
    max-height: min(80vh, 640px);
  }
  .add-img-body {
    min-width: min(100%, 420px);
  }
  .add-img-hint {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .add-img-zone {
    min-height: 200px;
    max-height: min(50vh, 400px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    border: 2px dashed var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    cursor: pointer;
    outline: none;
  }
  .add-img-zone:hover,
  .add-img-zone:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .add-img-zone--busy {
    cursor: wait;
    opacity: 0.9;
  }
  .add-img-placeholder {
    text-align: center;
    font-size: 14px;
    color: var(--text-muted);
    padding: 8px;
  }
  .add-img-skel {
    font-size: 14px;
    color: var(--text);
  }
  .add-img-preview {
    max-width: 100%;
    max-height: min(50vh, 400px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 6px;
  }
  .add-img-inp {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .add-img-meta {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .add-img-err {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--loss);
  }
  .add-img-foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
