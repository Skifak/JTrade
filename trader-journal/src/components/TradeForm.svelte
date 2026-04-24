<script>
  import { createNewTrade, closeTrade } from '../lib/utils';
  import { trades } from '../lib/stores';
  import { PAIRS } from '../lib/constants';
  import Modal from './Modal.svelte';
  
  export let open = false;
  export let trade = null;
  export let mode = 'add';
  
  let formData = {};
  let useCurrentTime = true;
  let closePrice = 0;
  
  $: if (trade && open) {
    formData = { ...trade };
    useCurrentTime = !trade.dateOpenManual;
  } else if (!trade && open) {
    formData = createNewTrade();
    useCurrentTime = true;
  }
  
  function save() {
    if (mode === 'close') {
      const closed = closeTrade(trade, closePrice);
      trades.updateTrade(trade.id, closed);
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
  }
</script>

<Modal {open} on:close={closeModal}>
  <div slot="header">
    <h2>
      {mode === 'add' ? 'Новая сделка' : 
       mode === 'close' ? 'Закрыть сделку' : 'Редактировать сделку'}
    </h2>
  </div>
  
  <div slot="body">
    {#if mode === 'close'}
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
      <div class="info-box">
        <p>Открыта: {trade?.pair} {trade?.direction === 'long' ? '📈' : '📉'}</p>
        <p>Цена открытия: {trade?.priceOpen}</p>
        <p>Объем: {trade?.volume}</p>
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
          <input id="price-open" type="number" step="0.00001" bind:value={formData.priceOpen} />
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