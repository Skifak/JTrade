<script>
  import { formatNumber, formatDate } from '../lib/utils';

  export let stats;

  $: hasTrades = stats?.totalTrades > 0;
</script>

{#if !hasTrades}
  <div class="empty-state">📊 Нет данных для статистики</div>
{:else}
  {#if stats.firstDate || stats.lastDate}
    <div class="stats-period">
      Период: <strong>{formatDate(stats.firstDate, 'DD.MM.YYYY')}</strong>
      &nbsp;—&nbsp;
      <strong>{formatDate(stats.lastDate, 'DD.MM.YYYY')}</strong>
    </div>
  {/if}

  <h3 class="stats-section-title">Доходность</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Всего сделок</div>
      <div class="stat-value">{stats.totalTrades}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Чистая прибыль</div>
      <div class="stat-value {stats.netProfit >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.netProfit, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общая прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.grossProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общий убыток</div>
      <div class="stat-value loss">-${formatNumber(stats.grossLoss, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Фактор прибыли</div>
      <div class="stat-value">
        {Number.isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor, 2) : '∞'}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Матожидание</div>
      <div class="stat-value {stats.expectancy >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.expectancy, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма комиссий</div>
      <div class="stat-value {stats.sumCommission >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.sumCommission, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма свопов</div>
      <div class="stat-value {stats.sumSwap >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.sumSwap, 2)}
      </div>
    </div>
  </div>

  <h3 class="stats-section-title">Сделки</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value">{formatNumber(stats.winRate, 1)}%</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Прибыльные / Убыточные</div>
      <div class="stat-value">
        <span class="profit">{stats.winningCount}</span>
        &nbsp;/&nbsp;
        <span class="loss">{stats.losingCount}</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.avgProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средний убыток</div>
      <div class="stat-value loss">-${formatNumber(stats.avgLoss, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.maxProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. убыток</div>
      <div class="stat-value loss">${formatNumber(stats.maxLoss, 2)}</div>
    </div>
  </div>

  <h3 class="stats-section-title">Long / Short</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Длинные (% выигравших)</div>
      <div class="stat-value">
        {stats.longCount} ({formatNumber(stats.longWinRate, 1)}%)
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Короткие (% выигравших)</div>
      <div class="stat-value">
        {stats.shortCount} ({formatNumber(stats.shortWinRate, 1)}%)
      </div>
    </div>
  </div>

  <h3 class="stats-section-title">Серии</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Макс. подряд выигрышей</div>
      <div class="stat-value">
        {stats.maxConsecutiveWins}
        <small class="stat-sub profit">(${formatNumber(stats.maxConsecutiveWinAmount, 2)})</small>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. подряд проигрышей</div>
      <div class="stat-value">
        {stats.maxConsecutiveLosses}
        <small class="stat-sub loss">(${formatNumber(stats.maxConsecutiveLossAmount, 2)})</small>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя серия выигрышей</div>
      <div class="stat-value">{formatNumber(stats.avgConsecutiveWins, 1)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя серия проигрышей</div>
      <div class="stat-value">{formatNumber(stats.avgConsecutiveLosses, 1)}</div>
    </div>
  </div>

  <h3 class="stats-section-title">Риск</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Макс. просадка ($)</div>
      <div class="stat-value loss">-${formatNumber(stats.maxDrawdown, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. просадка (%)</div>
      <div class="stat-value loss">{formatNumber(stats.maxDrawdownPercent, 2)}%</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Фактор восстановления</div>
      <div class="stat-value">{formatNumber(stats.recoveryFactor, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Коэф. Шарпа (упрощ.)</div>
      <div class="stat-value">{formatNumber(stats.sharpeRatio, 2)}</div>
    </div>
  </div>
{/if}

<style>
  .stats-section-title {
    margin: 24px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  .stats-period {
    margin-bottom: 12px;
    opacity: 0.85;
    font-size: 13px;
  }

  .stat-sub {
    display: block;
    font-size: 11px;
    margin-top: 2px;
    font-weight: 500;
  }

  .empty-state {
    padding: 24px;
    text-align: center;
    opacity: 0.7;
  }
</style>
