<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatNumber } from '../../lib/utils';

  /** Из journalPnLDailyBars */
  export let days = [];
  export let currency = 'USD';
  export let moneyDecimals = 2;

  export let chartHeight = 200;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    if (!Array.isArray(days) || days.length === 0) {
      chart?.destroy();
      chart = null;
      return;
    }

    const hasAnyTrade = days.some((d) => d.hasTrade);
    if (!hasAnyTrade) {
      chart?.destroy();
      chart = null;
      return;
    }

    const palette = getChartPalette();
    const labels = days.map((d) => d.label);
    const data = days.map((d) => (d.hasTrade && d.pnl != null ? d.pnl : null));
    const bg = days.map((d) => {
      if (!d.hasTrade || d.pnl == null) return 'transparent';
      return d.pnl >= 0 ? hexToRgbA(palette.profit, 0.75) : hexToRgbA(palette.loss, 0.75);
    });
    const border = days.map((d) => {
      if (!d.hasTrade) return 'transparent';
      if (d.hasJournal) return palette.accent;
      return 'transparent';
    });
    const borderW = days.map((d) => (d.hasTrade && d.hasJournal ? 1.5 : 0));

    const cfg = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `PnL (${currency})`,
            data,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: borderW,
            borderRadius: 3,
            maxBarThickness: 9,
            categoryPercentage: 0.94
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter(item) {
              const i = item.dataIndex;
              return i != null && days[i]?.hasTrade;
            },
            callbacks: {
              title(items) {
                const i = items[0]?.dataIndex;
                return i != null && days[i] ? days[i].key : '';
              },
              label(ctx) {
                const i = ctx.dataIndex;
                const d = days[i];
                if (!d?.hasTrade || d.pnl == null) return '';
                const sign = d.pnl >= 0 ? '+' : '';
                const j = d.hasJournal ? 'да' : 'нет';
                return [
                  `${sign}${formatNumber(d.pnl, moneyDecimals)} ${currency}`,
                  `Дневник: ${j}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: palette.textMuted,
              font: { size: 9 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              font: { size: 10 },
              callback(v) {
                return formatNumber(Number(v), moneyDecimals);
              }
            }
          }
        }
      }
    };

    if (chart) {
      chart.destroy();
      chart = null;
    }
    chart = new Chart(canvas, cfg);
  }

  $: days, currency, moneyDecimals, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="analytics-mini-chart" style:height="{chartHeight}px">
  <canvas bind:this={canvas} aria-label="Дневной PnL за окно"></canvas>
</div>

<p class="analytics-journal-chart-legend">
  Обводка столбца — был содержательный дневник в этот день.
</p>

<style>
  .analytics-mini-chart {
    position: relative;
    width: 100%;
    min-width: 0;
    margin-top: 8px;
  }
  .analytics-journal-chart-legend {
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--text-muted);
  }
</style>
