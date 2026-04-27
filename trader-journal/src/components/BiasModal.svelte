<script>
  import { htfBias } from '../lib/htfBias';
  import { PAIRS } from '../lib/constants';
  import dayjs from 'dayjs';
  import Modal from './Modal.svelte';

  export let open = false;
  /** Опционально подставить символ при открытии. */
  export let symbol = '';

  let formData = blank();

  function blank() {
    return {
      date: dayjs().format('YYYY-MM-DD'),
      symbol: symbol || 'EURUSD',
      daily: 'neutral',
      h4: 'neutral',
      reasoning: '',
      keyLevels: ''
    };
  }

  let wasOpen = false;
  $: if (open && !wasOpen) {
    formData = blank();
    if (symbol) formData.symbol = symbol;
    wasOpen = true;
  }
  $: if (!open && wasOpen) wasOpen = false;

  function parseKeyLevels(text) {
    if (!text) return [];
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const [priceRaw, ...rest] = line.split(/[\s:|]+/);
        const price = Number(priceRaw);
        if (!Number.isFinite(price)) return null;
        return { price, label: rest.join(' ') || `Level @ ${price}` };
      })
      .filter(Boolean);
  }

  function handleSave() {
    const ok = htfBias.upsert({
      date: formData.date,
      symbol: formData.symbol,
      daily: formData.daily,
      h4: formData.h4,
      reasoning: formData.reasoning,
      keyLevels: parseKeyLevels(formData.keyLevels)
    });
    if (ok) closeModal();
  }

  function closeModal() {
    open = false;
  }

  $: log = $htfBias;
  $: logForSymbol = log
    .filter((x) => x.symbol === (formData.symbol || '').toUpperCase())
    .slice(0, 7);

  function loadEntry(entry) {
    formData = {
      date: entry.date,
      symbol: entry.symbol,
      daily: entry.daily,
      h4: entry.h4,
      reasoning: entry.reasoning || '',
      keyLevels: (entry.keyLevels || []).map((l) => `${l.price} ${l.label}`).join('\n')
    };
  }

  function deleteEntry(id) {
    if (!confirm('Удалить эту запись bias?')) return;
    htfBias.remove(id);
  }
</script>

<Modal {open} on:close={closeModal}>
  <div slot="header">
    <h2>HTF Bias · {formData.symbol || '—'}</h2>
  </div>

  <div slot="body">
    <div class="bias-hint">
      Раз в день фиксируешь куда смотришь по символу. Сделки против bias попадают в нарушения,
      а в статистике ты увидишь WR aligned vs against — это валидация HTF-нарратива.
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="bias-date">Дата</label>
        <input id="bias-date" type="date" bind:value={formData.date} />
      </div>
      <div class="form-group">
        <label for="bias-symbol">Символ</label>
        <select id="bias-symbol" bind:value={formData.symbol}>
          {#each PAIRS as pair}
            <option value={pair}>{pair}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="bias-daily">Daily bias</label>
        <div class="pill-group">
          {#each [['bull', '📈 Bull'], ['neutral', '⏸ Neutral'], ['bear', '📉 Bear']] as [v, lbl]}
            <button
              type="button"
              class="pill-btn {formData.daily === v ? 'active' : ''}"
              on:click={() => (formData.daily = v)}
            >{lbl}</button>
          {/each}
        </div>
      </div>
      <div class="form-group">
        <label for="bias-h4">H4 bias</label>
        <div class="pill-group">
          {#each [['bull', '📈 Bull'], ['neutral', '⏸ Neutral'], ['bear', '📉 Bear']] as [v, lbl]}
            <button
              type="button"
              class="pill-btn {formData.h4 === v ? 'active' : ''}"
              on:click={() => (formData.h4 = v)}
            >{lbl}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="form-group">
      <label for="bias-reasoning">Нарратив (зачем именно такой bias)</label>
      <textarea
        id="bias-reasoning"
        rows="3"
        bind:value={formData.reasoning}
        placeholder="HTF структура, weekly OB, sweep вчера, NFP в среду…"
      ></textarea>
    </div>

    <div class="form-group">
      <label for="bias-levels">Ключевые уровни (одна строка = один уровень)</label>
      <textarea
        id="bias-levels"
        rows="3"
        bind:value={formData.keyLevels}
        placeholder="1.0850 PDH&#10;1.0790 Asia low&#10;1.0820 H4 FVG"
      ></textarea>
      <div class="hint-inline">Формат: <code>price label</code>. Разделители — пробел, двоеточие, |.</div>
    </div>

    {#if logForSymbol.length > 0}
      <div class="bias-log">
        <div class="bias-log-title">Последние записи по {formData.symbol}</div>
        <ul>
          {#each logForSymbol as e}
            <li>
              <span class="bias-log-date">{e.date}</span>
              <span class="bias-log-d {e.daily}">{e.daily.toUpperCase()}</span>
              <span class="bias-log-h4 {e.h4}">H4 · {e.h4}</span>
              {#if e.reasoning}
                <span class="bias-log-reason" title={e.reasoning}>{e.reasoning.slice(0, 60)}{e.reasoning.length > 60 ? '…' : ''}</span>
              {/if}
              <span class="bias-log-actions">
                <button type="button" class="btn btn-sm" on:click={() => loadEntry(e)} title="Загрузить в форму">↺</button>
                <button type="button" class="btn btn-sm btn-danger" on:click={() => deleteEntry(e.id)} title="Удалить">🗑</button>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <div slot="footer">
    <button type="button" on:click={closeModal}>Отмена</button>
    <button type="button" class="btn btn-primary" on:click={handleSave}>Сохранить bias</button>
  </div>
</Modal>

<style>
  .bias-hint {
    margin: 0 0 12px;
    padding: 8px 12px;
    background: var(--bg-2);
    border-left: 3px solid var(--accent-border);
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .pill-group {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
    background: var(--bg);
  }
  .pill-btn {
    padding: 6px 11px;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--border);
    color: var(--text);
    font-size: 12.5px;
    cursor: pointer;
  }
  .pill-btn:last-child { border-right: 0; }
  .pill-btn:hover { background: var(--bg-2); }
  .pill-btn.active { background: var(--accent); color: var(--accent-fg); }

  .hint-inline {
    margin-top: 4px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .bias-log {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg-2);
  }
  .bias-log-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .bias-log ul { list-style: none; padding: 0; margin: 0; }
  .bias-log li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    font-size: 12.5px;
    border-bottom: 1px dashed var(--border);
  }
  .bias-log li:last-child { border-bottom: 0; }
  .bias-log-date { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-muted); flex-shrink: 0; min-width: 92px; }
  .bias-log-d, .bias-log-h4 {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    background: var(--bg-3);
  }
  .bias-log-d.bull, .bias-log-h4.bull { color: var(--profit); }
  .bias-log-d.bear, .bias-log-h4.bear { color: var(--loss); }
  .bias-log-d.neutral, .bias-log-h4.neutral { color: var(--text-muted); }
  .bias-log-reason {
    flex: 1;
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bias-log-actions { display: inline-flex; gap: 4px; margin-left: auto; }
</style>
