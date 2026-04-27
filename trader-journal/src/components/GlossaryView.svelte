<script>
  import Modal from './Modal.svelte';
  import ImageLightbox from './ImageLightbox.svelte';
  import { glossary, UNCATEGORIZED_ID } from '../lib/glossary';
  import * as att from '../lib/attachmentApi.js';

  let filterCatId = '';
  let selectMode = false;
  let selectedIds = [];

  let termModalOpen = false;
  let termEditId = null;
  let termForm = { title: '', definition: '', categoryId: UNCATEGORIZED_ID, favorite: false };

  let catModalOpen = false;
  let newCatName = '';

  let fileInputGloss;
  let pendingAddTermId = null;
  let lbOpen = false;
  let lbUrls = [];
  let lbStart = 0;

  $: categories = $glossary.categories;
  $: catNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  $: sortedTerms = (() => {
    const list = [...$glossary.terms];
    list.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const ca = (catNameById[a.categoryId] || '').localeCompare(catNameById[b.categoryId] || '', 'ru');
      if (ca !== 0) return ca;
      return a.title.localeCompare(b.title, 'ru');
    });
    return list;
  })();

  $: visibleTerms = filterCatId ? sortedTerms.filter((t) => t.categoryId === filterCatId) : sortedTerms;

  $: selectedCount = selectedIds.length;

  function openNewTerm() {
    termEditId = null;
    termForm = {
      title: '',
      definition: '',
      categoryId: filterCatId || categories[0]?.id || UNCATEGORIZED_ID,
      favorite: false
    };
    termModalOpen = true;
  }

  function openEditTerm(t) {
    termEditId = t.id;
    termForm = {
      title: t.title,
      definition: t.definition,
      categoryId: t.categoryId,
      favorite: t.favorite
    };
    termModalOpen = true;
  }

  function saveTerm() {
    const title = termForm.title.trim();
    if (!title) return;
    if (termEditId) {
      glossary.updateTerm(termEditId, {
        title,
        definition: termForm.definition,
        categoryId: termForm.categoryId,
        favorite: termForm.favorite
      });
    } else {
      glossary.addTerm({
        title,
        definition: termForm.definition,
        categoryId: termForm.categoryId,
        favorite: termForm.favorite
      });
    }
    termModalOpen = false;
  }

  function deleteCurrentTerm() {
    if (!termEditId) return;
    if (!confirm('Удалить это понятие?')) return;
    glossary.deleteTerm(termEditId);
    termModalOpen = false;
    termEditId = null;
  }

  function toggleSelect(id) {
    if (selectedIds.includes(id)) selectedIds = selectedIds.filter((x) => x !== id);
    else selectedIds = [...selectedIds, id];
  }

  function selectAllVisible() {
    const ids = visibleTerms.map((t) => t.id);
    const allOn = ids.length && ids.every((id) => selectedIds.includes(id));
    selectedIds = allOn ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])];
  }

  function exitSelectMode() {
    selectMode = false;
    selectedIds = [];
  }

  function bulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm(`Удалить понятий: ${selectedIds.length}?`)) return;
    glossary.deleteTerms(selectedIds);
    selectedIds = [];
    selectMode = false;
  }

  function addCategoryRow() {
    const id = glossary.addCategory(newCatName);
    if (id) newCatName = '';
  }

  $: editTerm = termEditId ? $glossary.terms.find((x) => x.id === termEditId) : null;

  async function onGlossaryFile(ev) {
    const f = ev.target?.files?.[0];
    if (ev.target) ev.target.value = '';
    if (!f || !pendingAddTermId) return;
    const id = pendingAddTermId;
    pendingAddTermId = null;
    const rel = await att.saveImageFromFile('glossary', id, f);
    if (!rel) return;
    const t = $glossary.terms.find((x) => x.id === id);
    const next = [...(t?.attachments || []), rel];
    glossary.updateTerm(id, { attachments: next });
  }

  function requestAddPhoto(termId) {
    pendingAddTermId = termId;
    fileInputGloss?.click();
  }

  async function openLightboxForTerm(term, start = 0) {
    const rels = term.attachments || [];
    if (!rels.length) return;
    lbUrls = await att.getObjectUrlsForPaths(rels);
    lbStart = start;
    lbOpen = true;
  }

  async function removeGlossaryPhoto(termId, rel) {
    if (!confirm('Удалить это изображение?')) return;
    await att.removeFile(rel);
    const t = $glossary.terms.find((x) => x.id === termId);
    glossary.updateTerm(termId, { attachments: (t?.attachments || []).filter((p) => p !== rel) });
  }
