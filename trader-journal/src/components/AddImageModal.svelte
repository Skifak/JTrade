<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { v4 as uuidv4 } from 'uuid';
  import Modal from './Modal.svelte';
  import ImageCropModal from './ImageCropModal.svelte';
  import { convertToWebP, formatKb } from '../lib/imageCompress.js';

  /** @type {boolean} */
  export let open = false;

  const dispatch = createEventDispatcher();

  let fileInput;
  let zoneEl;
  let busy = false;
  let err = '';

  /** @type { { id: string; url: string; blob: Blob }[] } */
  let queue = [];

  let cropOpen = false;
  /** @type { { id: string; blob: Blob } | null } */
  let cropTarget = null;

  function revokeAll() {
    for (const q of queue) {
      try {
        URL.revokeObjectURL(q.url);
      } catch {
        // ignore
      }
    }
    queue = [];
  }

  $: if (!open) {
    revokeAll();
    err = '';
    cropOpen = false;
    cropTarget = null;
  }

  $: if (open) {
    void focusZone();
  }

  async function focusZone() {
    await tick();
    zoneEl?.focus();
  }

  function handlePaste(/** @type {ClipboardEvent} */ e) {
    if (!open || cropOpen) return;
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
    const list = t && 'files' in t ? t.files : null;
    if (t) t.value = '';
    if (!list?.length) return;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.type.startsWith('image/')) {
        void handleIncoming(f);
      }
    }
  }

  function onDrop(/** @type {DragEvent} */ e) {
    e.preventDefault();
    e.stopPropagation();
    const list = e.dataTransfer?.files;
    if (!list?.length) {
      err = '';
      return;
    }
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.type.startsWith('image/')) {
        any = true;
        void handleIncoming(f);
      }
    }
    err = any ? '' : 'Нужны файлы изображений';
  }

  async function handleIncoming(/** @type {File} */ f) {
    if (!f.type.startsWith('image/')) {
      err = 'Только изображения';
      return;
    }
    err = '';
    busy = true;
    try {
      const r = await convertToWebP(f);
      const id = uuidv4();
      queue = [...queue, { id, url: URL.createObjectURL(r.blob), blob: r.blob }];
    } catch (c) {
      console.error(c);
      err = 'Не удалось обработать файл';
    } finally {
      busy = false;
    }
  }

  function removeItem(/** @type {string} */ id) {
    const q = queue.find((x) => x.id === id);
    if (q) {
      try {
        URL.revokeObjectURL(q.url);
      } catch {
        // ignore
      }
    }
    queue = queue.filter((x) => x.id !== id);
    if (cropTarget?.id === id) {
      cropOpen = false;
      cropTarget = null;
    }
  }

  function openCrop(/** @type {string} */ id) {
    const q = queue.find((x) => x.id === id);
    if (!q) return;
    cropTarget = { id: q.id, blob: q.blob };
    cropOpen = true;
  }

  function closeCrop() {
    cropOpen = false;
    cropTarget = null;
  }

  function onCropped(/** @type {CustomEvent} */ e) {
    const { newBlob, itemId } = e.detail || {};
    if (!newBlob || !itemId) return;
    queue = queue.map((q) => {
      if (q.id !== itemId) return q;
      try {
        URL.revokeObjectURL(q.url);
      } catch {
        // ignore
      }
      return { id: q.id, blob: newBlob, url: URL.createObjectURL(newBlob) };
    });
    closeCrop();
  }

  function commit() {
    if (!queue.length) return;
    dispatch('add', {
      items: queue.map((q) => ({ blob: q.blob, ext: 'webp' }))
    });
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

<ImageCropModal
  open={cropOpen}
  itemId={cropTarget?.id ?? null}
  sourceBlob={cropTarget?.blob ?? null}
  on:close={closeCrop}
  on:save={onCropped}
/>

<Modal {open} modalClass="add-img-modal" on:close={requestClose}>
  <div slot="header">
    <h2>Добавить фото</h2>
  </div>
  <div slot="body" class="add-img-body">
    <p class="add-img-hint">
      Всё сохраняется как WebP. Ctrl+V, клик по области, несколько файлов из проводника или перетаскивание.
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
      {:else}
        <span class="add-img-placeholder">Сюда: вставь скрин, кликни для файлов или перетащи</span>
      {/if}
    </div>

    <input
      type="file"
      class="add-img-inp"
      accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
      multiple
      bind:this={fileInput}
      on:change={onFileChange}
    />

    {#if queue.length}
      <div class="add-img-strip">
        <span class="add-img-strip-lbl">К добавлению ({queue.length})</span>
        <div class="add-img-thumbs">
          {#each queue as q (q.id)}
            <div class="add-img-twrap">
              <button
                type="button"
                class="add-img-tdel"
                title="Убрать из списка"
                aria-label="Удалить"
                on:click|stopPropagation={() => removeItem(q.id)}
              >×</button>
              <button type="button" class="add-img-tbtn" on:click|stopPropagation={() => openCrop(q.id)}>
                <img src={q.url} class="add-img-timg" alt="" />
              </button>
            </div>
          {/each}
        </div>
        <p class="add-img-meta">Итого: {formatKb(queue.reduce((s, q) => s + q.blob.size, 0))}</p>
      </div>
    {/if}
    {#if err}
      <p class="add-img-err" role="alert">{err}</p>
    {/if}
  </div>
  <div slot="footer" class="add-img-foot">
    <button type="button" class="btn" on:click={requestClose}>Отмена</button>
    <button
      type="button"
      class="btn btn-primary"
      disabled={!queue.length || busy}
      on:click={commit}
    >Добавить</button
    >
  </div>
</Modal>

<style>
  :global(.add-img-modal .modal-body) {
    max-height: min(85vh, 720px);
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
  .add-img-inp {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .add-img-strip {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .add-img-strip-lbl {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .add-img-thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-start;
  }
  .add-img-twrap {
    position: relative;
    width: 96px;
  }
  .add-img-tdel {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 2;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    font-size: 14px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
  }
  .add-img-tdel:hover {
    border-color: var(--loss);
    color: var(--loss);
  }
  .add-img-tbtn {
    display: block;
    width: 100%;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    cursor: pointer;
  }
  .add-img-tbtn:hover {
    border-color: var(--accent);
  }
  .add-img-timg {
    display: block;
    width: 96px;
    height: 72px;
    object-fit: cover;
  }
  .add-img-meta {
    margin: 8px 0 0;
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
