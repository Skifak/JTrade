<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import { journalSettings, TZ_PRESETS } from '../lib/journalSettings';

  export let open = false;

  const dispatch = createEventDispatcher();

  let priorityDraft = '';

  $: if (open) {
    priorityDraft = $journalSettings.killzonePriority.join(', ');
  }

  function applyPriority() {
    const ids = priorityDraft.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    journalSettings.setKillzonePriority(ids);
  }

  function close() {
    applyPriority();
    open = false;
    dispatch('close');
  }

  function resetAll() {
    if (!confirm('Сбросить часовой пояс, все окна KZ и приоритет к значениям по умолчанию?')) return;
    journalSettings.resetKillzonesToDefault();
    priorityDraft = $journalSettings.killzonePriority.join(', ');
  }
</script>

<Modal {open} on:close={close} modalClass="journal-settings-modal">
  <h2 slot="header" class="jsm-title">Настройки журнала</h2>

  <div slot="body">
    <div class="form-block jsm-ctx-block">
      <label class="jsm-check">
        <input
          type="checkbox"
          checked={$journalSettings.useNativeBrowserContextMenu}
          on:change={(e) =>
            journalSettings.setUseNativeBrowserContextMenu(/** @type {HTMLInputElement} */ (e.currentTarget).checked)}
        />
        <span>Системное меню по правому клику (как в браузере)</span>
      </label>
    </div>

    <p class="jsm-lead">
      Часовой пояс и окна killzone влияют на авто-определение KZ у сделок, фильтры в статистике и проверки плейбуков.
      ID окон должны совпадать с теми, что выбраны в стратегиях (например <code>SB</code>, <code>LO</code>).
    </p>

    <div class="form-block">
      <label class="jsm-label" for="jsm-tz">Часовой пояс для расчёта KZ</label>
      <select
        id="jsm-tz"
        class="jsm-select"
        value={$journalSettings.killzoneTimezone}
        on:change={(e) => journalSettings.setTimezone(e.target.value)}
      >
        {#each TZ_PRESETS as tz}
          <option value={tz.id}>{tz.label} — {tz.id}</option>
        {/each}
        {#if !TZ_PRESETS.some((t) => t.id === $journalSettings.killzoneTimezone)}
          <option value={$journalSettings.killzoneTimezone}>
            Текущий: {$journalSettings.killzoneTimezone}
          </option>
        {/if}
      </select>
    </div>

    <div class="form-block">
      <label class="jsm-label" for="jsm-pri">Приоритет KZ (для «основной» зоны при пересечении окон)</label>
      <input
        id="jsm-pri"
        class="jsm-input"
        bind:value={priorityDraft}
        on:blur={applyPriority}
        placeholder="SB, LDN, LO, …"
      />
      <span class="jsm-hint">Список id через запятую; первые важнее. Пустое поле восстановит дефолт при следующем сохранении.</span>
    </div>

    <div class="kz-toolbar">
      <span class="jsm-label">Окна (from / to — в выбранном TZ, формат ЧЧ:ММ)</span>
      <div class="kz-actions">
        <button type="button" class="btn btn-sm" on:click={() => journalSettings.addKillzoneRow()}>+ Окно</button>
        <button type="button" class="btn btn-sm" on:click={resetAll}>Сброс по умолчанию</button>
      </div>
    </div>

    <div class="kz-table-wrap">
      <table class="kz-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Подпись</th>
            <th>С</th>
            <th>По</th>
            <th>Через полночь</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each $journalSettings.killzones as row, i (row.id + ':' + i)}
            <tr>
              <td>
                <input
                  class="kz-inp kz-id"
                  value={row.id}
                  on:change={(e) => journalSettings.patchKillzone(i, { id: e.target.value })}
                />
              </td>
              <td>
                <input
                  class="kz-inp"
                  value={row.label}
                  on:change={(e) => journalSettings.patchKillzone(i, { label: e.target.value })}
                />
              </td>
              <td>
                <input
                  class="kz-inp kz-time"
                  value={row.from}
                  on:change={(e) => journalSettings.patchKillzone(i, { from: e.target.value })}
                />
              </td>
              <td>
                <input
                  class="kz-inp kz-time"
                  value={row.to}
                  on:change={(e) => journalSettings.patchKillzone(i, { to: e.target.value })}
                />
              </td>
              <td class="kz-cen">
                <input
                  type="checkbox"
                  checked={!!row.wrap}
                  on:change={(e) => journalSettings.patchKillzone(i, { wrap: e.target.checked })}
                />
              </td>
              <td>
                <button type="button" class="btn btn-sm btn-danger" on:click={() => journalSettings.removeKillzoneAt(i)}>
                  ×
                </button>
              </td>
            </tr>
            <tr class="kz-hint-row">
              <td colspan="6">
                <input
                  class="kz-inp kz-hint"
                  placeholder="Подсказка (необязательно)"
                  value={row.hint || ''}
                  on:change={(e) => journalSettings.patchKillzone(i, { hint: e.target.value })}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div slot="footer">
    <button type="button" class="btn btn-primary" on:click={close}>Готово</button>
  </div>
</Modal>

<style>
  .jsm-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-strong);
    border: 0;
    padding: 0;
  }
  .jsm-ctx-block {
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }
  .jsm-check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    line-height: 1.45;
    font-weight: 500;
    color: var(--text-strong);
    cursor: pointer;
    user-select: none;
  }
  .jsm-check input {
    margin: 3px 0 0 0;
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    cursor: pointer;
  }
  .jsm-lead {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .form-block {
    margin-bottom: 14px;
  }
  .jsm-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 6px;
  }
  .jsm-select,
  .jsm-input {
    width: 100%;
    max-width: 420px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-strong);
    font: inherit;
    font-size: 13px;
  }
  .jsm-hint {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .kz-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    margin: 18px 0 8px;
  }
  .kz-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .kz-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: min(52vh, 420px);
    overflow-y: auto;
  }
  .kz-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .kz-table th,
  .kz-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
  }
  .kz-table th {
    background: var(--bg-2);
    color: var(--text-muted);
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .kz-cen {
    text-align: center;
  }
  .kz-inp {
    width: 100%;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text-strong);
    font: inherit;
    font-size: 12px;
  }
  .kz-id {
    max-width: 88px;
    font-family: var(--mono, monospace);
  }
  .kz-time {
    max-width: 72px;
  }
  .kz-hint {
    max-width: none;
    margin: 0 0 4px;
  }
  .kz-hint-row td {
    background: var(--bg-2);
    padding-top: 0;
    border-bottom: 1px solid var(--border);
  }
</style>