</script>

<input
  type="file"
  class="gl-hidden-file"
  accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
  bind:this={fileInputGloss}
  on:change={onGlossaryFile}
  aria-hidden="true"
  tabindex="-1"
/>
<ImageLightbox bind:open={lbOpen} urls={lbUrls} startIndex={lbStart} />

<div class="gl-page">


  <div class="gl-toolbar">
    <label class="gl-filt">
      Категория
      <select bind:value={filterCatId} class="gl-select">
        <option value="">Все</option>
        {#each categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </label>
    <button type="button" class="btn btn-sm btn-primary" on:click={openNewTerm}>Добавить понятие</button>
    <button type="button" class="btn btn-sm" on:click={() => (catModalOpen = true)}>Категории</button>
    {#if !selectMode}
      <button type="button" class="btn btn-sm" on:click={() => (selectMode = true)}>Выбрать</button>
    {:else}
      <button type="button" class="btn btn-sm" on:click={selectAllVisible}>
        {visibleTerms.length && visibleTerms.every((t) => selectedIds.includes(t.id)) ? 'Снять все' : 'Выбрать все'}
      </button>
      <button type="button" class="btn btn-sm btn-danger" disabled={!selectedCount} on:click={bulkDelete}>
        Удалить ({selectedCount})
      </button>
      <button type="button" class="btn btn-sm" on:click={exitSelectMode}>Готово</button>
    {/if}
  </div>

  {#if visibleTerms.length === 0}
    <div class="gl-empty">Нет понятий. Добавь первое или смени фильтр категории.</div>
  {:else}
    <div class="gl-grid">
      {#each visibleTerms as t (t.id)}
        <article
          class="gl-card"
          class:gl-card-fav={t.favorite}
          class:gl-card-sel={selectMode && selectedIds.includes(t.id)}
          class:gl-select-mode={selectMode}
        >
          {#if selectMode}
            <label class="gl-card-check">
              <input type="checkbox" checked={selectedIds.includes(t.id)} on:change={() => toggleSelect(t.id)} />
            </label>
          {/if}
          <div class="gl-card-top">
            <div class="gl-card-headline">
              <span class="gl-card-cat">{catNameById[t.categoryId] || '—'}</span>
              <h3 class="gl-card-title">{t.title}</h3>
            </div>
            <div class="gl-card-actions">
              <button
                type="button"
                class="gl-icon-btn"
                title={t.favorite ? 'Убрать из избранного' : 'В избранное — наверх списка'}
                on:click|stopPropagation={() => glossary.toggleFavorite(t.id)}
              >
                {t.favorite ? '★' : '☆'}
              </button>
              {#if !selectMode}
                <button
                  type="button"
                  class="gl-icon-btn"
                  title="Открыть фото"
                  disabled={!t.attachments?.length}
                  on:click|stopPropagation={() => openLightboxForTerm(t, 0)}
                >🖼</button>
                <button
                  type="button"
                  class="gl-icon-btn"
                  title="Добавить фото"
                  on:click|stopPropagation={() => requestAddPhoto(t.id)}
                >➕</button>
                <button type="button" class="gl-icon-btn" title="Редактировать" on:click|stopPropagation={() => openEditTerm(t)}>✏️</button>
              {/if}
            </div>
          </div>
          {#if t.attachments?.length}
            <div class="gl-thumbs">
              {#await att.getObjectUrlsForPaths(t.attachments || []) then urls}
                {#each t.attachments as rel, i (rel)}
                  <div class="gl-thumb-wrap">
                    <button
                      type="button"
                      class="gl-thumb"
                      on:click|stopPropagation={() => openLightboxForTerm(t, i)}
                    >
                      <img src={urls[i]} alt="" />
                    </button>
                    {#if !selectMode}
                      <button
                        type="button"
                        class="gl-thumb-rm"
                        title="Удалить фото"
                        on:click|stopPropagation={() => removeGlossaryPhoto(t.id, rel)}
                      >×</button>
                    {/if}
                  </div>
                {/each}
              {/await}
            </div>
          {/if}
          <p class="gl-card-def">{t.definition}</p>
        </article>
      {/each}
    </div>
  {/if}
</div>

<Modal open={termModalOpen} modalClass="gl-modal" on:close={() => (termModalOpen = false)}>
  <div slot="header">
    <h2>{termEditId ? 'Редактировать' : 'Новое понятие'}</h2>
  </div>
  <div slot="body" class="gl-form">
    <label class="gl-form-row">
      <span>Название</span>
      <input type="text" bind:value={termForm.title} placeholder="Например, FVG" />
    </label>
    <label class="gl-form-row">
      <span>Категория</span>
      <select bind:value={termForm.categoryId} class="gl-select">
        {#each categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </label>
    <label class="gl-form-row">
      <span>Определение</span>
      <textarea rows="6" bind:value={termForm.definition} placeholder="Своими словами…"></textarea>
    </label>
    <label class="gl-form-check">
      <input type="checkbox" bind:checked={termForm.favorite} />
      Сразу в избранное
    </label>
    {#if termEditId && editTerm}
      <div class="gl-modal-photos">
        <div class="gl-modal-ph-head">
          <span>Иллюстрации</span>
          <button type="button" class="btn btn-sm btn-primary" on:click={() => requestAddPhoto(termEditId)}>+ Фото</button>
        </div>
        {#if editTerm.attachments?.length}
          <div class="gl-thumbs gl-thumbs--modal">
            {#await att.getObjectUrlsForPaths(editTerm.attachments) then urls}
              {#each editTerm.attachments as rel, i (rel)}
                <div class="gl-thumb-wrap">
                  <button type="button" class="gl-thumb" on:click={() => openLightboxForTerm(editTerm, i)}>
                    <img src={urls[i]} alt="" />
                  </button>
                  <button
                    type="button"
                    class="gl-thumb-rm"
                    title="Удалить"
                    on:click={() => removeGlossaryPhoto(termEditId, rel)}
                  >×</button>
                </div>
              {/each}
            {/await}
          </div>
        {:else}
          <p class="gl-hint">PNG, JPG, GIF, WebP, BMP. Хранятся в папке данных приложения, не в localStorage.</p>
        {/if}
      </div>
    {:else}
      <p class="gl-hint">После сохранения нового понятия можно будет добавить иллюстрации с карточки.</p>
    {/if}
  </div>
  <div slot="footer">
    {#if termEditId}
      <button type="button" class="btn btn-danger" on:click={deleteCurrentTerm}>Удалить</button>
    {/if}
    <button type="button" class="btn" on:click={() => (termModalOpen = false)}>Отмена</button>
    <button type="button" class="btn btn-primary" on:click={saveTerm}>Сохранить</button>
  </div>
</Modal>

<Modal open={catModalOpen} modalClass="gl-modal" on:close={() => (catModalOpen = false)}>
  <div slot="header">
    <h2>Категории</h2>
  </div>
  <div slot="body" class="gl-cat-body">
    <p class="gl-cat-hint">Удаление категории переносит понятия в «Без категории».</p>
    <ul class="gl-cat-list">
      {#each categories as c (c.id)}
        <li class="gl-cat-row">
          {#if c.id === UNCATEGORIZED_ID}
            <span class="gl-cat-name-muted">{c.name}</span>
            <span class="gl-cat-lock">системная</span>
          {:else}
            <input
              class="gl-cat-inp"
              type="text"
              value={c.name}
              aria-label="Название категории"
              on:change={(e) => glossary.updateCategory(c.id, e.currentTarget.value)}
            />
            <button type="button" class="btn btn-sm btn-danger" on:click={() => glossary.deleteCategory(c.id)}>Удалить</button>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="gl-cat-add">
      <input type="text" placeholder="Новая категория" bind:value={newCatName} on:keydown={(e) => e.key === 'Enter' && addCategoryRow()} />
      <button type="button" class="btn btn-sm btn-primary" on:click={addCategoryRow}>Добавить</button>
    </div>
  </div>
  <div slot="footer">
    <button type="button" class="btn btn-primary" on:click={() => (catModalOpen = false)}>Закрыть</button>
  </div>
</Modal>

<style>
  .gl-page {
    padding: 12px 0 32px;
  }
  .gl-head,
  .gl-toolbar,
  .gl-grid,
  .gl-empty {
    padding-left: 20px;
    padding-right: 20px;
  }
  .gl-head {
    margin-bottom: 12px;
  }
  .gl-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  .gl-sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .gl-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    margin-bottom: 18px;
  }
  .gl-filt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }
  .gl-select {
    font: inherit;
    font-size: 13px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text);
  }
  .gl-empty {
    padding: 28px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }
  .gl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
  .gl-card {
    position: relative;
    margin: 0;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    text-align: left;
  }
  .gl-card-fav {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .gl-card-sel {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .gl-card-check {
    position: absolute;
    top: 10px;
    left: 10px;
    margin: 0;
  }
  .gl-card-check input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
  .gl-select-mode .gl-card-top {
    padding-left: 28px;
  }
  .gl-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }
  .gl-card-cat {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 4px;
  }
  .gl-card-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-strong);
    line-height: 1.3;
  }
  .gl-card-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .gl-icon-btn {
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    color: var(--text);
  }
  .gl-icon-btn:hover {
    border-color: var(--accent);
  }
  .gl-card-def {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  :global(.gl-modal .modal-body) {
    max-height: min(70vh, 520px);
    overflow-y: auto;
  }
  .gl-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: min(100%, 420px);
  }
  .gl-form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .gl-form-row input,
  .gl-form-row textarea {
    font: inherit;
    font-size: 14px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .gl-form-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text);
  }
  .gl-cat-body {
    min-width: min(100%, 400px);
  }
  .gl-cat-hint {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .gl-cat-list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gl-cat-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .gl-cat-inp {
    flex: 1;
    min-width: 160px;
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .gl-cat-name-muted {
    flex: 1;
    font-size: 14px;
    color: var(--text-muted);
  }
  .gl-cat-lock {
    font-size: 11px;
    color: var(--text-muted);
  }
  .gl-cat-add {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .gl-cat-add input {
    flex: 1;
    min-width: 180px;
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .gl-hidden-file {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .gl-thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 10px;
    align-items: flex-start;
  }
  .gl-thumbs--modal {
    margin: 0;
  }
  .gl-thumb-wrap {
    position: relative;
  }
  .gl-thumb {
    display: block;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    cursor: pointer;
  }
  .gl-thumb img {
    display: block;
    width: 88px;
    height: 64px;
    object-fit: cover;
  }
  .gl-thumb-rm {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    font-size: 14px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
  }
  .gl-thumb-rm:hover {
    border-color: var(--loss);
    color: var(--loss);
  }
  .gl-modal-photos {
    border-top: 1px solid var(--border);
    padding-top: 12px;
    margin-top: 4px;
  }
  .gl-modal-ph-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .gl-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.45;
  }
</style>
