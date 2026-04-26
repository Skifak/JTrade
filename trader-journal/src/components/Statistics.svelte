<script>
  import { formatNumber, formatDate } from '../lib/utils';
  import {
    getEquityCurve,
    getPnLByHour,
    getPnLByWeekday,
    getStatsByTag
  } from '../lib/risk';

  export let stats;
  export let closedTrades = [];
  export let initialCapital = 0;
  export let currency = 'USD';

  $: hasTrades = stats?.totalTrades > 0;

  // ============================================================
  // ФИЛЬТРЫ
  // ============================================================
  let periodFilter = 'all';   // all | day | week | month | 3m | year
  let directionFilter = 'all'; // all | long | short
  let tagFilter = 'all';       // all | <tag>
  let disciplinedOnly = false;

  const periods = [
    { id: 'all',   label: 'Всё' },
    { id: 'day',   label: 'День' },
    { id: 'week',  label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: '3m',    label: '3 мес' },
    { id: 'year',  label: 'Год' }
  ];
  const directions = [
    { id: 'all',   label: 'Все' },
    { id: 'long',  label: 'Long' },
    { id: 'short', label: 'Short' }
  ];

  function periodStart(now, id) {
    const d = new Date(now);
    if (id === 'day') { d.setHours(0, 0, 0, 0); return d; }
    if (id === 'week') {
      const dow = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - dow);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (id === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (id === '3m') return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate());
    if (id === 'year') return new Date(d.getFullYear(), 0, 1);
    return null;
  }

  $: allTags = (() => {
    const set = new Set();
    for (const t of closedTrades) {
      if (Array.isArray(t.tags)) t.tags.forEach((x) => x && set.add(x));
    }
    return [...set].sort();
  })();

  $: filtered = (() => {
    const start = periodStart(Date.now(), periodFilter);
    return closedTrades.filter((t) => {
      if (start && t.dateClose && new Date(t.dateClose) < start) return false;
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
      if (tagFilter !== 'all' && !(Array.isArray(t.tags) && t.tags.includes(tagFilter))) return false;
      if (disciplinedOnly && Array.isArray(t.ruleViolations) && t.ruleViolations.length > 0) return false;
      return true;
    });
  })();

  $: hasFilter = periodFilter !== 'all' || directionFilter !== 'all' || tagFilter !== 'all' || disciplinedOnly;

  // Агрегаты для шапки фильтров
  $: filteredAgg = (() => {
    const sum = filtered.reduce((s, t) => s + (Number(t.profit) || 0), 0);
    const wins = filtered.filter((t) => Number(t.profit) > 0).length;
    const losses = filtered.filter((t) => Number(t.profit) < 0).length;
    const wr = filtered.length ? (wins / filtered.length) * 100 : 0;
    return { sum, wins, losses, wr, count: filtered.length };
  })();

  function resetFilters() {
    periodFilter = 'all';
    directionFilter = 'all';
    tagFilter = 'all';
    disciplinedOnly = false;
  }

  // ============================================================
  // EQUITY CURVE — улучшенная
  // ============================================================
  $: equity = getEquityCurve(filtered, initialCapital);
  const EQ_W = 760;
  const EQ_H = 240;
  const EQ_PAD = { l: 60, r: 14, t: 14, b: 28 };

  $: eq = (() => {
    if (!equity.length) return null;
    const xs = equity.map((p) => p.ts);
    const ys = equity.flatMap((p) => [p.real, p.disciplined]);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const pad = (yMax - yMin) * 0.06;
    yMin -= pad; yMax += pad;

    const innerW = EQ_W - EQ_PAD.l - EQ_PAD.r;
    const innerH = EQ_H - EQ_PAD.t - EQ_PAD.b;
    const xS = (v) => EQ_PAD.l + (xMax === xMin ? innerW / 2 : ((v - xMin) / (xMax - xMin)) * innerW);
    const yS = (v) => EQ_PAD.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

    const linePath = (key) =>
      equity.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.ts).toFixed(1)},${yS(p[key]).toFixed(1)}`).join(' ');
    const areaPath = (key) => {
      const baseY = yS(initialCapital).toFixed(1);
      const top = equity.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.ts).toFixed(1)},${yS(p[key]).toFixed(1)}`).join(' ');
      const last = equity[equity.length - 1];
      return `${top} L${xS(last.ts).toFixed(1)},${baseY} L${xS(equity[0].ts).toFixed(1)},${baseY} Z`;
    };

    const last = equity[equity.length - 1];
    const realDelta = last.real - initialCapital;
    const discDelta = last.disciplined - initialCapital;
    const gap = last.disciplined - last.real;

    // 4 горизонтальные grid-линии
    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4;
      gridLines.push({ y: yS(v), label: v });
    }
    // 4 даты на оси X
    const xTicks = [];
    const tickCount = Math.min(5, equity.length);
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round(((equity.length - 1) * i) / Math.max(1, tickCount - 1));
      const p = equity[idx];
      xTicks.push({ x: xS(p.ts), date: p.ts });
    }

    return {
      realLine: linePath('real'),
      discLine: linePath('disciplined'),
      realArea: areaPath('real'),
      baseY: yS(initialCapital),
      lastX: xS(last.ts),
      lastRealY: yS(last.real),
      lastDiscY: yS(last.disciplined),
      lastReal: last.real,
      lastDisc: last.disciplined,
      realDelta, discDelta, gap,
      gridLines, xTicks
    };
  })();

  // ============================================================
  // BAR CHARTS — улучшенные
  // ============================================================
  $: byHour = getPnLByHour(filtered);
  $: byWeekday = getPnLByWeekday(filtered);

  function barLayout(buckets, width, height, labelKey) {
    if (!buckets?.length) return null;
    const sums = buckets.map((b) => b.sum);
    const absMax = Math.max(1, ...sums.map((v) => Math.abs(v)));

    // best / worst и непустые бакеты
    let best = null, worst = null;
    let totalSum = 0;
    let nonEmptyBuckets = 0;
    let totalTrades = 0;
    for (const b of buckets) {
      if (b.count === 0) continue;
      if (!best || b.sum > best.sum) best = b;
      if (!worst || b.sum < worst.sum) worst = b;
      totalSum += b.sum;
      nonEmptyBuckets += 1;
      totalTrades += b.count;
    }
    // Средний PnL по бакету с торговлей — в той же шкале, что и бары
    const avgPerBucket = nonEmptyBuckets > 0 ? totalSum / nonEmptyBuckets : 0;
    // Средний PnL на сделку — для подписи в заголовке
    const avgPerTrade  = totalTrades   > 0 ? totalSum / totalTrades   : 0;

    const padL = 36, padR = 14, padT = 14, padB = 32;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const zeroY = padT + innerH / 2;
    const slot = innerW / buckets.length;
    const hitTop = padT;
    const hitH = innerH;

    // Два бара бок-о-бок в одном слоте: total | avg
    const groupW = slot * 0.78;
    const gap = slot * 0.06;
    const subW = Math.max(2, (groupW - gap) / 2);

    const gridLines = [
      { y: padT, label: absMax },
      { y: padT + innerH * 0.25, label: absMax / 2 },
      { y: zeroY, label: 0 },
      { y: padT + innerH * 0.75, label: -absMax / 2 },
      { y: padT + innerH, label: -absMax }
    ];

    const yFor = (v) => {
      const h = (Math.abs(v) / absMax) * (innerH / 2);
      const y = v >= 0 ? zeroY - h : zeroY;
      return { y, h };
    };

    return {
      width, height, padL, padR, padT, padB, zeroY, slot, absMax,
      hitTop, hitH,
      avgPerBucket, avgPerTrade, nonEmptyBuckets,
      gridLines,
      bestKey: best?.[labelKey],
      worstKey: worst?.[labelKey],
      bars: buckets.map((b, i) => {
        const cx = padL + slot * i + slot / 2;
        const totalLeft = cx - groupW / 2;
        const avgLeft   = totalLeft + subW + gap;

        const totalGeo = yFor(b.sum);
        const avgVal = b.count > 0 ? b.sum / b.count : 0;
        const avgGeo = b.count > 0 ? yFor(avgVal) : null;

        return {
          cx,
          label: b[labelKey],
          sum: b.sum,
          avgVal,
          count: b.count,
          wins: b.wins,
          subW,
          totalX: totalLeft,
          totalY: totalGeo.y,
          totalH: totalGeo.h,
          avgX: avgLeft,
          avgY: avgGeo?.y ?? zeroY,
          avgH: avgGeo?.h ?? 0,
          hitX: cx - slot / 2,
          hitW: slot,
          isBest:  b[labelKey] === best?.[labelKey]  && b.count > 0,
          isWorst: b[labelKey] === worst?.[labelKey] && b.count > 0
        };
      })
    };
  }

  $: hourLayout = barLayout(byHour, 760, 200, 'hour');
  $: wdLayout   = barLayout(byWeekday, 760, 200, 'label');

  // ============================================================
  // TAGS
  // ============================================================
  $: tagStats = getStatsByTag(filtered);
