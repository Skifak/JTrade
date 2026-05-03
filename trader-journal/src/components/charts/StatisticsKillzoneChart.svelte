<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatNumber } from '../../lib/utils';

  /** @type {{ label: string; sum: number; count: number; wins: number; hint?: string }[]} */
  export let rows = [];
  export let currency = 'USD';
  export let moneyDecimals = 2;
  /** Высота canvas-блока (px) */
  export let chartHeight = 180;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function rebuild() {
    ensureChartRegistered();
    const active = rows.filter((r) => r.count > 0);
    if (!canvas) return;
    if (active.length === 0) {
      chart?.destroy();
      chart = null;
      return;
    }

    const palette = getChartPalette();
    const labels = active.map((r) => r.label);
    const data = active.map((r) => r.sum);
    const bg = active.map((r) =>
      r.sum >= 0 ? hexToRgbA(palette.profit, 0.82) : hexToRgbA(palette.loss, 0.82)
    );

    const cfg = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Net PnL',
            data,
            backgroundColor: bg,
            borderColor: palette.border,
            borderWidth: 0,
            barPercentage: 0.75,
            categoryPercentage: 0.92
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                const i = items[0]?.dataIndex;
                const hint = i != null ? active[i]?.hint : '';
                const lab = items[0]?.label ?? '';
                return hint ? `${lab} (${hint})` : lab;
              },
              label(item) {
                const i = item.dataIndex;
                const r = active[i];
                if (!r) return '';
                const wr = r.count ? (r.wins / r.count) * 100 : 0;
                return [
                  `PnL: ${r.sum >= 0 ? '+' : ''}${formatNumber(r.sum, moneyDecimals)} ${currency}`,
                  `Сделок: ${r.count} · WR ${formatNumber(wr, 1)}%`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                return formatNumber(Number(v), moneyDecimals);
              }
            }
          },
          y: {
            grid: { display: false },
            reverse: true,
            ticks: {
              color: palette.textMuted,
              font: { size: 11 }
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

  $: rows, currency, moneyDecimals, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="kz-chart-host" style="height: {chartHeight}px">
  <canvas bind:this={canvas} aria-label="PnL по killzone"></canvas>
</div>

<style>
  .kz-chart-host {
    position: relative;
    width: 100%;
    min-width: 0;
  }
</style>
