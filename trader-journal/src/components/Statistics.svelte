<script>
  import { formatNumber } from '../lib/utils';
  
  export let stats;
</script>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Всего сделок</div>
    <div class="stat-value">{stats.totalTrades}</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Общий P&L</div>
    <div class="stat-value {stats.totalProfit >= 0 ? 'profit' : 'loss'}">
      ${formatNumber(stats.totalProfit, 2)}
    </div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Win Rate</div>
    <div class="stat-value">{formatNumber(stats.winRate, 1)}%</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Средняя прибыль</div>
    <div class="stat-value profit">${formatNumber(stats.avgProfit, 2)}</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Средний убыток</div>
    <div class="stat-value loss">${formatNumber(stats.avgLoss, 2)}</div>
  </div>
  
  <div class="stat-card">
    <div class="stat-label">Фактор прибыли</div>
    <div class="stat-value">{formatNumber(stats.profitFactor, 2)}</div>
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