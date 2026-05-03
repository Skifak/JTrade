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
    const expanded = expandWithCrossings(activeKey, initialCapital);

    const lossData = expanded.map((p) => ({ x: p.x, y: Math.min(0, p.delta) }));
    const gainData = expanded.map((p) => ({ x: p.x, y: Math.max(0, p.delta) }));

    const firstTs = expanded[0].x;
    const lastTs = expanded[expanded.length - 1].x;

    const rowLabel = disciplinedOnly ? 'Disciplined' : 'Реальный equity';

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
        interaction: { mode: 'index', intersect: false },
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
                return `${rowLabel}: ${formatNumber(eq, 2)}`;
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
                return `От старта: ${dy >= 0 ? '+' : ''}${formatNumber(dy, 2)}`;
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
              filter(item) {
                if (item.datasetIndex === 2) return false;
                const c = item.chart;
                const idx = item.dataIndex;
                const dl = c.data.datasets[0].data[idx];
                const dg = c.data.datasets[1].data[idx];
                const dy =
                  (typeof dl?.y === 'number' ? dl.y : 0) + (typeof dg?.y === 'number' ? dg.y : 0);
                if (dy >= 0) return item.datasetIndex === 1;
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
            grid: {
              color: (ctx) =>
                ctx.tick?.value === 0 ? palette.textMuted : palette.border,
              lineWidth: (ctx) => (ctx.tick?.value === 0 ? 1.5 : 1)
            },
            ticks: {
              color: palette.textMuted,
              callback(v) {
                const n = Number(v);
                return formatNumber(n + initialCapital, 0);
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
