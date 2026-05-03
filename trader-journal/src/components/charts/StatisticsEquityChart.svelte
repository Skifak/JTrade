<script>
  import { onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { ensureChartRegistered, getChartPalette, hexToRgbA } from '../../lib/chartJsTheme.js';
  import { formatDate, formatNumber } from '../../lib/utils';

  /** @type {{ ts: number; real: number; disciplined: number }[]} */
  export let series = [];
  export let disciplinedOnly = false;
  export let initialCapital = 0;
  /** Знаков после запятой для осей/тултипа (BTC ≠ USD). */
  export let moneyDecimals = 2;

  let canvas;
  /** @type {HTMLElement | undefined} */
  let hostEl;
  /** @type {Chart | null} */
  let chart = null;

  /** Зум по оси X (timestamp ms); оба null — весь диапазон */
  let zoomXMin = /** @type {number | null} */ (null);
  let zoomXMax = /** @type {number | null} */ (null);

  let lastDataSig = '';

  let selecting = false;
  let brushX0 = /** @type {number | null} */ (null);
  let brushX1 = /** @type {number | null} */ (null);

  function tsLabel(ts) {
    return formatDate(ts, 'DD.MM');
  }

  /**
   * Точки { x, delta }, delta = equity − initialCapital.
   * Вставка пересечения с нулём между соседями (линейно по x и Δ).
   */
  function expandWithCrossings(activeKey, ic) {
    const basic = series.map((p) => ({
      x: p.ts,
      delta: Number(p[activeKey]) - ic
    }));
    const out = [];
    for (let i = 0; i < basic.length; i++) {
      out.push(basic[i]);
      if (i < basic.length - 1) {
        const a = basic[i];
        const b = basic[i + 1];
        const da = a.delta;
        const db = b.delta;
        if (da !== 0 && db !== 0 && (da > 0) !== (db > 0)) {
          const t = (0 - da) / (db - da);
          if (t > 0 && t < 1) {
            const xCross = a.x + t * (b.x - a.x);
            out.push({ x: xCross, delta: 0 });
          }
        }
      }
    }
    out.sort((u, v) => u.x - v.x);
    return out;
  }

  function currentDataSig() {
    if (!series?.length) return '';
    const a = series[0];
    const b = series[series.length - 1];
    return `${series.length}_${a.ts}_${b.ts}_${disciplinedOnly}_${initialCapital}`;
  }

  function eventToCanvasPixelX(/** @type {PointerEvent} */ e) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    return (e.clientX - rect.left) * scaleX;
  }

  function clampBrushX(px) {
    if (!chart) return px;
    const ca = chart.chartArea;
    if (!ca) return px;
    return Math.max(ca.left, Math.min(ca.right, px));
  }

  $: brushOverlay =
    selecting &&
    brushX0 != null &&
    brushX1 != null &&
    canvas &&
    hostEl &&
    chart
      ? (() => {
          const rect = canvas.getBoundingClientRect();
          const hostRect = hostEl.getBoundingClientRect();
          const scaleCss = rect.width / canvas.width;
          const x1 = Math.min(brushX0, brushX1);
          const x2 = Math.max(brushX0, brushX1);
          const leftCanvasCss = x1 * scaleCss;
          const widthCss = Math.max(0, (x2 - x1) * scaleCss);
          const leftHost = rect.left - hostRect.left + leftCanvasCss;
          return {
            left: leftHost,
            width: widthCss,
            height: hostRect.height
          };
        })()
      : null;

  function rebuild() {
    ensureChartRegistered();
    if (!canvas) return;
    if (!series?.length) {
      chart?.destroy();
      chart = null;
      zoomXMin = zoomXMax = null;
      return;
    }

    const sig = currentDataSig();
    if (lastDataSig !== '' && sig !== lastDataSig) {
      zoomXMin = zoomXMax = null;
    }
    lastDataSig = sig;
    const palette = getChartPalette();
    const activeKey = disciplinedOnly ? 'disciplined' : 'real';
    const expanded = expandWithCrossings(activeKey, initialCapital);

    const lossData = expanded.map((p) => ({ x: p.x, y: Math.min(0, p.delta) }));
    const gainData = expanded.map((p) => ({ x: p.x, y: Math.max(0, p.delta) }));

    const firstTs = expanded[0].x;
    const lastTs = expanded[expanded.length - 1].x;

    /** Одна строка тултипа; dataset.label пустой — без дубля от Chart.js */
    const equityTooltipLabel = disciplinedOnly ? 'disciplined' : 'реальный equity';

    const cfg = {
      type: 'line',
      data: {
        datasets: [
          {
            label: '',
            data: lossData,
            parsing: false,
            borderColor: palette.loss,
            backgroundColor: hexToRgbA(palette.loss, 0.22),
            fill: 'origin',
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            order: 1
          },
          {
            label: '',
            data: gainData,
            parsing: false,
            borderColor: palette.profit,
            backgroundColor: hexToRgbA(palette.profit, 0.22),
            fill: 'origin',
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            order: 2
          },
          {
            label: 'Стартовый капитал',
            data: [
              { x: firstTs, y: 0 },
              { x: lastTs, y: 0 }
            ],
            parsing: false,
            borderColor: palette.textMuted,
            backgroundColor: 'transparent',
            borderDash: [6, 5],
            fill: false,
            pointRadius: 0,
            borderWidth: 1,
            order: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: true,
            callbacks: {
              title(items) {
                const raw = items[0]?.raw;
                const ts = raw && typeof raw === 'object' && 'x' in raw ? raw.x : null;
                return ts != null ? formatDate(ts, 'DD.MM.YYYY HH:mm') : '';
              },
              label(item) {
                const c = item.chart;
                const idx = item.dataIndex;
                const dl = c.data.datasets[0].data[idx];
                const dg = c.data.datasets[1].data[idx];
                const dy =
                  (typeof dl?.y === 'number' ? dl.y : 0) + (typeof dg?.y === 'number' ? dg.y : 0);
                const eq = dy + initialCapital;
                return `${equityTooltipLabel}: ${formatNumber(eq, moneyDecimals)}`;
              },
              footer(items) {
                if (!items.length) return '';
                const it = items[0];
                const c = it.chart;
                const idx = it.dataIndex;
                const dl = c.data.datasets[0].data[idx];
                const dg = c.data.datasets[1].data[idx];
                const dy =
                  (typeof dl?.y === 'number' ? dl.y : 0) + (typeof dg?.y === 'number' ? dg.y : 0);
                return `От старта: ${dy >= 0 ? '+' : ''}${formatNumber(dy, moneyDecimals)}`;
              },
              labelColor(context) {
                const c = context.chart;
                const idx = context.dataIndex;
                const dl = c.data.datasets[0].data[idx];
                const dg = c.data.datasets[1].data[idx];
                const dy =
                  (typeof dl?.y === 'number' ? dl.y : 0) + (typeof dg?.y === 'number' ? dg.y : 0);
                const col = dy >= 0 ? palette.profit : palette.loss;
                return {
                  borderColor: col,
                  backgroundColor: col
                };
              },
              filter(item, index, tooltipItems) {
                if (item.datasetIndex === 2) return false;
                const c = item.chart;
                const idx = item.dataIndex;
                const dl = c.data.datasets[0].data[idx];
                const dg = c.data.datasets[1].data[idx];
                const dy =
                  (typeof dl?.y === 'number' ? dl.y : 0) + (typeof dg?.y === 'number' ? dg.y : 0);
                const wantDs = dy >= 0 ? 1 : 0;
                if (item.datasetIndex !== wantDs) return false;
                const firstEq = tooltipItems.findIndex(
                  (t) =>
                    t.datasetIndex !== 2 &&
                    (t.datasetIndex === 0 || t.datasetIndex === 1) &&
                    t.dataIndex === idx
                );
                return index === firstEq;
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
            grid: {
              color: (ctx) =>
                ctx.tick?.value === 0 ? palette.textMuted : palette.border,
              lineWidth: (ctx) => (ctx.tick?.value === 0 ? 1.5 : 1)
            },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                const n = Number(v);
                return formatNumber(n + initialCapital, moneyDecimals);
              }
            }
          }
        }
      }
    };

    if (zoomXMin != null && zoomXMax != null && zoomXMin < zoomXMax) {
      cfg.options.scales.x.min = zoomXMin;
      cfg.options.scales.x.max = zoomXMax;
    }

    if (chart) {
      chart.destroy();
      chart = null;
    }
    chart = new Chart(canvas, cfg);

    if (zoomXMin != null && zoomXMax != null && zoomXMin < zoomXMax) {
      chart.options.scales.x.min = zoomXMin;
      chart.options.scales.x.max = zoomXMax;
      chart.update('none');
    }
  }

  function resetZoom() {
    zoomXMin = zoomXMax = null;
    if (!chart) return;
    const xs = chart.options.scales.x;
    delete xs.min;
    delete xs.max;
    chart.update('none');
  }

  function endBrushTracking() {
    window.removeEventListener('pointermove', onBrushMove);
    window.removeEventListener('pointerup', onBrushEnd);
    window.removeEventListener('pointercancel', onBrushEnd);
  }

  function onBrushMove(/** @type {PointerEvent} */ e) {
    const px = eventToCanvasPixelX(e);
    if (px == null || brushX0 == null) return;
    brushX1 = clampBrushX(px);
  }

  function onBrushEnd(/** @type {PointerEvent} */ e) {
    endBrushTracking();

    try {
      if (canvas && e?.pointerId != null) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const xScale = chart?.scales?.x;
    const ca = chart?.chartArea;
    if (!chart || !xScale || !ca || brushX0 == null || brushX1 == null) {
      selecting = false;
      brushX0 = brushX1 = null;
      return;
    }

    const raw0 = clampBrushX(brushX0);
    const raw1 = clampBrushX(brushX1);
    const lo = Math.min(raw0, raw1);
    const hi = Math.max(raw0, raw1);

    selecting = false;
    brushX0 = brushX1 = null;

    if (hi - lo < 6) return;

    const v0 = xScale.getValueForPixel(lo);
    const v1 = xScale.getValueForPixel(hi);
    const mn = Math.min(v0, v1);
    const mx = Math.max(v0, v1);
    if (mx - mn < 60 * 1000) return;

    zoomXMin = mn;
    zoomXMax = mx;
    chart.options.scales.x.min = mn;
    chart.options.scales.x.max = mx;
    chart.update('none');
  }

  function onHostPointerDown(/** @type {PointerEvent} */ e) {
    if (e.button !== 0 || !chart) return;
    const el = /** @type {HTMLElement} */ (e.target);
    if (el.closest('.equity-zoom-reset')) return;

    const px = eventToCanvasPixelX(e);
    if (px == null) return;

    selecting = true;
    brushX0 = clampBrushX(px);
    brushX1 = brushX0;

    window.addEventListener('pointermove', onBrushMove);
    window.addEventListener('pointerup', onBrushEnd);
    window.addEventListener('pointercancel', onBrushEnd);

    try {
      canvas?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    e.preventDefault();
  }

  $: series, disciplinedOnly, initialCapital, moneyDecimals, canvas, rebuild();

  onDestroy(() => {
    endBrushTracking();
    chart?.destroy();
    chart = null;
  });
</script>

<div
  class="equity-chart-host"
  class:equity-chart-host--selecting={selecting}
  bind:this={hostEl}
  on:pointerdown={onHostPointerDown}
  role="presentation"
>
  {#if zoomXMin != null && zoomXMax != null}
    <button type="button" class="equity-zoom-reset" on:click|stopPropagation={resetZoom}>
      Весь период
    </button>
  {/if}

  {#if brushOverlay}
    <div
      class="equity-brush"
      style:left="{brushOverlay.left}px"
      style:width="{brushOverlay.width}px"
      style:height="{brushOverlay.height}px"
    ></div>
  {/if}

  <canvas bind:this={canvas} aria-label="Equity curve"></canvas>
</div>

<style>
  .equity-chart-host {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 240px;
    touch-action: none;
    user-select: none;
  }

  .equity-chart-host--selecting {
    cursor: crosshair;
  }

  .equity-zoom-reset {
    position: absolute;
    top: 6px;
    right: 8px;
    z-index: 4;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--border, #334155);
    border-radius: 4px;
    background: var(--bg-2, #1e293b);
    color: var(--text, #e2e8f0);
    cursor: pointer;
  }

  .equity-zoom-reset:hover {
    border-color: var(--accent-border, #38bdf8);
    color: var(--text-strong, #fff);
  }

  .equity-brush {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
    pointer-events: none;
    box-sizing: border-box;
    border-left: 2px solid #0369a1;
    border-right: 2px solid #0369a1;
    background: rgba(56, 189, 248, 0.28);
  }

  .equity-chart-host canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
