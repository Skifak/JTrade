<script>
  import { onMount } from 'svelte';
  import { strategies } from '../lib/playbooks';
  import { journalSettings } from '../lib/journalSettings';
  import { trades } from '../lib/stores';
  import { getStatsByPlay } from '../lib/risk';
  import { formatNumber } from '../lib/utils';
  import { toasts } from '../lib/toasts';

  let activeStrategyId = '';
  let activePlayId = '';
  let importText = '';
  let showImport = false;

  $: list = $strategies;
  $: kzCatalog = $journalSettings.killzones;
  // Активная стратегия/play — derived без записи в источники, чтобы не было цикла.
  $: activeStrategy = (list.find((s) => s.id === activeStrategyId) || list[0]) || null;
  $: activePlay = activeStrategy
    ? (activeStrategy.plays || []).find((p) => p.id === activePlayId) || (activeStrategy.plays || [])[0] || null
    : null;

  onMount(() => {
    if (!activeStrategyId && list.length) {
      activeStrategyId = list[0].id;
      activePlayId = list[0].plays?.[0]?.id || '';
    }
  });

  function pickStrategy(id) {
    activeStrategyId = id;
    const s = list.find((x) => x.id === id);
    activePlayId = s?.plays?.[0]?.id || '';
  }
  function pickPlay(id) {
    activePlayId = id;
  }

  // Метрики play на основе закрытых сделок
  $: closedTrades = $trades.filter((t) => t.status === 'closed');
  $: playMeta = (() => {
    const m = {};
    for (const s of list) {
      for (const p of s.plays || []) {
        m[`${s.id}:${p.id}`] = { strategyName: s.name, playName: p.name };
      }
    }
    return m;
  })();
  $: playStats = getStatsByPlay(closedTrades, playMeta);
  function statsFor(strategyId, playId) {
    return playStats.find((x) => x.strategyId === strategyId && x.playId === playId) || null;
  }

  function addStrategy() {
    const id = strategies.addStrategy({
      name: 'Новая стратегия',
      description: 'Опиши логику и общие правила',
      htfBias: ['daily', 'h4'],
      killzones: [],
      plays: []
    });
    if (id) {
      activeStrategyId = id;
      activePlayId = '';
    }
  }

  function deleteStrategy(id) {
    if (!confirm('Удалить стратегию со всеми плейбуками?')) return;
    strategies.deleteStrategy(id);
    activeStrategyId = '';
    activePlayId = '';
  }

  function patchStrategy(patch) {
    if (!activeStrategy) return;
    strategies.updateStrategy(activeStrategy.id, patch);
  }

  function toggleStrategyKZ(kzId) {
    if (!activeStrategy) return;
    const cur = new Set(activeStrategy.killzones || []);
    if (cur.has(kzId)) cur.delete(kzId);
    else cur.add(kzId);
    patchStrategy({ killzones: [...cur] });
  }

  function addPlay() {
    if (!activeStrategy) return;
    const id = strategies.addPlay(activeStrategy.id, {
      name: 'Новый сетап',
      killzones: [],
      htfRequirement: 'aligned',
      preconditions: [],
      entryConditions: [],
      invalidations: [],
      rr: { min: 2, target: 3 }
    });
    if (id) activePlayId = id;
  }

  function deletePlay(id) {
    if (!activeStrategy) return;
    if (!confirm('Удалить сетап?')) return;
    strategies.deletePlay(activeStrategy.id, id);
    activePlayId = '';
  }

  function patchPlay(patch) {
    if (!activeStrategy || !activePlay) return;
    strategies.updatePlay(activeStrategy.id, activePlay.id, patch);
  }

  function togglePlayKZ(kzId) {
    if (!activePlay) return;
    const cur = new Set(activePlay.killzones || []);
    if (cur.has(kzId)) cur.delete(kzId);
    else cur.add(kzId);
    patchPlay({ killzones: [...cur] });
  }

  function addRule(kind) {
    if (!activeStrategy || !activePlay) return;
    strategies.addRule(activeStrategy.id, activePlay.id, kind, 'Новое правило', kind !== 'invalidations');
  }

  function updateRule(kind, ruleId, patch) {
    if (!activeStrategy || !activePlay) return;
    strategies.updateRule(activeStrategy.id, activePlay.id, kind, ruleId, patch);
  }

  function deleteRule(kind, ruleId) {
    if (!activeStrategy || !activePlay) return;
    strategies.deleteRule(activeStrategy.id, activePlay.id, kind, ruleId);
  }

  function exportJson() {
    const text = strategies.exportJson();
    navigator.clipboard?.writeText(text).then(
      () => toasts.success?.('Плейбуки скопированы в буфер обмена'),
      () => {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `playbooks_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    );
  }

  function applyImport() {
    if (!importText.trim()) {
      toasts.error?.('Пусто. Вставь JSON или загрузи файл.');
      return;
    }
    const ok = strategies.importJson(importText);
    if (ok) {
      toasts.success?.('Плейбуки импортированы');
      importText = '';
      showImport = false;
    }
  }

  function importFromFile(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => { importText = String(e.target.result || ''); applyImport(); ev.target.value = ''; };
    r.readAsText(f);
  }

  function resetToDefault() {
    if (!confirm('Сбросить все плейбуки к стандартному ICT-набору? Текущие будут потеряны.')) return;
    strategies.resetToDefault();
    activeStrategyId = '';
    activePlayId = '';
  }
</script>

<div class="playbook-view">
  <header class="pb-header">
    <h2>Плейбуки и стратегии</h2>
    <div class="pb-actions">
      <button class="btn btn-sm" on:click={addStrategy}>+ Стратегия</button>
      <button class="btn btn-sm" on:click={exportJson}>Экспорт JSON</button>
      <button class="btn btn-sm" on:click={() => (showImport = !showImport)}>Импорт</button>
      <label class="btn btn-sm import-label">
        Из файла…
        <input type="file" accept=".json" on:change={importFromFile} hidden />
      </label>
      <button class="btn btn-sm btn-danger" on:click={resetToDefault} title="Сбросить к ICT-дефолту">↺</button>
    </div>
  </header>

  {#if showImport}
    <div class="pb-import">
      <textarea
        rows="6"
        bind:value={importText}
        placeholder="Вставь JSON-плейбук сюда..."
      ></textarea>
      <div>
        <button class="btn btn-sm btn-primary" on:click={applyImport}>Применить</button>
        <button class="btn btn-sm" on:click={() => (showImport = false)}>Отмена</button>
      </div>
    </div>
  {/if}

  <div class="pb-grid">
    <aside class="pb-side">
      <div class="pb-side-title">Стратегии</div>
      <ul class="pb-side-list">
        {#each list as s}
          {@const playsCount = (s.plays || []).length}
          <li
            class:active={activeStrategy && s.id === activeStrategy.id}
            on:click={() => pickStrategy(s.id)}
            on:keydown={(e) => e.key === 'Enter' && pickStrategy(s.id)}
            tabindex="0"
            role="button"
          >
            <strong>{s.name}</strong>
            <span class="pb-side-meta">{playsCount} setup</span>
          </li>
        {/each}
      </ul>

      {#if activeStrategy}
        <div class="pb-side-title pb-mt">Сетапы</div>
        <ul class="pb-side-list">
          {#each activeStrategy.plays || [] as p}
            {@const st = statsFor(activeStrategy.id, p.id)}
            <li
              class:active={activePlay && p.id === activePlay.id}
              on:click={() => pickPlay(p.id)}
              on:keydown={(e) => e.key === 'Enter' && pickPlay(p.id)}
              tabindex="0"
              role="button"
            >
              <strong>{p.name}</strong>
              {#if st}
                <span class="pb-side-meta">
                  {st.count} · WR {formatNumber(st.winRate, 0)}%
                  <span class={st.sum >= 0 ? 'profit' : 'loss'}>
                    {st.sum >= 0 ? '+' : ''}{formatNumber(st.sum, 0)}
                  </span>
                </span>
              {:else}
                <span class="pb-side-meta">нет сделок</span>
              {/if}
            </li>
          {/each}
        </ul>
        <button class="btn btn-sm pb-add-play" on:click={addPlay}>+ Сетап</button>
      {/if}
    </aside>

    <main class="pb-main">
      {#if activeStrategy}
        <section class="pb-section">
          <div class="pb-section-title">
            Стратегия
            <button class="btn btn-sm btn-danger" on:click={() => deleteStrategy(activeStrategy.id)}>🗑 удалить</button>
          </div>
          <div class="form-group">
            <label>Название</label>
            <input type="text" value={activeStrategy.name}
              on:change={(e) => patchStrategy({ name: e.target.value })} />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea rows="2" value={activeStrategy.description}
              on:change={(e) => patchStrategy({ description: e.target.value })}></textarea>
          </div>
          <div class="form-group">
            <label>Активные killzones</label>
            <div class="kz-chips">
              {#each kzCatalog as kz}
                {@const on = (activeStrategy.killzones || []).includes(kz.id)}
                <button
                  type="button"
                  class="kz-chip {on ? 'on' : ''}"
                  on:click={() => toggleStrategyKZ(kz.id)}
                  title={kz.hint}
                >{kz.label}</button>
              {/each}
            </div>
          </div>
        </section>

        {#if activePlay}
          <section class="pb-section">
            <div class="pb-section-title">
              Setup ({activePlay.name})
              <button class="btn btn-sm btn-danger" on:click={() => deletePlay(activePlay.id)}>🗑 удалить</button>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Название сетапа</label>
                <input type="text" value={activePlay.name}
                  on:change={(e) => patchPlay({ name: e.target.value })} />
              </div>
              <div class="form-group">
                <label>HTF Bias requirement</label>
                <select value={activePlay.htfRequirement}
                  on:change={(e) => patchPlay({ htfRequirement: e.target.value })}>
                  <option value="any">Любой (без проверки)</option>
                  <option value="aligned">По bias (aligned)</option>
                  <option value="against">Против bias (Judas-style)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>R:R мин</label>
                <input type="number" min="0" step="0.1" value={activePlay.rr?.min ?? 2}
                  on:change={(e) => patchPlay({ rr: { ...(activePlay.rr || {}), min: Number(e.target.value) || 0 } })} />
              </div>
              <div class="form-group">
                <label>R:R таргет</label>
                <input type="number" min="0" step="0.1" value={activePlay.rr?.target ?? 3}
                  on:change={(e) => patchPlay({ rr: { ...(activePlay.rr || {}), target: Number(e.target.value) || 0 } })} />
              </div>
            </div>

            <div class="form-group">
              <label>Допустимые killzones</label>
              <div class="kz-chips">
                {#each kzCatalog as kz}
                  {@const on = (activePlay.killzones || []).includes(kz.id)}
                  <button
                    type="button"
                    class="kz-chip {on ? 'on' : ''}"
                    on:click={() => togglePlayKZ(kz.id)}
                    title={kz.hint}
                  >{kz.label}</button>
                {/each}
              </div>
              <div class="hint-inline">Сделка в другой KZ → soft-warning при сохранении.</div>
            </div>

            {#each ['preconditions', 'entryConditions', 'invalidations'] as kind}
              {@const list = activePlay[kind] || []}
              {@const title = kind === 'preconditions'
                ? 'Preconditions (до входа)'
                : kind === 'entryConditions'
                  ? 'Entry conditions (момент входа)'
                  : 'Invalidations (что отменяет идею)'}
              {@const showRequired = kind !== 'invalidations'}
              <div class="rules-block">
                <div class="rules-title">
                  {title}
                  <button class="btn btn-sm" on:click={() => addRule(kind)}>+ правило</button>
                </div>
                {#if list.length === 0}
                  <div class="rules-empty">Пусто</div>
                {/if}
                {#each list as r (r.id)}
                  <div class="rule-row">
                    <input
                      type="text"
                      value={r.label}
                      on:change={(e) => updateRule(kind, r.id, { label: e.target.value })}
                    />
                    {#if showRequired}
                      <label class="rule-req">
                        <input
                          type="checkbox"
                          checked={!!r.required}
                          on:change={(e) => updateRule(kind, r.id, { required: e.currentTarget.checked })}
                        />
                        required
                      </label>
                    {/if}
                    <button
                      class="btn btn-sm btn-danger"
                      on:click={() => deleteRule(kind, r.id)}
                      title="Удалить"
                    >×</button>
                  </div>
                {/each}
              </div>
            {/each}
          </section>

          {#if statsFor(activeStrategy.id, activePlay.id)}
            {@const st = statsFor(activeStrategy.id, activePlay.id)}
            <section class="pb-section pb-stats">
              <div class="pb-section-title">Метрики сетапа</div>
              <div class="pb-metrics">
                <div><span>Сделок</span><strong>{st.count}</strong></div>
                <div><span>Win Rate</span><strong>{formatNumber(st.winRate, 1)}%</strong></div>
                <div><span>Net PnL</span><strong class={st.sum >= 0 ? 'profit' : 'loss'}>{formatNumber(st.sum, 2)}</strong></div>
                <div><span>Expectancy</span><strong class={st.expectancy >= 0 ? 'profit' : 'loss'}>{formatNumber(st.expectancy, 2)}</strong></div>
                <div><span>Profit Factor</span><strong>{Number.isFinite(st.profitFactor) ? formatNumber(st.profitFactor, 2) : '∞'}</strong></div>
                <div><span>Wins / Losses</span><strong>{st.wins} / {st.losses}</strong></div>
              </div>
            </section>
          {:else}
            <section class="pb-section pb-stats muted">
              <em>Пока ни одной сделки с этим сетапом — выбери его в форме «Новая сделка».</em>
            </section>
          {/if}
        {:else}
          <section class="pb-section pb-stats muted">
            <em>Нет сетапов в стратегии. Жми «+ Сетап» слева.</em>
          </section>
        {/if}
      {:else}
        <section class="pb-section pb-stats muted">
          <em>Создай первую стратегию.</em>
        </section>
      {/if}
    </main>
  </div>
</div>

<style>
  .playbook-view {
    margin: 0 20px 24px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .pb-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pb-header h2 { margin: 0; font-size: 18px; }
  .pb-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .import-label { display: inline-flex; align-items: center; cursor: pointer; }

  .pb-import { margin: 12px 0; display: flex; flex-direction: column; gap: 8px; }
  .pb-import textarea {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  .pb-grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
  }
  @media (max-width: 800px) { .pb-grid { grid-template-columns: 1fr; } }

  .pb-side {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px;
    background: var(--bg);
  }
  .pb-side-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0 0 6px;
    font-weight: 700;
  }
  .pb-side-title.pb-mt { margin-top: 12px; }
  .pb-side-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  .pb-side-list li {
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
  }
  .pb-side-list li:hover { background: var(--bg-2); }
  .pb-side-list li.active { background: var(--bg-2); border-color: var(--accent); }
  .pb-side-meta { font-size: 11.5px; color: var(--text-muted); }
  .pb-add-play { width: 100%; margin-top: 8px; }

  .pb-main { display: flex; flex-direction: column; gap: 14px; }
  .pb-section {
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    padding: 12px;
  }
  .pb-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-strong);
    margin-bottom: 10px;
  }
  .pb-section.muted { color: var(--text-muted); font-style: italic; }

  .kz-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .kz-chip {
    padding: 4px 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 12px;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .kz-chip:hover { background: var(--bg-2); color: var(--text); }
  .kz-chip.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }

  .rules-block { margin-top: 10px; }
  .rules-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 6px;
  }
  .rules-empty { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
  .rule-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }
  .rule-row input[type="text"] {
    flex: 1;
    padding: 4px 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
    font-size: 12.5px;
  }
  .rule-req {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .pb-stats .pb-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
  .pb-stats .pb-metrics > div {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pb-stats .pb-metrics span {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.4px;
  }
  .pb-stats .pb-metrics strong {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--text-strong);
  }

  .hint-inline { margin-top: 4px; font-size: 11.5px; color: var(--text-muted); }
</style>
