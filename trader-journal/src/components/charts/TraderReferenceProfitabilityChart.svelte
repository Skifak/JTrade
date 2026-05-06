<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatDate, formatNumber } from '../../lib/utils.js';
  import {
    profitCurveSuggestedMinWidth,
    monthBandsFromProfitCurve,
    pickCurveExtremaForLabels
  } from '../../lib/traderReferenceProfitCurve.js';

  /** @type {{ ts: number; pct: number }[]} */
  export let series = [];
  export let chartHeight = 300;

  let canvas;
  /** @type {Chart | null} */
  let chart = null;

  $: minWidthPx = profitCurveSuggestedMinWidth(series);

  function tsLabel(ts) {
    return formatDate(ts, 'DD.MM.YY');
  }

  function formatDeltaCompact(pct) {
    const p = Math.round(pct * 10) / 10;
    const sign = p > 0 ? '+' : '';
    return `${sign}${formatNumber(p, 1)}%`;
  }

  function capMonthTitle(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function createPlugins(palette, bands, extrema) {
    return [
      {
        id: 'tpcMonthZones',
        beforeDatasetsDraw(/** @type {Chart} */ c) {
          const { ctx, chartArea, scales } = c;
          const xScale = scales.x;
          if (!chartArea || !xScale || !bands.length) return;
          for (let i = 0; i < bands.length; i++) {
            const b = bands[i];
            const x0 = xScale.getPixelForValue(b.startMs);
            const x1 = xScale.getPixelForValue(b.endMs);
            const left = Math.min(x0, x1);
            const w = Math.abs(x1 - x0);
            const alt = i % 2 === 0;
            ctx.save();
            ctx.fillStyle = alt
              ? hexToRgbA(palette.border, 0.12)
              : hexToRgbA(palette.border, 0.05);
            ctx.fillRect(left, chartArea.top, w, chartArea.bottom - chartArea.top);
            ctx.restore();
          }
        }
      },
      {
        id: 'tpcMonthDividers',
        beforeDatasetsDraw(/** @type {Chart} */ c) {
          const { ctx, chartArea, scales } = c;
          const xScale = scales.x;
          if (!chartArea || !xScale || bands.length < 2) return;
          ctx.save();
          ctx.strokeStyle = hexToRgbA(palette.textMuted, 0.45);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          for (let i = 1; i < bands.length; i++) {
            const x = xScale.getPixelForValue(bands[i].startMs);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
          }
          ctx.restore();
          ctx.setLineDash([]);
        }
      },
      {
        id: 'tpcMonthHeaders',
        afterDatasetsDraw(/** @type {Chart} */ c) {
          const { ctx, chartArea, scales } = c;
          const xScale = scales.x;
          if (!chartArea || !xScale) return;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          for (const b of bands) {
            const x0 = xScale.getPixelForValue(b.startMs);
            const x1 = xScale.getPixelForValue(b.endMs);
            const cx = (x0 + x1) / 2;
            const dw = Math.abs(x1 - x0);
            if (dw < 24) continue;
            ctx.font = '600 10px system-ui, sans-serif';
            ctx.fillStyle = palette.text;
            ctx.fillText(`${capMonthTitle(b.monthTitle)} · ${formatDeltaCompact(b.deltaPct)}`, cx, chartArea.top + 2);
            ctx.font = '500 9px system-ui, sans-serif';
            const phase =
              b.favorable || b.deltaPct === 0 ? 'Благоприятная фаза' : 'Неблагоприятная фаза';
            ctx.fillStyle = b.favorable || b.deltaPct === 0
              ? hexToRgbA(palette.profit, 0.95)
              : hexToRgbA(palette.loss, 0.92);
            ctx.fillText(phase, cx, chartArea.top + 14);
          }
          ctx.restore();
        }
      },
      {
        id: 'tpcExtrema',
        afterDatasetsDraw(/** @type {Chart} */ c) {
          const { ctx, chartArea, scales } = c;
          const xScale = scales.x;
          const yScale = scales.y;
          if (!chartArea || !xScale || !yScale || !extrema.length) return;
          ctx.save();
          ctx.font = '600 9px ui-monospace, monospace';
          ctx.textAlign = 'center';
          for (const p of extrema) {
            const x = xScale.getPixelForValue(p.ts);
            const y = yScale.getPixelForValue(p.pct);
            if (x < chartArea.left - 20 || x > chartArea.right + 20) continue;
            const above = p.pct >= 0;
            const text = formatDeltaCompact(p.pct);
            ctx.fillStyle = palette.text;
            ctx.textBaseline = above ? 'bottom' : 'top';
            ctx.fillText(text, x, above ? y - 5 : y + 5);
          }
          ctx.restore();
        }
      }
    ];
  }

  function rebuild() {
    ensureChartRegistered();
    if (!canvas || !series?.length || series.length < 2) {
      chart?.destroy();
      chart = null;
      return;
    }

    const monthBands = monthBandsFromProfitCurve(series);
    const extremaLabels = pickCurveExtremaForLabels(series);

    const palette = getChartPalette();
    const data = series.map((p) => ({ x: p.ts, y: p.pct }));
    const ys = series.map((p) => p.pct);
    const yMinRaw = Math.min(...ys, 0);
    const yMaxRaw = Math.max(...ys, 0);
    const pad = Math.max(0.8, (yMaxRaw - yMinRaw) * 0.12);
    const yMin = Math.floor((yMinRaw - pad) * 10) / 10;
    const yMax = Math.ceil((yMaxRaw + pad) * 10) / 10;

    const plugins = createPlugins(palette, monthBands, extremaLabels);

    const cfg = {
      type: 'line',
      plugins,
      data: {
        datasets: [
          {
            label: '',
            data,
            parsing: false,
            borderColor: palette.text,
            backgroundColor: hexToRgbA(palette.text, 0.06),
            fill: true,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2
          },
          {
            label: '',
            data: [
              { x: series[0].ts, y: 0 },
              { x: series[series.length - 1].ts, y: 0 }
            ],
            parsing: false,
            borderColor: palette.loss,
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            tension: 0,
            clip: false
          }
        ]
      },
      options: {
        layout: {
          padding: { top: 44, bottom: 4, left: 2, right: 6 }
        },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            filter(item) {
              return item.datasetIndex === 0;
            },
            callbacks: {
              title(items) {
                const raw = items[0]?.raw;
                const ts = raw && typeof raw === 'object' && 'x' in raw ? raw.x : null;
                return ts != null ? formatDate(ts, 'DD.MM.YYYY HH:mm') : '';
              },
              label(item) {
                const raw = item.raw;
                const y = raw && typeof raw === 'object' && 'y' in raw ? raw.y : null;
                return y != null ? `кумулятивная ${formatNumber(y, 2)}% к депозиту` : '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            bounds: 'data',
            grid: { color: hexToRgbA(palette.border, 0.65) },
            ticks: {
              color: palette.textMuted,
              maxTicksLimit: 14,
              callback(raw) {
                return tsLabel(Number(raw));
              }
            }
          },
          y: {
            grid: {
              color: (ctx) =>
                Math.abs(Number(ctx.tick?.value)) < 1e-6 ? palette.loss : palette.border,
              lineWidth: (ctx) => (Math.abs(Number(ctx.tick?.value)) < 1e-6 ? 2 : 1)
            },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                return `${formatNumber(Number(v), 1)}%`;
              }
            },
            suggestedMin: yMin,
            suggestedMax: yMax
          }
        }
      }
    };

    chart?.destroy();
    chart = new Chart(canvas, cfg);
  }

  $: if (canvas) {
    series;
    rebuild();
  }

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="tpc">
  <div class="tpc-scroll">
    <div class="tpc-inner" style:min-width="{minWidthPx}px" style:height="{chartHeight}px">
      {#if series.length >= 2}
        <canvas bind:this={canvas}></canvas>
      {:else}
        <div class="tpc-empty">Недостаточно точек для кривой</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .tpc {
    width: 100%;
  }
  .tpc-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .tpc-inner {
    position: relative;
    min-height: 200px;
  }
  .tpc-inner canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .tpc-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
