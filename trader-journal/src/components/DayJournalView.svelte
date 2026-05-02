<script>
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { dayJournal, normalizeEntry } from '../lib/dayJournal';
  import {
    dayJournalChecklistTemplate,
    dayJournalSectionLabels
  } from '../lib/dayJournalChecklistTemplate';
  import JournalSourceHint from './JournalSourceHint.svelte';

  const PAGE_SIZE = 10;

  const MOODS = [
    { id: 'great', label: 'Отлично', icon: '😎' },
    { id: 'good', label: 'Хорошо', icon: '🙂' },
    { id: 'ok', label: 'Норм', icon: '😐' },
    { id: 'bad', label: 'Тяжело', icon: '😟' },
    { id: 'awful', label: 'Слив', icon: '😵' }
  ];

  const PLAN_SNIPPETS = [
    'Только выбранные KZ · max 2 сделки · стоп по плану · без усреднения.',
    'Перед входом: HTF bias + ликвидность снята. Не торговать первые 15 мин после новости.',
    'Если −1R — пауза 30 мин. Если дневной +X — только наблюдение.'
  ];

  let selectedKey = dayjs().format('YYYY-MM-DD');
  /** Страница списка карточек (1-based). */
  let listPage = 1;
  /** Высота колонки редактора — ограничиваем блок карточек на широком экране. */
  let editorH = 0;
  let djPrefsOpen = false;
  let newChecklistLabel = '';

  $: checklistItems = $dayJournalChecklistTemplate;
  $: secLabels = $dayJournalSectionLabels;
  $: entry = normalizeEntry($dayJournal[selectedKey] || {});

  function checklistAnyTrue(checklist) {
    if (!checklist || typeof checklist !== 'object') return false;
    return Object.values(checklist).some((v) => v === true);
  }

  function entryHasContent(raw) {
    const n = normalizeEntry(raw || {});
    if (n.mood) return true;
    if (n.plan.trim()) return true;
    if (n.review.trim()) return true;
    if (n.lessons.trim()) return true;
    if (checklistAnyTrue(n.checklist)) return true;
    return false;
  }

  function checklistProgress(rec, items) {
    let done = 0;
    const total = items.length;
    for (const r of items) {
      if (rec.checklist[r.id]) done += 1;
    }
    return { done, total };
  }

  function addChecklistRow() {
    dayJournalChecklistTemplate.addItem(newChecklistLabel);
    newChecklistLabel = '';
  }

  $: sortedRecordKeys = Object.keys($dayJournal)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && entryHasContent($dayJournal[k]))
    .sort((a, b) => b.localeCompare(a));

  $: totalListPages = Math.max(1, Math.ceil(sortedRecordKeys.length / PAGE_SIZE));
  $: {
    const lp = Number(listPage) || 1;
    if (lp > totalListPages) listPage = totalListPages;
    else if (lp < 1) listPage = 1;
  }
  $: effectiveListPage = Math.min(totalListPages, Math.max(1, Number(listPage) || 1));
  $: pageRecordKeys = sortedRecordKeys.slice(
    (effectiveListPage - 1) * PAGE_SIZE,
    effectiveListPage * PAGE_SIZE
  );

  function moodMeta(id) {
    return MOODS.find((m) => m.id === id) || null;
  }

  function clip(s, max = 160) {
    const t = (s || '').trim().replace(/\s+/g, ' ');
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  function openRecord(key) {
    selectedKey = key;
  }

  function formatRecordTitle(key) {
    const parts = key.split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return key;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function goToday() {
    selectedKey = dayjs().format('YYYY-MM-DD');
  }

  function prevDay() {
    selectedKey = dayjs(selectedKey).subtract(1, 'day').format('YYYY-MM-DD');
  }

  function nextDay() {
    selectedKey = dayjs(selectedKey).add(1, 'day').format('YYYY-MM-DD');
  }

  function copyPlanFromYesterday() {
    const y = dayjs(selectedKey).subtract(1, 'day').format('YYYY-MM-DD');
    const yEnt = normalizeEntry($dayJournal[y] || {});
    dayJournal.patchDay(selectedKey, {
      plan: yEnt.plan,
      checklist: { ...yEnt.checklist }
    });
  }

  function applyPlanSnippet(text) {
    const cur = entry.plan.trim();
    dayJournal.patchDay(selectedKey, {
      plan: cur ? `${cur}\n${text}` : text
    });
  }

  function checklistAll(on) {
    const patch = {};
    for (const r of checklistItems) patch[r.id] = on;
    dayJournal.patchDay(selectedKey, { checklist: patch });
  }

  function clearDayEntry() {
    if (confirm('Очистить запись за этот день?')) dayJournal.clearDay(selectedKey);
  }

  /** Новая запись: сегодня, если пусто; иначе ближайший свободный день после сегодня. */
  function createNewEntry() {
    const map = get(dayJournal);
    const today = dayjs().format('YYYY-MM-DD');
    if (!entryHasContent(map[today])) {
      selectedKey = today;
      listPage = 1;
      return;
    }
    let d = dayjs(today).add(1, 'day');
    for (let i = 0; i < 400; i++) {
      const k = d.format('YYYY-MM-DD');
      if (!entryHasContent(map[k])) {
        selectedKey = k;
        listPage = 1;
        return;
      }
      d = d.add(1, 'day');
    }
    selectedKey = dayjs().add(1, 'day').format('YYYY-MM-DD');
    listPage = 1;
  }
</script>

<div class="dj-page">
  <header class="dj-head">
    <h2 class="dj-title">Дневник сессии</h2>
    <p class="dj-sub">План до торгов, чеклист и разбор — отдельно от таблицы сделок.</p>
  </header>

  <div class="dj-layout">
    <div class="dj-editor" bind:clientHeight={editorH}>
      <div class="dj-toolbar">
        <label class="dj-date" for="dj-edit-date">
          Дата
          <input id="dj-edit-date" type="date" bind:value={selectedKey} />
        </label>
        <div class="dj-nav">
          <button type="button" class="btn btn-sm" on:click={prevDay}>‹</button>
          <button type="button" class="btn btn-sm" on:click={goToday}>Сегодня</button>
          <button type="button" class="btn btn-sm" on:click={nextDay}>›</button>
        </div>
        <div class="dj-quick">
          <button type="button" class="btn btn-sm btn-primary" on:click={createNewEntry} title="Открыть свободный день: сегодня или следующий пустой">
            Создать запись
          </button>
          <button type="button" class="btn btn-sm" on:click={copyPlanFromYesterday} title="Скопировать план и галки со вчера">
            Со вчера
          </button>
          <button type="button" class="btn btn-sm" on:click={() => checklistAll(true)}>Все ✓</button>
          <button type="button" class="btn btn-sm" on:click={() => checklistAll(false)}>Сброс галок</button>
          <button type="button" class="btn btn-sm btn-danger" on:click={clearDayEntry}>Очистить день</button>
        </div>
      </div>

      <section class="dj-card dj-prefs-card">
        <button
          type="button"
          class="dj-prefs-toggle"
          aria-expanded={djPrefsOpen}
          on:click={() => (djPrefsOpen = !djPrefsOpen)}
        >
          <span>Настройки дневника</span>
          <span class="dj-prefs-chev">{djPrefsOpen ? '▼' : '▶'}</span>
        </button>
        {#if djPrefsOpen}
          <div class="dj-prefs-body">
            <div class="dj-prefs-block">
              <div class="dj-prefs-k">Пункты чеклиста</div>
              <p class="dj-prefs-hint">Свои формулировки, порядок ↑↓, не меньше одного пункта.</p>
              <ul class="dj-prefs-list">
                {#each checklistItems as row, i (row.id)}
                  <li class="dj-prefs-item">
                    <input
                      class="dj-prefs-inp"
                      type="text"
                      value={row.label}
                      aria-label="Текст пункта {i + 1}"
                      on:change={(e) => dayJournalChecklistTemplate.updateItem(row.id, e.currentTarget.value)}
                    />
                    <div class="dj-prefs-item-actions">
                      <button type="button" class="btn btn-sm" title="Выше" on:click={() => dayJournalChecklistTemplate.moveItem(row.id, -1)}>↑</button>
                      <button type="button" class="btn btn-sm" title="Ниже" on:click={() => dayJournalChecklistTemplate.moveItem(row.id, 1)}>↓</button>
                      <button type="button" class="btn btn-sm btn-danger" title="Удалить" on:click={() => dayJournalChecklistTemplate.removeItem(row.id)}>×</button>
                    </div>
                  </li>
                {/each}
              </ul>
              <div class="dj-prefs-add">
                <input
                  class="dj-prefs-inp"
                  type="text"
                  placeholder="Новый пункт…"
                  bind:value={newChecklistLabel}
                  on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistRow())}
                />
                <button type="button" class="btn btn-sm btn-primary" on:click={addChecklistRow}>Добавить</button>
              </div>
              <button type="button" class="btn btn-sm" on:click={() => dayJournalChecklistTemplate.resetDefaults()}>
                Сбросить чеклист по умолчанию
              </button>
            </div>
            <div class="dj-prefs-block">
              <div class="dj-prefs-k">Заголовки блоков текста</div>
              <p class="dj-prefs-hint">Отображаются над полями и в карточках записей.</p>
              <label class="dj-prefs-lab" for="dj-sec-plan">План / сессия</label>
              <input
                id="dj-sec-plan"
                class="dj-prefs-inp dj-prefs-inp-full"
                type="text"
                value={secLabels.plan}
                on:input={(e) => dayJournalSectionLabels.patch({ plan: e.currentTarget.value })}
              />
              <label class="dj-prefs-lab" for="dj-sec-rev">Итог / разбор</label>
              <input
                id="dj-sec-rev"
                class="dj-prefs-inp dj-prefs-inp-full"
                type="text"
                value={secLabels.review}
                on:input={(e) => dayJournalSectionLabels.patch({ review: e.currentTarget.value })}
              />
              <label class="dj-prefs-lab" for="dj-sec-less">Фокус дальше</label>
              <input
                id="dj-sec-less"
                class="dj-prefs-inp dj-prefs-inp-full"
                type="text"
                value={secLabels.lessons}
                on:input={(e) => dayJournalSectionLabels.patch({ lessons: e.currentTarget.value })}
              />
              <button type="button" class="btn btn-sm" on:click={() => dayJournalSectionLabels.reset()}>
                Сбросить заголовки
              </button>
            </div>
          </div>
        {/if}
      </section>

  <section class="dj-card">
    <div class="dj-label">Настроение (быстро)</div>
    <div class="dj-moods">
      {#each MOODS as m}
        <button
          type="button"
          class="dj-mood {entry.mood === m.id ? 'active' : ''}"
          title={m.label}
          on:click={() => dayJournal.patchDay(selectedKey, { mood: m.id })}
        >
          <span class="dj-mood-ico">{m.icon}</span>
          <span class="dj-mood-txt">{m.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="dj-card">
    <div class="dj-label">Чеклист перед / во время</div>
    <div class="dj-checks">
      {#each checklistItems as row (row.id)}
        <div class="chk-row">
          <label class="chk">
            <input
              type="checkbox"
              checked={!!entry.checklist[row.id]}
              on:change={(e) =>
                dayJournal.patchDay(selectedKey, { checklist: { [row.id]: e.currentTarget.checked } })}
            />
            <span class="chk-lbl">{row.label}</span>
          </label>
          <JournalSourceHint sourceIds={row.sourceRefs || []} />
        </div>
      {/each}
    </div>
  </section>

  <section class="dj-card">
    <div class="dj-row-title">
      <span class="dj-label">{secLabels.plan}</span>
      <span class="dj-snips">
        {#each PLAN_SNIPPETS as s}
          <button type="button" class="linkish" on:click={() => applyPlanSnippet(s)}>+ шаблон</button>
        {/each}
      </span>
    </div>
    <textarea
      class="dj-area"
      placeholder="Зоны, сценарий, что жду от рынка…"
      value={entry.plan}
      on:input={(e) => dayJournal.patchDay(selectedKey, { plan: e.currentTarget.value })}
      rows="4"
    ></textarea>
  </section>

  <section class="dj-card">
    <div class="dj-label">{secLabels.review}</div>
    <textarea
      class="dj-area"
      placeholder="Факты: нарушения, эмоции, качество исполнения…"
      value={entry.review}
      on:input={(e) => dayJournal.patchDay(selectedKey, { review: e.currentTarget.value })}
      rows="4"
    ></textarea>
  </section>

  <section class="dj-card">
    <div class="dj-label">{secLabels.lessons}</div>
    <textarea
      class="dj-area"
      placeholder="Один конкретный фокус улучшения…"
      value={entry.lessons}
      on:input={(e) => dayJournal.patchDay(selectedKey, { lessons: e.currentTarget.value })}
      rows="2"
    ></textarea>
  </section>
    </div>

    <aside
      class="dj-records"
      aria-label="Сохранённые записи дневника"
      style:--dj-rec-max={editorH > 48 ? `${editorH}px` : undefined}
    >
      <div class="dj-records-head">
        <h3 class="dj-records-title">Записи</h3>
        {#if sortedRecordKeys.length > 0}
          <div class="dj-records-pager">
            <label class="dj-pager-label" for="dj-page-select">
              Страница
            </label>
            <select
              id="dj-page-select"
              class="dj-page-select"
              bind:value={listPage}
              disabled={totalListPages <= 1}
            >
              {#each Array(totalListPages) as _, i (i)}
                <option value={i + 1}>{i + 1} / {totalListPages}</option>
              {/each}
            </select>
            <span class="dj-records-count">{sortedRecordKeys.length} всего</span>
          </div>
        {/if}
      </div>

      <div class="dj-records-body">
        {#if sortedRecordKeys.length === 0}
          <div class="dj-records-empty">Пока нет сохранённых записей с текстом или галками — заполни слева и они появятся здесь.</div>
        {:else}
          <div class="dj-records-scroll">
            <div class="dj-records-list">
              {#each pageRecordKeys as key (key)}
                {@const rec = normalizeEntry($dayJournal[key] || {})}
                {@const mm = moodMeta(rec.mood)}
                {@const prog = checklistProgress(rec, checklistItems)}
                <button
                  type="button"
                  class="dj-record-card {selectedKey === key ? 'active' : ''}"
                  on:click={() => openRecord(key)}
                >
                  <div class="dj-record-top">
                    <span class="dj-record-date">{formatRecordTitle(key)}</span>
                    <span class="dj-record-meta">
                      {#if mm}<span class="dj-record-mood" title={mm.label}>{mm.icon}</span>{/if}
                      <span class="dj-record-chk" title="Чеклист">{prog.done}/{prog.total}</span>
                    </span>
                  </div>

                  <div class="dj-record-section">
                    <div class="dj-record-section-head">Чеклист</div>
                    <ul class="dj-record-chk-list">
                      {#each checklistItems as row (row.id)}
                        <li class="dj-record-chk-li" class:dj-record-chk-done={!!rec.checklist[row.id]}>
                          <span class="dj-record-chk-ico" aria-hidden="true">{rec.checklist[row.id] ? '✓' : '○'}</span>
                          <span class="dj-record-chk-txt">{row.label}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>

                  {#if rec.plan.trim()}
                    <div class="dj-record-section">
                      <div class="dj-record-section-head">{secLabels.plan}</div>
                      <p class="dj-record-txt">{clip(rec.plan)}</p>
                    </div>
                  {/if}
                  {#if rec.review.trim()}
                    <div class="dj-record-section">
                      <div class="dj-record-section-head">{secLabels.review}</div>
                      <p class="dj-record-txt">{clip(rec.review)}</p>
                    </div>
                  {/if}
                  {#if rec.lessons.trim()}
                    <div class="dj-record-section">
                      <div class="dj-record-section-head">{secLabels.lessons}</div>
                      <p class="dj-record-txt">{clip(rec.lessons, 120)}</p>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .dj-page {
    /* как у статистики: только горизонталь 20px, без max-width — шире к краям экрана */
    padding: 12px 0 28px;
  }
  .dj-head,
  .dj-layout {
    padding-left: 20px;
    padding-right: 20px;
  }
  .dj-layout {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) minmax(280px, 1fr);
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .dj-layout {
      grid-template-columns: 1fr;
    }
  }
  .dj-editor {
    min-width: 0;
  }
  .dj-records {
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  @media (min-width: 901px) {
    .dj-records {
      max-height: var(--dj-rec-max, none);
      overflow: hidden;
    }
  }
  .dj-records-head {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  .dj-records-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .dj-records-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding-right: 4px;
    margin-right: -4px;
  }
  @media (max-width: 900px) {
    .dj-records-body {
      /* ~3 карточки при узкой колонке */
      max-height: clamp(260px, 40vh, 460px);
    }
  }
  .dj-records-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-strong);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .dj-records-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .dj-pager-label {
    font-size: 12px;
    color: var(--text-muted);
  }
  .dj-page-select {
    font: inherit;
    font-size: 13px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text);
    min-width: 5.5rem;
  }
  .dj-records-count {
    font-size: 12px;
    color: var(--text-muted);
  }
  .dj-records-empty {
    flex: 1;
    min-height: 8rem;
    padding: 16px 14px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
    display: flex;
    align-items: center;
  }
  .dj-records-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dj-record-card {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 14px;
    text-align: left;
    font: inherit;
    color: var(--text);
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .dj-record-card:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .dj-record-card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .dj-record-section {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    text-align: left;
  }
  /* первая секция идёт сразу после шапки даты — без линии сверху */
  .dj-record-top + .dj-record-section {
    margin-top: 8px;
    padding-top: 0;
    border-top: none;
  }
  .dj-record-section-head {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .dj-record-chk-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dj-record-chk-li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    line-height: 1.35;
    color: var(--text-muted);
  }
  .dj-record-chk-done {
    color: var(--text);
  }
  .dj-record-chk-ico {
    flex-shrink: 0;
    width: 1em;
    text-align: center;
    opacity: 0.85;
  }
  .dj-record-chk-done .dj-record-chk-ico {
    color: var(--profit);
  }
  .dj-record-chk-txt {
    word-break: break-word;
  }
  .dj-record-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
  }
  .dj-record-date {
    font-weight: 700;
    font-size: 14px;
    color: var(--text-strong);
  }
  .dj-record-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .dj-record-mood {
    font-size: 1.1rem;
    line-height: 1;
  }
  .dj-record-chk {
    font-variant-numeric: tabular-nums;
  }
  .dj-record-txt {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .dj-head {
    margin-bottom: 14px;
  }
  .dj-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  .dj-sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .dj-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    margin-bottom: 16px;
  }
  .dj-toolbar .dj-quick {
    margin-left: 0;
  }
  @media (min-width: 520px) {
    .dj-toolbar .dj-quick {
      margin-left: auto;
    }
  }
  .dj-date {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }
  .dj-date input {
    font: inherit;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text);
  }
  .dj-nav {
    display: flex;
    gap: 6px;
  }
  .dj-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dj-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .dj-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .dj-row-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .dj-row-title .dj-label {
    margin-bottom: 0;
  }
  .dj-snips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
  }
  .linkish {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .linkish:hover {
    color: var(--text-strong);
  }
  .dj-moods {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dj-mood {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    color: var(--text);
  }
  .dj-mood:hover {
    border-color: var(--accent);
  }
  .dj-mood.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text-strong);
  }
  .dj-mood-ico {
    font-size: 1.1rem;
    line-height: 1;
  }
  .dj-mood-txt {
    opacity: 0.9;
  }
  .dj-checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px 12px;
  }
  .chk-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }
  .chk-row .chk {
    flex: 1;
    min-width: 0;
  }
  .chk {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text);
  }
  .chk input {
    margin-top: 3px;
    flex-shrink: 0;
  }
  .chk-lbl {
    flex: 1;
    min-width: 0;
    line-height: 1.4;
  }
  .dj-area {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    resize: vertical;
    min-height: 72px;
  }
  .dj-area:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: 1px;
  }

  .dj-prefs-card {
    padding: 0;
    overflow: hidden;
  }
  .dj-prefs-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    margin: 0;
    border: none;
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-2));
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-strong);
    cursor: pointer;
    text-align: left;
  }
  .dj-prefs-toggle:hover {
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-2));
  }
  .dj-prefs-chev {
    opacity: 0.7;
    font-size: 11px;
  }
  .dj-prefs-body {
    padding: 12px 14px 14px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .dj-prefs-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dj-prefs-k {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .dj-prefs-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .dj-prefs-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dj-prefs-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .dj-prefs-inp {
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }
  .dj-prefs-item .dj-prefs-inp {
    flex: 1 1 160px;
  }
  .dj-prefs-inp-full {
    width: 100%;
    box-sizing: border-box;
  }
  .dj-prefs-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .dj-prefs-add {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .dj-prefs-add .dj-prefs-inp {
    flex: 1 1 200px;
  }
  .dj-prefs-lab {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-top: 4px;
  }
  .dj-prefs-lab:first-of-type {
    margin-top: 0;
  }
</style>
