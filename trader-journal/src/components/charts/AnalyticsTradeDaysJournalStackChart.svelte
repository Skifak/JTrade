<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';

  /** Дни со сделками: с дневником и без */
  export let withJournal = 0;
  export let withoutJournal = 0;

  export let chartHeight = 92;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    const total = withJournal + withoutJournal;
    if (total <= 0) {
      chart?.destroy();
      chart = null;
      return;
    }

    const palette = getChartPalette();

    const cfg = {
      type: 'bar',
      data: {
        labels: [''],
        datasets: [
          {
            label: 'Сделки + дневник',
            data: [withJournal],
            backgroundColor: hexToRgbA(palette.profit, 0.62),
            borderColor: palette.border,
            borderWidth: 0,
            borderRadius: 5,
            barPercentage: 0.88
          },
          {
            label: 'Сделки без дн.',
            data: [withoutJournal],
            backgroundColor: hexToRgbA(palette.loss, 0.45),
            borderColor: palette.border,
            borderWidth: 0,
            borderRadius: 5,
            barPercentage: 0.88
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: palette.textMuted,
              boxWidth: 11,
              padding: 10,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val = Number(ctx.parsed?.x ?? 0);
                const pct = total ? ((100 * val) / total).toFixed(0) : '0';
                return `${ctx.dataset.label}: ${val} дн. (${pct}%)`;
              },
              footer() {
                return `Всего торговых дн.: ${total}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            suggestedMax: total,
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              precision: 0,
              font: { size: 10 }
            }
          },
          y: {
            stacked: true,
            display: false,
            grid: { display: false }
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

  $: withJournal, withoutJournal, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="analytics-stack-chart" style:height="{chartHeight}px">
  <canvas bind:this={canvas} aria-label="Доля торговых дней с дневником"></canvas>
</div>

<style>
  .analytics-stack-chart {
    position: relative;
    width: 100%;
    min-width: 0;
    margin-top: 10px;
  }
</style>
