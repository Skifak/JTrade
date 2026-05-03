<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';

  /** предыдущая неделя */
  export let prevLabel = '';
  /** текущая неделя */
  export let currLabel = '';
  export let prevTrades = 0;
  export let currTrades = 0;
  export let prevJournalDays = 0;
  export let currJournalDays = 0;

  export let chartHeight = 168;

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

    const cfg = {
      type: 'bar',
      data: {
        labels: ['Сделки', 'Дни дневника'],
        datasets: [
          {
            label: prevLabel,
            data: [prevTrades, prevJournalDays],
            backgroundColor: hexToRgbA(palette.accent, 0.42),
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: 5,
            barPercentage: 0.72,
            categoryPercentage: 0.72
          },
          {
            label: currLabel,
            data: [currTrades, currJournalDays],
            backgroundColor: hexToRgbA(palette.accent, 0.88),
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: 5,
            barPercentage: 0.72,
            categoryPercentage: 0.72
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
              boxWidth: 11,
              padding: 12,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.parsed?.y;
                if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label}: —`;
                return `${ctx.dataset.label}: ${Number(v).toFixed(0)}`;
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
            beginAtZero: true,
            suggestedMax: undefined,
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              precision: 0,
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

  $:
    prevLabel,
    currLabel,
    prevTrades,
    currTrades,
    prevJournalDays,
    currJournalDays,
    canvas,
    rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="analytics-mini-chart" style:height="{chartHeight}px">
  <canvas bind:this={canvas} aria-label="Сделки и дни дневника: две недели"></canvas>
</div>

<style>
  .analytics-mini-chart {
    position: relative;
    width: 100%;
    min-width: 0;
    margin-top: 8px;
  }
</style>
