<script>
  import { onMount } from 'svelte';
  import { trades, templates } from './lib/stores';
  import { formatDate, formatNumber, calculateStats } from './lib/utils';
  import TradeForm from './components/TradeForm.svelte';
  import TemplatesPanel from './components/TemplatesPanel.svelte';
  import Statistics from './components/Statistics.svelte';
  
  let showForm = false;
  let currentTrade = null;
  let formMode = 'add';
  let activeTab = 'open';
  
  $: openTrades = $trades.filter(t => t.status === 'open');
  $: closedTrades = $trades.filter(t => t.status === 'closed');
  $: stats = calculateStats(closedTrades);
  
  function editTrade(trade) {
    currentTrade = trade;
    formMode = 'edit';
    showForm = true;
  }
  
  function handleCloseTrade(trade) {
    currentTrade = trade;
    formMode = 'close';
    showForm = true;
  }
  
  function deleteTrade(id) {
    if (confirm('Удалить сделку?')) {
      $trades.deleteTrade(id);
    }
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
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          $trades.importTrades(data);
          alert('Данные импортированы');
        } catch (err) {
          alert('Ошибка импорта');
        }
      };
      reader.readAsText(file);
    }
  }
  
  function applyTemplate(template) {
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
      <button class="btn" on:click={exportData}>📤 Экспорт</button>
      <label class="btn import-label">
        📥 Импорт
        <input type="file" accept=".json" on:change={importData} hidden />
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
        <table class="trades-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Пара</th>
              <th>Напр.</th>
              <th>Объем</th>
              <th>Цена</th>
              <th>SL</th>
              <th>TP</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each openTrades as trade}
              <tr>
                <td>{formatDate(trade.dateOpen)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.direction === 'long' ? '📈 Long' : '📉 Short'}</td>
                <td>{trade.volume}</td>
                <td>{trade.priceOpen}</td>
                <td>{trade.sl || '-'}</td>
                <td>{trade.tp || '-'}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)}>✏️</button>
                    <button class="btn btn-sm btn-success" on:click={() => handleCloseTrade(trade)}>✅</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade.id)}>🗑️</button>
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
        <table class="trades-table">
          <thead>
            <tr>
              <th>Дата открытия</th>
              <th>Дата закрытия</th>
              <th>Пара</th>
              <th>Объем</th>
              <th>Цена откр.</th>
              <th>Цена закр.</th>
              <th>P/L</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each closedTrades as trade}
              <tr>
                <td>{formatDate(trade.dateOpen)}</td>
                <td>{formatDate(trade.dateClose)}</td>
                <td><strong>{trade.pair}</strong></td>
                <td>{trade.volume}</td>
                <td>{trade.priceOpen}</td>
                <td>{trade.priceClose}</td>
                <td class={trade.profit >= 0 ? 'profit' : 'loss'}>
                  {formatNumber(trade.profit, 2)} $
                </td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm" on:click={() => editTrade(trade)}>✏️</button>
                    <button class="btn btn-sm btn-danger" on:click={() => deleteTrade(trade.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'stats'}
    <Statistics stats={stats} />
  {/if}
  
  <TradeForm bind:open={showForm} trade={currentTrade} mode={formMode} />
</div>