<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatNumber } from '../../lib/utils';

  export let prevLabel = '';
  export let currLabel = '';
  export let prevPnl = 0;
  export let currPnl = 0;
  export let currency = 'USD';
  export let moneyDecimals = 2;

  export let chartHeight = 132;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    if (!prevLabel || !currLabel) {
      chart?.destroy();
      chart = null;
      return;
    }

    const palette = getChartPalette();
    const vals = [prevPnl, currPnl];
    const bg = vals.map((v) =>
      v >= 0 ? hexToRgbA(palette.profit, 0.78) : hexToRgbA(palette.loss, 0.78)
    );

    const cfg = {
      type: 'bar',
      data: {
        labels: [prevLabel, currLabel],
        datasets: [
          {
            label: `PnL (${currency})`,
            data: vals,
            backgroundColor: bg,
            borderColor: palette.border,
            borderWidth: 0,
            borderRadius: 6,
            barPercentage: 0.68,
            categoryPercentage: 0.72
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.parsed?.y;
                if (v == null || !Number.isFinite(v)) return '';
                const sign = v >= 0 ? '+' : '';
                return `${sign}${formatNumber(v, moneyDecimals)} ${currency}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: palette.textMuted, font: { size: 11 } }
          },
          y: {
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              font: { size: 11 },
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

  $: prevLabel, currLabel, prevPnl, currPnl, currency, moneyDecimals, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="analytics-mini-chart" style:height="{chartHeight}px">
  <canvas bind:this={canvas} aria-label="PnL окна закрытых: две недели"></canvas>
</div>

<style>
  .analytics-mini-chart {
    position: relative;
    width: 100%;
    min-width: 0;
    margin-top: 4px;
  }
</style>
