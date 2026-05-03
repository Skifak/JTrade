<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatNumber } from '../../lib/utils';

  /** @type {{ sum: number; count: number; wins: number; hour?: number; label?: string }[]} */
  export let buckets = [];
  /** Подписи по порядку buckets */
  export let labels = [];
  export let currency = 'USD';

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    if (!buckets?.length || !labels?.length) {
      chart?.destroy();
      chart = null;
      return;
    }

    let best = null;
    let worst = null;
    for (const b of buckets) {
      if (!b.count) continue;
      if (!best || b.sum > best.sum) best = b;
      if (!worst || b.sum < worst.sum) worst = b;
    }

    const palette = getChartPalette();
    const sums = buckets.map((b) => b.sum);
    const avgs = buckets.map((b) => (b.count ? b.sum / b.count : 0));

    const totalBg = buckets.map((b) =>
      b.sum >= 0 ? hexToRgbA(palette.profit, 0.85) : hexToRgbA(palette.loss, 0.85)
    );
    const avgBg = buckets.map((b) => {
      if (!b.count) return 'transparent';
      const v = b.sum / b.count;
      return v >= 0 ? hexToRgbA(palette.profit, 0.38) : hexToRgbA(palette.loss, 0.38);
    });

    const totalBorder = buckets.map((b) => {
      if (!b.count) return 'transparent';
      if (best && b === best) return palette.profit;
      if (worst && b === worst && worst !== best) return palette.loss;
      return 'transparent';
    });
    const totalBorderW = buckets.map((b) => {
      if (!b.count) return 0;
      if (best && b === best) return 2;
      if (worst && b === worst && worst !== best) return 2;
      return 0;
    });

    const cfg = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Σ PnL',
            data: sums,
            backgroundColor: totalBg,
            borderColor: totalBorder,
            borderWidth: totalBorderW,
            borderSkipped: false,
            barPercentage: 0.82,
            categoryPercentage: 0.74
          },
          {
            label: 'Avg / сделка',
            data: avgs,
            backgroundColor: avgBg,
            borderColor: palette.border,
            borderWidth: 0,
            barPercentage: 0.82,
            categoryPercentage: 0.74
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: palette.textMuted,
              boxWidth: 12,
              padding: 14,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              afterBody(ctx) {
                const idx = ctx[0]?.dataIndex;
                if (idx == null) return '';
                const b = buckets[idx];
                if (!b?.count) return 'Нет сделок';
                const wl = `${b.wins} W / ${b.count - b.wins} L`;
                const avg = b.sum / b.count;
                return [
                  wl,
                  `Σ: ${formatNumber(b.sum, 2)} ${currency}`,
                  `Avg: ${formatNumber(avg, 2)} ${currency}`
                ];
              },
              label(item) {
                const v = item.parsed?.y;
                if (v == null || !Number.isFinite(v)) return `${item.dataset.label}: —`;
                return `${item.dataset.label}: ${formatNumber(v, 2)} ${currency}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            grid: { display: false },
            ticks: {
              color: palette.textMuted,
              autoSkip: true,
              maxRotation: 0,
              font: { size: 10 }
            }
          },
          y: {
            stacked: false,
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                const n = Number(v);
                return `${n >= 0 ? '' : ''}${formatNumber(n, 0)}`;
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

  $: buckets, labels, currency, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="grouped-pnl-host">
  <canvas bind:this={canvas} aria-label="PnL по интервалам"></canvas>
</div>

<style>
  .grouped-pnl-host {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 220px;
  }
</style>