</script>

{#if !hasTrades}
  <div class="empty-state">📊 Нет данных для статистики</div>
{:else}
  {#if stats.firstDate || stats.lastDate}
    <div class="stats-period">
      Период: <strong>{formatDate(stats.firstDate, 'DD.MM.YYYY')}</strong>
      &nbsp;—&nbsp;
      <strong>{formatDate(stats.lastDate, 'DD.MM.YYYY')}</strong>
    </div>
  {/if}

  <h3 class="stats-section-title">Доходность</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Всего сделок</div>
      <div class="stat-value">{stats.totalTrades}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Чистая прибыль</div>
      <div class="stat-value {stats.netProfit >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.netProfit, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общая прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.grossProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общий убыток</div>
      <div class="stat-value loss">-${formatNumber(stats.grossLoss, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Фактор прибыли</div>
      <div class="stat-value">
        {Number.isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor, 2) : '∞'}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Матожидание</div>
      <div class="stat-value {stats.expectancy >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.expectancy, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма комиссий</div>
      <div class="stat-value {stats.sumCommission >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.sumCommission, 2)}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма свопов</div>
      <div class="stat-value {stats.sumSwap >= 0 ? 'profit' : 'loss'}">
        ${formatNumber(stats.sumSwap, 2)}
      </div>
    </div>
  </div>

  <h3 class="stats-section-title">Сделки</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value">{formatNumber(stats.winRate, 1)}%</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Прибыльные / Убыточные</div>
      <div class="stat-value">
        <span class="profit">{stats.winningCount}</span>
        &nbsp;/&nbsp;
        <span class="loss">{stats.losingCount}</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.avgProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средний убыток</div>
      <div class="stat-value loss">-${formatNumber(stats.avgLoss, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. прибыль</div>
      <div class="stat-value profit">${formatNumber(stats.maxProfit, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. убыток</div>
      <div class="stat-value loss">${formatNumber(stats.maxLoss, 2)}</div>
    </div>
  </div>

  <h3 class="stats-section-title">Long / Short</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Длинные (% выигравших)</div>
      <div class="stat-value">
        {stats.longCount} ({formatNumber(stats.longWinRate, 1)}%)
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Короткие (% выигравших)</div>
      <div class="stat-value">
        {stats.shortCount} ({formatNumber(stats.shortWinRate, 1)}%)
      </div>
    </div>
  </div>

  <h3 class="stats-section-title">Серии</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Макс. подряд выигрышей</div>
      <div class="stat-value">
        {stats.maxConsecutiveWins}
        <small class="stat-sub">(${formatNumber(stats.maxConsecutiveWinAmount, 2)})</small>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. подряд проигрышей</div>
      <div class="stat-value">
        {stats.maxConsecutiveLosses}
        <small class="stat-sub">(${formatNumber(stats.maxConsecutiveLossAmount, 2)})</small>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя серия выигрышей</div>
      <div class="stat-value">{formatNumber(stats.avgConsecutiveWins, 1)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средняя серия проигрышей</div>
      <div class="stat-value">{formatNumber(stats.avgConsecutiveLosses, 1)}</div>
    </div>
  </div>

  <h3 class="stats-section-title">Риск</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Макс. просадка ($)</div>
      <div class="stat-value loss">-${formatNumber(stats.maxDrawdown, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. просадка (%)</div>
      <div class="stat-value loss">{formatNumber(stats.maxDrawdownPercent, 2)}%</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Фактор восстановления</div>
      <div class="stat-value">{formatNumber(stats.recoveryFactor, 2)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Коэф. Шарпа (упрощ.)</div>
      <div class="stat-value">{formatNumber(stats.sharpeRatio, 2)}</div>
    </div>
  </div>

  <h3 class="stats-section-title">Аналитика · фильтры</h3>
  <div class="filters-bar">
    <div class="filter-group">
      <span class="filter-label">Период</span>
      <div class="pill-group">
        {#each periods as p}
          <button
            class="pill-btn {periodFilter === p.id ? 'active' : ''}"
            on:click={() => (periodFilter = p.id)}
          >{p.label}</button>
        {/each}
      </div>
    </div>

    <div class="filter-group">
      <span class="filter-label">Направление</span>
      <div class="pill-group">
        {#each directions as d}
          <button
            class="pill-btn {directionFilter === d.id ? 'active' : ''}"
            on:click={() => (directionFilter = d.id)}
          >{d.label}</button>
        {/each}
      </div>
    </div>

    {#if allTags.length > 0}
      <div class="filter-group">
        <span class="filter-label">Тег</span>
        <select class="filter-select" bind:value={tagFilter}>
          <option value="all">Все теги</option>
          {#each allTags as tg}
            <option value={tg}>{tg}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="filter-group">
      <label class="filter-check">
        <input type="checkbox" bind:checked={disciplinedOnly} />
        <span>Только без нарушений правил</span>
      </label>
    </div>

    {#if hasFilter}
      <button class="filter-reset" on:click={resetFilters}>× Сбросить</button>
    {/if}

    <div class="filter-summary">
      <span>{filteredAgg.count} сделок</span>
      <span class={filteredAgg.sum >= 0 ? 'profit' : 'loss'}>
        {filteredAgg.sum >= 0 ? '+' : ''}{formatNumber(filteredAgg.sum, 2)} {currency}
      </span>
      <span>WR {formatNumber(filteredAgg.wr, 1)}%</span>
      <span class="muted">{filteredAgg.wins}W / {filteredAgg.losses}L</span>
    </div>
  </div>

  {#if filtered.length === 0}
    <div class="empty-state-mini">Под выбранные фильтры не попало ни одной сделки</div>
  {/if}

  {#if eq}
    <h3 class="stats-section-title">Equity Curve · реальная vs disciplined</h3>
    <div class="chart-wrap">
      <div class="chart-stat-row">
        <span class="chart-stat">
          <i class="dot dot-real"></i>Реальная (фактический баланс):
          <strong class={eq.realDelta >= 0 ? 'profit' : 'loss'}>
            {formatNumber(eq.lastReal, 2)} {currency}
            ({eq.realDelta >= 0 ? '+' : ''}{formatNumber(eq.realDelta, 2)})
          </strong>
        </span>
        <span class="chart-stat">
          <i class="dot dot-disc"></i>Disciplined (без сделок с нарушениями):
          <strong class={eq.discDelta >= 0 ? 'profit' : 'loss'}>
            {formatNumber(eq.lastDisc, 2)} {currency}
            ({eq.discDelta >= 0 ? '+' : ''}{formatNumber(eq.discDelta, 2)})
          </strong>
        </span>
        <span class="chart-stat gap">
          Gap (Disciplined − Real):
          <strong class={eq.gap >= 0 ? 'profit' : 'loss'}>
            {eq.gap >= 0 ? '+' : ''}{formatNumber(eq.gap, 2)} {currency}
          </strong>
        </span>
      </div>

      <div class="axis-legend">
        <span><b>Y</b> — Equity, {currency}</span>
        <span><b>X</b> — дата закрытия сделки</span>
        <span class="muted-legend">пунктирная линия = стартовый капитал</span>
      </div>

      <svg viewBox="0 0 {EQ_W} {EQ_H}" class="chart-svg" preserveAspectRatio="none">
        <!-- grid -->
        {#each eq.gridLines as g}
          <line
            x1={EQ_PAD.l} x2={EQ_W - EQ_PAD.r}
            y1={g.y} y2={g.y}
            class="grid-line"
          />
          <text x={EQ_PAD.l - 6} y={g.y + 3} class="chart-axis-label" text-anchor="end">
            {formatNumber(g.label, 0)}
          </text>
        {/each}

        <!-- baseline (initialCapital) -->
        <line
          x1={EQ_PAD.l} x2={EQ_W - EQ_PAD.r}
          y1={eq.baseY} y2={eq.baseY}
          class="chart-axis baseline"
          stroke-dasharray="3 3"
        />
        <text x={EQ_W - EQ_PAD.r - 4} y={eq.baseY - 4} class="chart-axis-label" text-anchor="end">
          старт {formatNumber(initialCapital, 0)}
        </text>

        <!-- area под real -->
        <path d={eq.realArea} class="area-real" />

        <!-- линии -->
        <path d={eq.discLine} class="line-disc" fill="none" stroke-width="1.6" stroke-dasharray="4 3" />
        <path d={eq.realLine} class="line-real" fill="none" stroke-width="2" />

        <!-- маркер последней точки -->
        <circle cx={eq.lastX} cy={eq.lastDiscY} r="3" class="dot-svg-disc" />
        <circle cx={eq.lastX} cy={eq.lastRealY} r="4" class="dot-svg-real" />

        <!-- даты по X -->
        {#each eq.xTicks as t}
          <text x={t.x} y={EQ_H - 8} class="chart-tick">{formatDate(t.date, 'DD.MM')}</text>
        {/each}
      </svg>
    </div>
  {/if}

  {#if hourLayout}
    <h3 class="stats-section-title">
      PnL по часу открытия
      <span class="section-meta">
        avg/сделка: <strong>{formatNumber(hourLayout.avgPerTrade, 2)}</strong> {currency}
        · avg/торговый час: <strong>{formatNumber(hourLayout.avgPerBucket, 2)}</strong> {currency}
      </span>
    </h3>
    <div class="chart-wrap">
      <div class="axis-legend">
        <span><b>Y</b> — PnL, {currency}</span>
        <span><b>X</b> — час открытия сделки (0–23, локальное время)</span>
        <span class="muted-legend">
          <i class="legend-swatch sw-total"></i>левый бар — суммарный PnL за час ·
          <i class="legend-swatch sw-avg"></i>правый бар — средний PnL/сделка ·
          мелкая цифра под часом — кол-во сделок ·
          обводка — лучший / худший час
        </span>
      </div>
      <svg viewBox="0 0 {hourLayout.width} {hourLayout.height}" class="chart-svg" preserveAspectRatio="none">
        <!-- grid -->
        {#each hourLayout.gridLines as g}
          <line
            x1={hourLayout.padL} x2={hourLayout.width - hourLayout.padR}
            y1={g.y} y2={g.y}
            class={g.label === 0 ? 'chart-axis' : 'grid-line'}
          />
          <text x={hourLayout.padL - 6} y={g.y + 3} class="chart-axis-label" text-anchor="end">
            {g.label > 0 ? '+' : ''}{formatNumber(g.label, 0)}
          </text>
        {/each}

        {#each hourLayout.bars as b}
          <!-- total bar -->
          <rect
            x={b.totalX} y={b.totalY} width={b.subW} height={b.totalH}
            class="bar-total {b.sum >= 0 ? 'pos' : 'neg'} {b.isBest ? 'bar-best' : ''} {b.isWorst ? 'bar-worst' : ''}"
          />
          <!-- avg bar -->
          {#if b.count > 0}
            <rect
              x={b.avgX} y={b.avgY} width={b.subW} height={b.avgH}
              class="bar-avg {b.avgVal >= 0 ? 'pos' : 'neg'}"
            />
          {/if}
          {#if (b.isBest || b.isWorst) && b.count > 0}
            <text
              x={b.cx}
              y={b.sum >= 0 ? b.totalY - 4 : b.totalY + b.totalH + 11}
              class="bar-value-label"
              text-anchor="middle"
            >
              {b.sum >= 0 ? '+' : ''}{formatNumber(b.sum, 0)}
            </text>
          {/if}
          {#if b.label % 3 === 0}
            <text x={b.cx} y={hourLayout.height - 14} class="chart-tick">{String(b.label).padStart(2, '0')}</text>
          {/if}
          {#if b.count > 0 && b.label % 3 === 0}
            <text x={b.cx} y={hourLayout.height - 2} class="chart-tick muted-tick">{b.count}</text>
          {/if}
          <!-- единый hit-area на всю колонку: tooltip показывается над и под баром -->
          <rect
            x={b.hitX} y={hourLayout.hitTop} width={b.hitW} height={hourLayout.hitH}
            class="bar-hit"
          >
            <title>{String(b.label).padStart(2, '0')}:00 · {b.count} сделок ({b.wins} W / {b.count - b.wins} L)
total: {b.sum >= 0 ? '+' : ''}{formatNumber(b.sum, 2)} {currency}{b.count > 0 ? `
avg/сделка: ${b.avgVal >= 0 ? '+' : ''}${formatNumber(b.avgVal, 2)} ${currency}` : ''}</title>
          </rect>
        {/each}
      </svg>
    </div>
  {/if}

  {#if wdLayout}
    <h3 class="stats-section-title">
      PnL по дню недели
      <span class="section-meta">
        avg/сделка: <strong>{formatNumber(wdLayout.avgPerTrade, 2)}</strong> {currency}
        · avg/торговый день: <strong>{formatNumber(wdLayout.avgPerBucket, 2)}</strong> {currency}
      </span>
    </h3>
    <div class="chart-wrap">
      <div class="axis-legend">
        <span><b>Y</b> — PnL, {currency}</span>
        <span><b>X</b> — день недели (Пн–Вс)</span>
        <span class="muted-legend">
          <i class="legend-swatch sw-total"></i>левый бар — суммарный PnL за день ·
          <i class="legend-swatch sw-avg"></i>правый бар — средний PnL/сделка ·
          мелкая цифра под днём — кол-во сделок ·
          обводка — лучший / худший день
        </span>
      </div>
      <svg viewBox="0 0 {wdLayout.width} {wdLayout.height}" class="chart-svg" preserveAspectRatio="none">
        {#each wdLayout.gridLines as g}
          <line
            x1={wdLayout.padL} x2={wdLayout.width - wdLayout.padR}
            y1={g.y} y2={g.y}
            class={g.label === 0 ? 'chart-axis' : 'grid-line'}
          />
          <text x={wdLayout.padL - 6} y={g.y + 3} class="chart-axis-label" text-anchor="end">
            {g.label > 0 ? '+' : ''}{formatNumber(g.label, 0)}
          </text>
        {/each}

        {#each wdLayout.bars as b}
          <rect
            x={b.totalX} y={b.totalY} width={b.subW} height={b.totalH}
            class="bar-total {b.sum >= 0 ? 'pos' : 'neg'} {b.isBest ? 'bar-best' : ''} {b.isWorst ? 'bar-worst' : ''}"
          />
          {#if b.count > 0}
            <rect
              x={b.avgX} y={b.avgY} width={b.subW} height={b.avgH}
              class="bar-avg {b.avgVal >= 0 ? 'pos' : 'neg'}"
            />
          {/if}
          {#if (b.isBest || b.isWorst) && b.count > 0}
            <text
              x={b.cx}
              y={b.sum >= 0 ? b.totalY - 4 : b.totalY + b.totalH + 11}
              class="bar-value-label"
              text-anchor="middle"
            >
              {b.sum >= 0 ? '+' : ''}{formatNumber(b.sum, 0)}
            </text>
          {/if}
          <text x={b.cx} y={wdLayout.height - 14} class="chart-tick">{b.label}</text>
          {#if b.count > 0}
            <text x={b.cx} y={wdLayout.height - 2} class="chart-tick muted-tick">{b.count}</text>
          {/if}
          <rect
            x={b.hitX} y={wdLayout.hitTop} width={b.hitW} height={wdLayout.hitH}
            class="bar-hit"
          >
            <title>{b.label} · {b.count} сделок ({b.wins} W / {b.count - b.wins} L)
total: {b.sum >= 0 ? '+' : ''}{formatNumber(b.sum, 2)} {currency}{b.count > 0 ? `
avg/сделка: ${b.avgVal >= 0 ? '+' : ''}${formatNumber(b.avgVal, 2)} ${currency}` : ''}</title>
          </rect>
        {/each}
      </svg>
    </div>
  {/if}

  {#if tagStats.length > 0}
    <h3 class="stats-section-title">По тегам сетапов</h3>
    <div class="axis-legend in-table">
      <span><b>Win Rate</b> — % прибыльных сделок этого тега</span>
      <span><b>Net PnL</b> — суммарный финансовый результат, {currency}</span>
      <span><b>Expectancy</b> — средний PnL на сделку, {currency}</span>
      <span><b>PF (Profit Factor)</b> — Σ прибыли ÷ Σ убытков (≥ 1.5 — рабочий сетап)</span>
    </div>
    <div class="tag-table-wrap">
      <table class="tag-table">
        <thead>
          <tr>
            <th>Тег</th>
            <th class="num">Сделок</th>
            <th class="num">Win Rate</th>
            <th class="num">Net PnL</th>
            <th class="num">Expectancy</th>
            <th class="num">PF</th>
          </tr>
        </thead>
        <tbody>
          {#each tagStats as t}
            <tr>
              <td><span class="tag-pill">{t.tag}</span></td>
              <td class="num">{t.count}</td>
              <td class="num">{formatNumber(t.winRate, 1)}%</td>
              <td class="num {t.sum >= 0 ? 'profit' : 'loss'}">{formatNumber(t.sum, 2)}</td>
              <td class="num {t.expectancy >= 0 ? 'profit' : 'loss'}">{formatNumber(t.expectancy, 2)}</td>
              <td class="num">{Number.isFinite(t.profitFactor) ? formatNumber(t.profitFactor, 2) : '∞'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .stats-section-title {
    margin: 24px 0 8px;
    padding: 0 20px;
    font-size: 14px;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .stats-period {
    margin-bottom: 12px;
    padding: 0 20px;
    text-align: left;
    opacity: 0.85;
    font-size: 13px;
  }

  .stat-sub {
    display: block;
    font-size: 11px;
    margin-top: 2px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .empty-state {
    padding: 24px;
    text-align: center;
    opacity: 0.7;
  }

  /* ---- Filters ---- */
  .filters-bar {
    margin: 0 20px 16px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px 18px;
  }
  .filter-group { display: flex; align-items: center; gap: 8px; }
  .filter-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .pill-group {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
    background: var(--bg);
  }
  .pill-btn {
    padding: 5px 11px;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--border);
    color: var(--text);
    font-size: 12.5px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .pill-btn:last-child { border-right: 0; }
  .pill-btn:hover { background: var(--bg-2); }
  .pill-btn.active {
    background: var(--accent);
    color: #fff;
  }
  .filter-select {
    padding: 5px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 12.5px;
    min-width: 140px;
    cursor: pointer;
  }
  .filter-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--text);
  }
  .filter-reset {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--loss);
    border-radius: 3px;
    color: var(--loss);
    font-size: 12px;
    cursor: pointer;
  }
  .filter-reset:hover { background: var(--loss); color: #fff; }
  .filter-summary {
    margin-left: auto;
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .filter-summary strong { color: var(--text-strong); }
  .filter-summary .muted { color: var(--text-muted); font-size: 12px; }

  .empty-state-mini {
    margin: 0 20px 16px;
    padding: 16px;
    border: 1px dashed var(--border);
    border-radius: 4px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  .section-meta {
    margin-left: 8px;
    font-size: 11px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-muted);
    opacity: 1;
    font-weight: 500;
  }

  /* ---- Charts ---- */
  .chart-wrap {
    margin: 0 20px 16px;
    padding: 12px 14px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .chart-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .chart-axis { stroke: var(--border); stroke-width: 1; }
  .chart-axis.baseline { stroke: var(--text-muted); opacity: 0.5; }
  .grid-line { stroke: var(--border); stroke-width: 1; opacity: 0.4; }
  .chart-axis-label { fill: var(--text-muted); font-size: 10px; }
  .chart-tick {
    fill: var(--text-muted);
    font-size: 10px;
    text-anchor: middle;
  }
  .chart-tick.muted-tick { fill: var(--text-muted); opacity: 0.55; font-size: 9px; }

  .axis-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    margin-bottom: 10px;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
    border-radius: 3px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text);
  }
  .axis-legend b {
    color: var(--text-strong);
    font-weight: 700;
    font-size: 11px;
    background: var(--bg-2);
    padding: 1px 5px;
    border-radius: 2px;
    margin-right: 4px;
  }
  .axis-legend .muted-legend {
    color: var(--text-muted);
    font-size: 11px;
    flex-basis: 100%;
  }
  .axis-legend.in-table {
    margin: 0 20px 10px;
  }

  .line-real { stroke: var(--accent); }
  .line-disc { stroke: var(--profit); opacity: 0.9; }
  .area-real { fill: var(--accent); opacity: 0.12; }

  .dot-svg-real {
    fill: var(--accent);
    stroke: var(--bg);
    stroke-width: 2;
  }
  .dot-svg-disc {
    fill: var(--profit);
    stroke: var(--bg);
    stroke-width: 1.5;
  }

  /* Total = насыщенный бар, Avg = тот же оттенок но светлее (сплошной) */
  .bar-total.pos { fill: var(--profit); opacity: 0.92; }
  .bar-total.neg { fill: var(--loss);   opacity: 0.92; }

  .bar-avg.pos { fill: color-mix(in srgb, var(--profit) 45%, transparent); }
  .bar-avg.neg { fill: color-mix(in srgb, var(--loss)   45%, transparent); }

  .bar-best  { stroke: var(--profit); stroke-width: 1.8; opacity: 1; }
  .bar-worst { stroke: var(--loss);   stroke-width: 1.8; opacity: 1; }

  /* hit-area: невидимая широкая область над всем столбцом, чтобы tooltip всплывал
     при наведении на любое место выше/ниже самих баров */
  .bar-hit {
    fill: transparent;
    pointer-events: all;
    cursor: default;
    transition: fill 120ms;
  }
  .bar-hit:hover { fill: rgba(127, 127, 127, 0.06); }

  .legend-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin: 0 4px -2px 0;
    border-radius: 2px;
    vertical-align: middle;
  }
  .legend-swatch.sw-total { background: var(--profit); opacity: 0.92; }
  .legend-swatch.sw-avg   { background: color-mix(in srgb, var(--profit) 45%, transparent); }
  .bar-value-label {
    fill: var(--text-strong);
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .chart-stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .chart-stat strong { font-variant-numeric: tabular-nums; }
  .chart-stat.gap { margin-left: auto; }
  .dot {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }
  .dot-real { background: var(--accent); }
  .dot-disc {
    background: linear-gradient(to right, var(--profit) 0 3px, transparent 3px 5px, var(--profit) 5px 8px);
  }

  /* ---- Tag table ---- */
  .tag-table-wrap {
    margin: 0 20px 16px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .tag-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .tag-table th,
  .tag-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .tag-table th {
    background: var(--bg-2);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .tag-table tbody tr:last-child td { border-bottom: 0; }
  .tag-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .tag-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--accent-bg, var(--bg-3));
    color: var(--text);
    font-size: 12px;
    border: 1px solid var(--border);
  }
</style>
