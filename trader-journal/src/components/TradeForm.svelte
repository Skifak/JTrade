<script>
  import { createNewTrade, closeTrade, calculateProfit, isBrokerImportedTrade } from '../lib/utils';
  import { trades, userProfile } from '../lib/stores';
  import { PAIRS } from '../lib/constants';
  import { fetchMarketPrice } from '../lib/marketData';
  import Modal from './Modal.svelte';

  export let open = false;
  export let trade = null;
  export let mode = 'add';

  let formData = {};
  let useCurrentTime = true;
  let closePrice = 0;
  let previewProfit = null;

  let useMarketPrice = false;
  let marketLoading = false;
  let marketError = '';
  let marketSource = '';
  let marketTimestamp = null;
  
  $: if (trade && open) {
    formData = { ...trade };
    useCurrentTime = !trade.dateOpenManual;
  } else if (!trade && open) {
    formData = createNewTrade();
    useCurrentTime = true;
  }

  $: if (!open) {
    useMarketPrice = false;
    marketLoading = false;
    marketError = '';
    marketSource = '';
    marketTimestamp = null;
  }

  async function refreshMarketPrice() {
    if (!formData?.pair) {
      marketError = 'Сначала выбери пару';
      return;
    }
    marketLoading = true;
    marketError = '';
    const result = await fetchMarketPrice(formData.pair, {
      binanceKey: $userProfile?.apiBinanceKey,
      fcsapiKey: $userProfile?.apiFcsapiKey
    });
    marketLoading = false;
    if (result?.error) {
      marketError = result.error;
      marketSource = result.source || '';
      return;
    }
    if (result?.price) {
      formData.priceOpen = Number(result.price);
      marketSource = result.source;
      marketTimestamp = result.timestamp;
    }
  }

  $: if (useMarketPrice && open && mode === 'add' && formData?.pair) {
    refreshMarketPrice();
  }

  $: if (mode === 'close' && trade && closePrice) {
    const simulated = {
      ...trade,
      priceClose: Number(closePrice),
      commission: Number(formData.commission) || 0,
      swap: Number(formData.swap) || 0,
      status: 'closed'
    };
    previewProfit = calculateProfit(simulated);
  } else {
    previewProfit = null;
  }

  function tradeFieldsEdited(original, current) {
    if (!original || !current) return false;
    const num = (v) => Number(v) || 0;
    return (
      num(original.priceOpen) !== num(current.priceOpen) ||
      num(original.priceClose) !== num(current.priceClose) ||
      num(original.volume) !== num(current.volume) ||
      num(original.commission) !== num(current.commission) ||
      num(original.swap) !== num(current.swap) ||
      String(original.direction) !== String(current.direction) ||
      String(original.pair) !== String(current.pair)
    );
  }

  $: editClosedDisplayProfit =
    mode === 'edit-closed' && trade && formData
      ? isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, formData)
        ? Number(formData.profit) || 0
        : calculateProfit({ ...formData, status: 'closed' }) || 0
      : null;
  
  function save() {
    if (mode === 'close') {
      const base = {
        ...trade,
        commission: Number(formData.commission) || 0,
        swap: Number(formData.swap) || 0
      };
      const closed = closeTrade(base, Number(closePrice));
      trades.updateTrade(trade.id, closed);
    } else if (mode === 'edit-closed') {
      const updatedClosed = {
        ...trade,
        ...formData,
        status: 'closed',
        priceClose: Number(formData.priceClose) || 0,
        commission: Number(formData.commission) || 0,
        swap: Number(formData.swap) || 0
      };
      updatedClosed.profit =
        isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, updatedClosed)
          ? Number(formData.profit) || 0
          : calculateProfit(updatedClosed);
      trades.updateTrade(trade.id, updatedClosed);
    } else {
      if (!useCurrentTime && !formData.dateOpen) {
        formData.dateOpen = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
      formData.dateOpenManual = !useCurrentTime;
      
      if (mode === 'add') {
        trades.addTrade({ ...formData, profit: null });
      } else if (mode === 'edit') {
        trades.updateTrade(trade.id, formData);
      }
    }
    closeModal();
  }
  
  function closeModal() {
    open = false;
    formData = {};
    closePrice = 0;
    previewProfit = null;
  }
</script>

