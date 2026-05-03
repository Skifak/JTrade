<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatDate, formatNumber } from '../../lib/utils';

  /** @type {{ ts: number; real: number; disciplined: number }[]} */
  export let series = [];
  export let disciplinedOnly = false;
  export let initialCapital = 0;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  function tsLabel(ts) {
    return formatDate(ts, 'DD.MM');
  }

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    if (!series?.length) {
      chart?.destroy();
      chart = null;
      return;
    }

    const palette = getChartPalette();
    const activeKey = disciplinedOnly ? 'disciplined' : 'real';
    const stroke = disciplinedOnly ? palette.profit : palette.loss;
    const fill = hexToRgbA(stroke, 0.18);

    const pts = series.map((p) => ({ x: p.ts, y: p[activeKey] }));
    const firstTs = series[0].ts;
    const lastTs = series[series.length - 1].ts;

    const cfg = {
      type: 'line',
      data: {
        datasets: [
          {
            label: disciplinedOnly ? 'Disciplined' : 'Реальный equity',
            data: pts,
            parsing: false,
            borderColor: stroke,
            backgroundColor: fill,
            fill: true,
            tension: 0.22,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2
          },
          {
            label: 'Стартовый капитал',
            data: [
              { x: firstTs, y: initialCapital },
              { x: lastTs, y: initialCapital }
            ],
            parsing: false,
            borderColor: palette.textMuted,
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            borderWidth: 1
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
            callbacks: {
              title(items) {
                const raw = items[0]?.raw;
                const ts = raw && typeof raw === 'object' && 'x' in raw ? raw.x : null;
                return ts != null ? formatDate(ts, 'DD.MM.YYYY HH:mm') : '';
              },
              label(item) {
                if (item.datasetIndex === 1) return null;
                const y = item.parsed?.y;
                if (y == null || !Number.isFinite(y)) return '';
                const sign = y >= 0 ? '' : '';
                return `${sign}${formatNumber(y, 2)}`;
              },
              filter(item) {
                return item.datasetIndex === 0;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            bounds: 'data',
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              maxTicksLimit: 6,
              callback(raw) {
                return tsLabel(Number(raw));
              }
            }
          },
          y: {
            grid: { color: palette.border },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                return formatNumber(Number(v), 0);
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

  $: series, disciplinedOnly, initialCapital, canvas, rebuild();

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="equity-chart-host">
  <canvas bind:this={canvas} aria-label="Equity curve"></canvas>
</div>

<style>
  .equity-chart-host {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 240px;
  }
</style>
