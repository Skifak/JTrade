<script>
  import { createNewTrade, closeTrade, calculateProfit, isBrokerImportedTrade, formatNumber } from '../lib/utils';
  import { trades, userProfile } from '../lib/stores';
  import { PAIRS } from '../lib/constants';
  import { fetchMarketPrice } from '../lib/marketData';
  import {
    calculateTradeRisk,
    suggestVolumeForRisk,
    evaluateTradeRules,
    computeMaxRiskAmount
  } from '../lib/risk';
  import Modal from './Modal.svelte';
  import RiskConfirmModal from './RiskConfirmModal.svelte';

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

  // Soft-confirm для нарушений
  let pendingViolations = [];
  let showRiskConfirm = false;
  let pendingMode = null;
  
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
    const result = await fetchMarketPrice(formData.pair);
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

  // Live-риск открываемой/редактируемой сделки
  $: tradeRisk = (mode === 'add' || mode === 'edit')
    ? calculateTradeRisk(formData, $userProfile)
    : null;
  $: maxRiskAmount = computeMaxRiskAmount($userProfile);
  $: suggestedVolume = (mode === 'add' || mode === 'edit')
    ? suggestVolumeForRisk(formData, $userProfile)
    : null;
  $: riskOverLimit = !!(tradeRisk?.riskAmount != null && maxRiskAmount > 0 && tradeRisk.riskAmount > maxRiskAmount * 1.001);

  function applySuggestedVolume() {
    if (suggestedVolume && suggestedVolume > 0) {
      formData = { ...formData, volume: suggestedVolume };
    }
  }

  function commitTrade(extra = {}) {
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

      const payload = { ...formData, ...extra };
      if (mode === 'add') {
        trades.addTrade({ ...payload, profit: null });
      } else if (mode === 'edit') {
        trades.updateTrade(trade.id, payload);
      }
    }
    closeModal();
  }

  function save() {
    // Pre-trade gate действует только при открытии/редактировании открытой сделки.
    if (mode === 'add' || mode === 'edit') {
      const allTrades = $trades;
      const violations = evaluateTradeRules(formData, $userProfile, {
        openTrades: allTrades.filter((t) => t.status === 'open'),
        closedTrades: allTrades.filter((t) => t.status === 'closed'),
        isEditing: mode === 'edit'
      });
      if (violations.length > 0) {
        pendingViolations = violations;
        pendingMode = mode;
        showRiskConfirm = true;
        return;
      }
      commitTrade({ ruleViolations: [] });
      return;
    }
    commitTrade();
  }

  function onRiskConfirmed() {
    showRiskConfirm = false;
    commitTrade({ ruleViolations: pendingViolations });
    pendingViolations = [];
    pendingMode = null;
  }

  function onRiskCancelled() {
    showRiskConfirm = false;
    pendingViolations = [];
    pendingMode = null;
  }

  function closeModal() {
    open = false;
    formData = {};
    closePrice = 0;
    previewProfit = null;
    showRiskConfirm = false;
    pendingViolations = [];
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
          <div class="value-mode-row">
            <input id="volume" type="number" step="0.01" bind:value={formData.volume} />
            <button
              type="button"
              class="btn btn-sm"
              on:click={applySuggestedVolume}
              disabled={!suggestedVolume}
              title={suggestedVolume
                ? `Подобрать объём под лимит риска (${formatNumber(maxRiskAmount, 2)} ${$userProfile?.accountCurrency || 'USD'}): ${suggestedVolume} лот`
                : 'Заполни цену открытия и SL — кнопка подберёт объём под лимит риска из профиля'}
            >🎯</button>
          </div>
          {#if suggestedVolume && Math.abs(suggestedVolume - Number(formData.volume || 0)) > 0.001}
            <div class="market-msg">
              Под лимит риска: <strong>{suggestedVolume}</strong> лот
            </div>
          {/if}
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

      {#if tradeRisk}
        <div class="risk-card {riskOverLimit ? 'over' : ''}">
          <div class="risk-card-row">
            <span class="risk-card-label">Риск сделки</span>
            <span class="risk-card-value {riskOverLimit ? 'loss' : ''}">
              {tradeRisk.hasSl && tradeRisk.riskAmount != null
                ? `${formatNumber(tradeRisk.riskAmount, 2)} ${$userProfile?.accountCurrency || 'USD'}` +
                  (tradeRisk.riskPercentOfCapital != null
                    ? ` (${formatNumber(tradeRisk.riskPercentOfCapital, 2)}% капитала)`
                    : '')
                : 'SL не задан — риск ∞'}
            </span>
          </div>
          {#if maxRiskAmount > 0}
            <div class="risk-card-row">
              <span class="risk-card-label">Лимит из профиля</span>
              <span class="risk-card-value">
                {formatNumber(maxRiskAmount, 2)} {$userProfile?.accountCurrency || 'USD'}
                {#if riskOverLimit}<span class="loss"> · превышен</span>{/if}
              </span>
            </div>
          {/if}
          <div class="risk-card-row">
            <span class="risk-card-label">R:R</span>
            <span class="risk-card-value">
              {tradeRisk.rrRatio != null
                ? `1 : ${formatNumber(tradeRisk.rrRatio, 2)}` +
                  (tradeRisk.rrRatio < 1 ? ' (хуже 1:1)' : '')
                : 'TP не задан'}
            </span>
          </div>
        </div>
      {/if}

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

<RiskConfirmModal
  open={showRiskConfirm}
  violations={pendingViolations}
  on:confirm={onRiskConfirmed}
  on:close={onRiskCancelled}
/>

<style>
  .market-msg {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
  .risk-card {
    margin: 8px 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-border);
    background: var(--bg-2);
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .risk-card.over {
    border-left-color: var(--loss);
    background: rgba(185, 28, 28, 0.05);
  }
  .risk-card-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .risk-card-label {
    color: var(--text-muted);
  }
  .risk-card-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text-strong);
    text-align: right;
  }
</style>