<Modal {open} on:close={closeModal}>
  <div slot="header">
    <h2>
      {mode === 'add' ? 'Новая сделка' : 
       mode === 'close' ? 'Закрыть сделку' :
       mode === 'edit-closed' ? 'Редактировать закрытую сделку' :
       'Редактировать сделку'}
    </h2>
  </div>
  
  <div slot="body">
    {#if mode === 'close'}
      <div class="info-box">
        <p><strong>{trade?.pair}</strong> {trade?.direction === 'long' ? '📈 Long' : '📉 Short'}</p>
        <p>Объем: {trade?.volume} лот</p>
        <p>Цена открытия: {trade?.priceOpen}</p>
        {#if trade?.sl}
          <p>SL: {trade.sl}</p>
        {/if}
        {#if trade?.tp}
          <p>TP: {trade.tp}</p>
        {/if}
      </div>

      <div class="form-group">
        <label for="close-price">Цена закрытия</label>
        <input 
          id="close-price"
          type="number" 
          step="0.00001" 
          bind:value={closePrice} 
          placeholder="1.09250" 
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="commission-close">Комиссия</label>
          <input
            id="commission-close"
            type="number"
            step="0.01"
            bind:value={formData.commission}
            placeholder="0.00"
          />
        </div>
        <div class="form-group">
          <label for="swap-close">Своп</label>
          <input
            id="swap-close"
            type="number"
            step="0.01"
            bind:value={formData.swap}
            placeholder="0.00"
          />
        </div>
      </div>

      {#if previewProfit !== null}
        <div class="info-box">
          <p>
            Предварительный результат:&nbsp;
            <span class={previewProfit >= 0 ? 'profit' : 'loss'}>
              {previewProfit.toFixed(2)} $
            </span>
          </p>
        </div>
      {/if}
    {:else if mode === 'edit-closed'}
      <div class="info-box">
        <p><strong>{trade?.pair}</strong> {trade?.direction === 'long' ? '📈 Long' : '📉 Short'}</p>
        <p>Объем: {trade?.volume} лот</p>
        <p>Цена открытия: {trade?.priceOpen}</p>
        <p>Дата открытия: {trade?.dateOpen || '-'}</p>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="edit-close-price">Цена закрытия</label>
          <input
            id="edit-close-price"
            type="number"
            step="0.00001"
            bind:value={formData.priceClose}
            placeholder="1.09250"
          />
        </div>
        <div class="form-group">
          <label for="edit-close-date">Дата закрытия</label>
          <input id="edit-close-date" type="text" bind:value={formData.dateClose} placeholder="YYYY-MM-DD HH:mm:ss" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="edit-close-commission">Комиссия</label>
          <input id="edit-close-commission" type="number" step="0.01" bind:value={formData.commission} />
        </div>
        <div class="form-group">
          <label for="edit-close-swap">Своп</label>
          <input id="edit-close-swap" type="number" step="0.01" bind:value={formData.swap} />
        </div>
      </div>

      <div class="info-box">
        <p>
          {#if isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, formData)}
            P&amp;L из отчёта MT5 (без пересчёта):&nbsp;
          {:else}
            Обновленный результат (по формуле):&nbsp;
          {/if}
          <span class={(editClosedDisplayProfit || 0) >= 0 ? 'profit' : 'loss'}>
            {(editClosedDisplayProfit || 0).toFixed(2)} $
          </span>
        </p>
      </div>
    {:else}
      <div class="form-group">
        <label for="pair">Валютная пара</label>
        <select id="pair" bind:value={formData.pair}>
          {#each PAIRS as pair}
            <option value={pair}>{pair}</option>
          {/each}
        </select>
      </div>
      
      <div class="form-group">
        <span class="label-text">Направление</span>
        <div class="direction-buttons">
          <button 
            class="direction-btn {formData.direction === 'long' ? 'active' : ''}" 
            on:click={() => formData.direction = 'long'}
            type="button"
          >📈 Long</button>
          <button 
            class="direction-btn {formData.direction === 'short' ? 'active' : ''}" 
            on:click={() => formData.direction = 'short'}
            type="button"
          >📉 Short</button>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="volume">Объем (лоты)</label>
          <input id="volume" type="number" step="0.01" bind:value={formData.volume} />
        </div>
        <div class="form-group">
          <label for="price-open">Цена открытия</label>
          <div class="value-mode-row">
            <input
              id="price-open"
              type="number"
              step="0.00001"
              bind:value={formData.priceOpen}
              disabled={useMarketPrice && marketLoading}
            />
            <button
              type="button"
              class="btn btn-sm"
              on:click={refreshMarketPrice}
              disabled={marketLoading || !formData.pair}
              title="Обновить рыночную цену"
            >
              {marketLoading ? '⏳' : '↻'}
            </button>
          </div>
          <label class="checkbox-label" style="margin-top: 6px;">
            <input type="checkbox" bind:checked={useMarketPrice} />
            📡 По рынку (live-цена)
          </label>
          {#if marketError}
            <div class="market-msg loss">{marketError}</div>
          {:else if useMarketPrice && marketSource && !marketLoading}
            <div class="market-msg">
              Источник: {marketSource}{marketTimestamp ? ` · ${new Date(marketTimestamp).toLocaleTimeString()}` : ''}
            </div>
          {/if}
        </div>
      </div>
      
      <div class="form-group">
        <span class="label-text">Дата и время открытия</span>
        <div class="datetime-control">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={useCurrentTime} />
            Текущее время
          </label>
          {#if !useCurrentTime}
            <input type="datetime-local" bind:value={formData.dateOpen} />
          {/if}
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="sl">Stop Loss</label>
          <input id="sl" type="number" step="0.00001" bind:value={formData.sl} placeholder="1.08200" />
        </div>
        <div class="form-group">
          <label for="tp">Take Profit</label>
          <input id="tp" type="number" step="0.00001" bind:value={formData.tp} placeholder="1.09100" />
        </div>
      </div>
      
      <div class="form-group">
        <label for="comment">Комментарий</label>
        <textarea id="comment" bind:value={formData.comment} rows="3"></textarea>
      </div>
    {/if}
  </div>
  
  <div slot="footer">
    <button type="button" on:click={closeModal}>Отмена</button>
    <button type="button" class="btn btn-primary" on:click={save}>Сохранить</button>
  </div>
</Modal>

<style>
  .market-msg {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
</style>