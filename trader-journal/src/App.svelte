<script>
  import { trades, userProfile } from './lib/stores';
  import {
    formatDate,
    formatNumber,
    formatDuration,
    calculateStats,
    calculatePips,
    calculatePricePercent,
    getTradeSource
  } from './lib/utils';
  import { parseMt5ReportHtml } from './lib/mt5Parser';
  import TradeForm from './components/TradeForm.svelte';
  import TemplatesPanel from './components/TemplatesPanel.svelte';
  import Statistics from './components/Statistics.svelte';
  import ProfileModal from './components/ProfileModal.svelte';

  let showForm = false;
  let showProfile = false;
  let currentTrade = null;
  let formMode = 'add';
  let activeTab = 'open';

  let openSort = { key: 'dateOpen', dir: 'desc' };
  let closedSort = { key: 'dateClose', dir: 'desc' };
  let openSymbolFilter = '';
  let closedSymbolFilter = '';

  $: openTrades = $trades.filter((t) => t.status === 'open');
  $: closedTrades = $trades.filter((t) => t.status === 'closed');
  $: stats = calculateStats(closedTrades, {
    initialCapital: Number($userProfile?.initialCapital) || 0
  });

  $: openSymbols = Array.from(new Set(openTrades.map((t) => t.pair))).sort();
  $: closedSymbols = Array.from(new Set(closedTrades.map((t) => t.pair))).sort();

  $: filteredOpenTrades = sortTrades(
    openSymbolFilter ? openTrades.filter((t) => t.pair === openSymbolFilter) : openTrades,
    openSort
  );
  $: filteredClosedTrades = sortTrades(
    closedSymbolFilter
      ? closedTrades.filter((t) => t.pair === closedSymbolFilter)
      : closedTrades,
    closedSort
  );

  $: closedTotals = filteredClosedTrades.reduce(
    (acc, t) => {
      acc.profit += Number(t.profit) || 0;
      acc.commission += Number(t.commission) || 0;
      acc.swap += Number(t.swap) || 0;
      return acc;
    },
    { profit: 0, commission: 0, swap: 0 }
  );

  function sortTrades(list, { key, dir }) {
    const mul = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
  }

  function sortValue(trade, key) {
    if (key === 'dateOpen' || key === 'dateClose') {
      const v = trade[key];
      return v ? new Date(v).getTime() : null;
    }
    if (key === 'pips') return calculatePips(trade);
    if (key === 'pct') return calculatePricePercent(trade);
    if (key === 'duration') {
      const start = trade.dateOpen ? new Date(trade.dateOpen).getTime() : 0;
      const end = trade.dateClose ? new Date(trade.dateClose).getTime() : Date.now();
      return end - start;
    }
    const v = trade[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return v.toLowerCase();
    return v ?? null;
  }

  function toggleSort(state, key) {
    if (state.key === key) {
      state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.key = key;
      state.dir = 'desc';
    }
    return { ...state };
  }

  function sortIndicator(state, key) {
    if (state.key !== key) return '';
    return state.dir === 'asc' ? ' ▲' : ' ▼';
  }

  function sourceIcon(trade) {
    const src = getTradeSource(trade);
    if (src === 'mt5-history') return { icon: '📥', title: 'Импорт из истории MT5' };
    if (src === 'mt5-trade') return { icon: '📡', title: 'Импорт открытых из MT5' };
    return { icon: '✍️', title: 'Ручная сделка' };
  }

  function editTrade(trade) {
    currentTrade = trade;
    formMode = trade?.status === 'closed' ? 'edit-closed' : 'edit';
    showForm = true;
  }

  function handleCloseTrade(trade) {
    currentTrade = trade;
    formMode = 'close';
    showForm = true;
  }

  function deleteTrade(trade) {
    if (confirm('Удалить сделку?')) {
      trades.deleteTrade(trade);
    }
  }

  function clearClosedTrades() {
    if (closedTrades.length === 0) return;
    if (confirm(`Удалить все закрытые сделки (${closedTrades.length})?`)) {
      trades.deleteClosedTrades();
    }
  }

  function duplicateAsOpen(trade) {
    currentTrade = {
      ...trade,
      id: undefined,
      status: 'open',
      dateOpen: new Date().toISOString().slice(0, 19).replace('T', ' '),
      dateOpenManual: false,
      dateClose: null,
      priceClose: null,
      profit: null,
      commission: 0,
      swap: 0,
      tags: ['duplicated'],
      comment: trade.comment ? `Дубликат: ${trade.comment}` : 'Дубликат закрытой'
    };
    formMode = 'add';
    showForm = true;
  }

  function addNew() {
    currentTrade = null;
    formMode = 'add';
    showForm = true;
  }

  function exportData() {
    const data = $trades;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = String(e.target.result || '');
        const fileName = file.name.toLowerCase();
        const isHtml = fileName.endsWith('.html') || fileName.endsWith('.htm');

        if (isHtml) {
          const parsed = parseMt5ReportHtml(raw);
          if (!parsed.reportType || parsed.trades.length === 0) {
            alert('Файл не распознан как отчет MT5 или не содержит сделок');
            return;
          }

          const existingById = new Map($trades.map((trade) => [trade.id, trade]));
          for (const importedTrade of parsed.trades) {
            existingById.set(importedTrade.id, importedTrade);
          }

          trades.importTrades(Array.from(existingById.values()));
          alert(`Импортировано из MT5 (${parsed.reportType}): ${parsed.trades.length} сделок`);
          event.target.value = '';
          return;
        }

        const data = JSON.parse(raw);
        trades.importTrades(data);
        alert('JSON-данные импортированы');
      } catch (err) {
        alert('Ошибка импорта файла');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function applyTemplate() {
    currentTrade = null;
    formMode = 'add';
    showForm = true;
  }
</script>

<div class="trader-journal">
  <div class="journal-header">
    <h1>📊 Журнал трейдера</h1>
    <div class="btn-group">
      <button class="btn btn-primary" on:click={addNew}>+ Новая сделка</button>
      <button class="btn" on:click={() => showProfile = true}>👤 Профиль</button>
      <button class="btn" on:click={exportData}>📤 Экспорт</button>
      <label class="btn import-label">
        📥 Импорт (JSON/MT5 HTML)
        <input type="file" accept=".json,.html,.htm" on:change={importData} hidden />
      </label>
    </div>
  </div>

  <TemplatesPanel on:apply={applyTemplate} />

  <div class="tabs">
    <button class="tab {activeTab === 'open' ? 'active' : ''}" on:click={() => activeTab = 'open'}>
      Открытые ({openTrades.length})
    </button>
    <button class="tab {activeTab === 'closed' ? 'active' : ''}" on:click={() => activeTab = 'closed'}>
      Закрытые ({closedTrades.length})
    </button>
    <button class="tab {activeTab === 'stats' ? 'active' : ''}" on:click={() => activeTab = 'stats'}>
      Статистика
    </button>
  </div>

  {#if activeTab === 'open'}
    <div class="table-container">
      {#if openTrades.length === 0}
        <div class="empty-state">📭 Нет открытых сделок</div>
      {:else}
        <div class="table-toolbar">
          <label>
            Символ:
            <select bind:value={openSymbolFilter}>
              <option value="">Все ({openTrades.length})</option>
              {#each openSymbols as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </label>
        </div>
        <table class="trades-table">
          <thead>
            <tr>
              <th title="Источник">⚑</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'dateOpen'))}>
                Открытие{sortIndicator(openSort, 'dateOpen')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'pair'))}>
                Пара{sortIndicator(openSort, 'pair')}
              </th>
              <th>Напр.</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'volume'))}>
                Объем{sortIndicator(openSort, 'volume')}
              </th>
              <th>Цена откр.</th>
              <th>Рынок</th>
              <th>SL</th>
              <th>TP</th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'swap'))}>
                Своп{sortIndicator(openSort, 'swap')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'profit'))}>
                Плав. P/L{sortIndicator(openSort, 'profit')}
              </th>
              <th class="sortable" on:click={() => (openSort = toggleSort(openSort, 'duration'))}>
                Длит.{sortIndicator(openSort, 'duration')}
              </th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredOpenTrades as trade}
              {@const src = sourceIcon(trade)}
              <tr>
                <td title={src.title}>{src.icon}</td>
                <td>{formatDate(trade.dateOpen)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.direction === 'long' ? '📈 Long' : '📉 Short'}</td>
                <td>{trade.volume}</td>
                <td>{trade.priceOpen}</td>
                <td>{trade.marketPrice ?? '-'}</td>
                <td>{trade.sl || '-'}</td>
                <td>{trade.tp || '-'}</td>
                <td class={Number(trade.swap) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.swap) || 0, 2)}
                </td>
                <td class={Number(trade.profit) >= 0 ? 'profit' : 'loss'}>
                  {trade.profit != null ? `${formatNumber(trade.profit, 2)} $` : '-'}
                </td>
                <td>{formatDuration(trade.dateOpen, null)}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)} title="Изменить">✏️</button>
                    <button class="btn btn-sm btn-success" on:click={() => handleCloseTrade(trade)} title="Закрыть">✅</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade)} title="Удалить">🗑️</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'closed'}
    <div class="table-container">
      {#if closedTrades.length === 0}
        <div class="empty-state">📭 Нет закрытых сделок</div>
      {:else}
        <div class="table-toolbar">
          <label>
            Символ:
            <select bind:value={closedSymbolFilter}>
              <option value="">Все ({closedTrades.length})</option>
              {#each closedSymbols as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </label>
          <button class="btn btn-danger" on:click={clearClosedTrades}>🧹 Удалить все закрытые</button>
        </div>
        <table class="trades-table">
          <thead>
            <tr>
              <th title="Источник">⚑</th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'dateOpen'))}>
                Откр.{sortIndicator(closedSort, 'dateOpen')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'dateClose'))}>
                Закр.{sortIndicator(closedSort, 'dateClose')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'duration'))}>
                Длит.{sortIndicator(closedSort, 'duration')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pair'))}>
                Пара{sortIndicator(closedSort, 'pair')}
              </th>
              <th>Напр.</th>
              <th>Объем</th>
              <th>Откр. / Закр.</th>
              <th>SL / TP</th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pips'))}>
                Pips{sortIndicator(closedSort, 'pips')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'pct'))}>
                %{sortIndicator(closedSort, 'pct')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'commission'))}>
                Комис.{sortIndicator(closedSort, 'commission')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'swap'))}>
                Своп{sortIndicator(closedSort, 'swap')}
              </th>
              <th class="sortable" on:click={() => (closedSort = toggleSort(closedSort, 'profit'))}>
                P/L{sortIndicator(closedSort, 'profit')}
              </th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredClosedTrades as trade}
              {@const src = sourceIcon(trade)}
              {@const pips = calculatePips(trade)}
              {@const pct = calculatePricePercent(trade)}
              <tr title={trade.comment || ''}>
                <td title={src.title}>{src.icon}</td>
                <td>{formatDate(trade.dateOpen)}</td>
                <td>{formatDate(trade.dateClose)}</td>
                <td>{formatDuration(trade.dateOpen, trade.dateClose)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.direction === 'long' ? '📈 Long' : '📉 Short'}</td>
                <td>{trade.volume}</td>
                <td class="mono">{trade.priceOpen} / {trade.priceClose}</td>
                <td class="mono">{trade.sl || '-'} / {trade.tp || '-'}</td>
                <td class={pips == null ? '' : pips >= 0 ? 'profit' : 'loss'}>
                  {pips != null ? formatNumber(pips, 1) : '-'}
                </td>
                <td class={pct == null ? '' : pct >= 0 ? 'profit' : 'loss'}>
                  {pct != null ? formatNumber(pct, 2) + '%' : '-'}
                </td>
                <td class={Number(trade.commission) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.commission) || 0, 2)}
                </td>
                <td class={Number(trade.swap) >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(Number(trade.swap) || 0, 2)}
                </td>
                <td class={trade.profit >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(trade.profit, 2)} $
                </td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)} title="Изменить">✏️</button>
                    <button class="btn btn-sm" on:click={() => duplicateAsOpen(trade)} title="Дублировать как открытую">📋</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade)} title="Удалить">🗑️</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="totals">
              <td colspan="11" style="text-align: right;"><strong>Итого:</strong></td>
              <td class={closedTotals.commission >= 0 ? 'profit' : 'loss'}>
                {formatNumber(closedTotals.commission, 2)}
              </td>
              <td class={closedTotals.swap >= 0 ? 'profit' : 'loss'}>
                {formatNumber(closedTotals.swap, 2)}
              </td>
              <td class={closedTotals.profit >= 0 ? 'profit' : 'loss'}>
                <strong>{formatNumber(closedTotals.profit, 2)} $</strong>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'stats'}
    <Statistics stats={stats} />
  {/if}

  <TradeForm bind:open={showForm} trade={currentTrade} mode={formMode} />
  <ProfileModal bind:open={showProfile} {closedTrades} />
</div>

<style>
  .table-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .table-toolbar select {
    padding: 4px 8px;
  }
  .sortable {
    cursor: pointer;
    user-select: none;
  }
  .sortable:hover {
    opacity: 0.8;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    white-space: nowrap;
  }
  tfoot tr.totals td {
    border-top: 2px solid currentColor;
    font-weight: 600;
    padding-top: 8px;
  }
</style>
