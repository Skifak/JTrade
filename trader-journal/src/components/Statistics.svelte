<script>
  import { formatNumber, formatDate } from '../lib/utils';
  import {
    getEquityCurve,
    getPnLByHour,
    getPnLByWeekday,
    getStatsByTag,
    getStatsByPlay,
    getStatsByBiasAlignment
  } from '../lib/risk';
  import { getPnLByKillzone, primaryKillzone, killzoneLabel } from '../lib/killzones';
  import { journalSettings } from '../lib/journalSettings';
  import { strategies, flattenPlays } from '../lib/playbooks';
  import { htfBias, findActiveBias, isAlignedWithBias } from '../lib/htfBias';
  import { prettyTag, isIctTag } from '../lib/ictTaxonomy';
  import { fxRate, tradeProfitDisplayUnits } from '../lib/fxRate';
  import { calculateStats } from '../lib/utils';
  import Modal from './Modal.svelte';

  export let stats;
  export let closedTrades = [];
  export let initialCapital = 0;
  export let currency = 'USD';

  $: hasTrades = stats?.totalTrades > 0;
  $: journalSnap = $journalSettings;

  // ============================================================
  // ФИЛЬТРЫ
  // ============================================================
  let periodFilter = 'all';   // all | day | week | month | 3m | year
  let directionFilter = 'all'; // all | long | short
  let tagFilter = 'all';       // all | <tag>
  let playFilter = 'all';      // all | <strategyId:playId>
  let kzFilter = 'all';        // all | <kzId>
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

  // MT5 «Прибыль» уже в депозите; ручные — USD из calculateProfit → tradeProfitDisplayUnits.
  // initialCapital в валюте счёта.
  $: filteredRaw = (() => {
    journalSnap;
    const start = periodStart(Date.now(), periodFilter);
    return closedTrades.filter((t) => {
      if (start && t.dateClose && new Date(t.dateClose) < start) return false;
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
      if (tagFilter !== 'all' && !(Array.isArray(t.tags) && t.tags.includes(tagFilter))) return false;
      if (playFilter !== 'all') {
        const key = t.strategyId && t.playId ? `${t.strategyId}:${t.playId}` : '__none';
        if (playFilter === '__none' ? key !== '__none' : key !== playFilter) return false;
      }
      if (kzFilter !== 'all') {
        const id = t.killzone || primaryKillzone(t.dateOpen) || '_OUT';
        if (id !== kzFilter) return false;
      }
      if (disciplinedOnly && Array.isArray(t.ruleViolations) && t.ruleViolations.length > 0) return false;
      return true;
    });
  })();
  $: filtered = filteredRaw.map((t) => ({
    ...t,
    profit: tradeProfitDisplayUnits(t, $fxRate)
  }));

  $: stats = calculateStats(filtered, { initialCapital });

  $: hasFilter =
    periodFilter !== 'all' ||
    directionFilter !== 'all' ||
    tagFilter !== 'all' ||
    playFilter !== 'all' ||
    kzFilter !== 'all' ||
    disciplinedOnly;

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
    playFilter = 'all';
    kzFilter = 'all';
    disciplinedOnly = false;
  }

  // ============================================================
  // КАЛЕНДАРЬ P&L (по dateClose, локальная дата)
  // ============================================================
  let calendarMonth = new Date();

  const weekdayShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  function pnlDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function metricsForDayTrades(trades) {
    if (!trades?.length) {
      return { sum: 0, count: 0, maxP: 0, maxDD: 0, hasTrades: false, trades: [] };
    }
    const sorted = [...trades].sort(
      (a, b) => new Date(a.dateClose).getTime() - new Date(b.dateClose).getTime()
    );
    const profits = sorted.map((t) => Number(t.profit) || 0);
    const sum = profits.reduce((a, b) => a + b, 0);
    const maxP = Math.max(...profits);
    let eq = 0;
    let peak = 0;
    let maxDD = 0;
    for (const p of profits) {
      eq += p;
      peak = Math.max(peak, eq);
      maxDD = Math.min(maxDD, eq - peak);
    }
    return { sum, count: profits.length, maxP, maxDD, hasTrades: true, trades: sorted };
  }

  $: pnlByDay = (() => {
    const m = new Map();
    for (const t of filtered) {
      if (!t.dateClose) continue;
      const k = pnlDateKey(new Date(t.dateClose));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    const out = new Map();
    for (const [k, arr] of m) {
      out.set(k, metricsForDayTrades(arr));
    }
    return out;
  })();

  $: pnlCalendar = (() => {
    const y = calendarMonth.getFullYear();
    const mm = calendarMonth.getMonth();
    const first = new Date(y, mm, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, mm + 1, 0).getDate();
    const gridStart = new Date(y, mm, 1 - startPad);
    const now = new Date();
    const rows = [];
    for (let w = 0; w < 6; w++) {
      const cells = [];
      let weekSum = 0;
      for (let c = 0; c < 7; c++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + w * 7 + c);
        const inMonth = d.getMonth() === mm && d.getFullYear() === y;
        const key = pnlDateKey(d);
        const met = pnlByDay.get(key) || { sum: 0, count: 0, maxP: 0, maxDD: 0, hasTrades: false, trades: [] };
        if (inMonth) weekSum += met.sum;
        const isToday =
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear();
        cells.push({
          dayNum: d.getDate(),
          inMonth,
          key,
          isToday,
          sum: met.sum,
          count: met.count,
          maxP: met.maxP,
          maxDD: met.maxDD,
          hasTrades: met.hasTrades
        });
      }
      rows.push({ weekSum, cells });
    }
    let monthTotal = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const k = pnlDateKey(new Date(y, mm, day));
      const met = pnlByDay.get(k);
      if (met) monthTotal += met.sum;
    }
    const monthLabel = new Date(y, mm, 15).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return { y, mm, rows, monthTotal, monthLabel, daysInMonth };
  })();

  function calendarPrev() {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  }
  function calendarNext() {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  }

  function tradesWordRu(n) {
    const a = Math.abs(n) % 100;
    const b = n % 10;
    if (a > 10 && a < 20) return 'трейдов';
    if (b === 1) return 'трейд';
    if (b >= 2 && b <= 4) return 'трейда';
    return 'трейдов';
  }

  let dayModalOpen = false;
  let dayModalKey = null;

  function summarizeDayTrades(trades) {
    if (!trades?.length) return null;
    const profits = trades.map((t) => Number(t.profit) || 0);
    const sum = profits.reduce((a, b) => a + b, 0);
    const winProfits = profits.filter((p) => p > 0);
    const lossProfits = profits.filter((p) => p < 0);
    const w = winProfits.length;
    const l = lossProfits.length;
    const grossWin = winProfits.reduce((a, b) => a + b, 0);
    const grossLoss = -lossProfits.reduce((a, b) => a + b, 0);
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = w ? grossWin / w : 0;
    const avgLoss = l ? grossLoss / l : 0;
    let eq = 0;
    let peak = 0;
    let maxDD = 0;
    for (const p of profits) {
      eq += p;
      peak = Math.max(peak, eq);
      maxDD = Math.min(maxDD, eq - peak);
    }
    const long = trades.filter((t) => t.direction === 'long').length;
    const short = trades.filter((t) => t.direction === 'short').length;
    const withViol = trades.filter((t) => Array.isArray(t.ruleViolations) && t.ruleViolations.length > 0).length;
    const best = profits.length ? Math.max(...profits) : 0;
    const worst = profits.length ? Math.min(...profits) : 0;
    return {
      sum,
      wr: profits.length ? (w / profits.length) * 100 : 0,
      w,
      l,
      avgWin,
      avgLoss,
      pf,
      maxDD,
      long,
      short,
      withViol,
      best,
      worst,
      expectancy: profits.length ? sum / profits.length : 0
    };
  }

  function openCalendarDay(key, inMonth, hasTrades) {
    if (!inMonth || !hasTrades) return;
    const d = pnlByDay.get(key);
    if (!d?.hasTrades) return;
    dayModalKey = key;
    dayModalOpen = true;
  }

  function closeCalendarDayModal() {
    dayModalOpen = false;
    dayModalKey = null;
  }

  $: dayModalDetail = dayModalKey ? pnlByDay.get(dayModalKey) : null;
  $: dayModalSummary = dayModalDetail?.trades ? summarizeDayTrades(dayModalDetail.trades) : null;
  $: dayModalTitle =
    dayModalKey &&
    new Date(dayModalKey + 'T12:00:00').toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

  // ============================================================
  // PLAY / BIAS / KILLZONE — мета и аналитика
  // ============================================================
  $: playOptions = flattenPlays($strategies);
  $: playMeta = (() => {
    const m = {};
    for (const p of playOptions) m[p.strategyId + ':' + p.playId] = { strategyName: p.strategyName, playName: p.playName };
    return m;
  })();
  $: byKZ = (journalSnap, getPnLByKillzone(filtered));
  $: byPlay = getStatsByPlay(filtered, playMeta);
  $: biasMap = $htfBias;
  $: byBias = getStatsByBiasAlignment(filtered, (t) => {
    const ref = t.dateOpen || t.dateClose;
    const bias = findActiveBias(biasMap, t.pair, ref ? new Date(ref) : new Date());
    return isAlignedWithBias(bias, t.direction);
  });

  // ============================================================
  // EQUITY CURVE — улучшенная
  // ============================================================
  $: equity = getEquityCurve(filtered, initialCapital);
  const EQ_W = 760;
  const EQ_H = 240;
  const EQ_PAD = { l: 60, r: 14, t: 14, b: 28 };

  $: eq = (() => {
    if (!equity.length) return null;
    /** Одна линия: факт (real) или disciplined — в зависимости от чекбокса «Только без нарушений». */
    const activeKey = disciplinedOnly ? 'disciplined' : 'real';
    const xs = equity.map((p) => p.ts);
    const ys = equity.map((p) => p[activeKey]);
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
    const lastV = last[activeKey];
    const valueDelta = lastV - initialCapital;

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
      mainLine: linePath(activeKey),
      mainArea: areaPath(activeKey),
      baseY: yS(initialCapital),
      lastX: xS(last.ts),
      lastY: yS(lastV),
      lastValue: lastV,
      valueDelta,
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
        {formatNumber(stats.netProfit, 2)} {currency}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общая прибыль</div>
      <div class="stat-value profit">{formatNumber(stats.grossProfit, 2)} {currency}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Общий убыток</div>
      <div class="stat-value loss">−{formatNumber(stats.grossLoss, 2)} {currency}</div>
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
        {formatNumber(stats.expectancy, 2)} {currency}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма комиссий</div>
      <div class="stat-value {stats.sumCommission >= 0 ? 'profit' : 'loss'}">
        {formatNumber(stats.sumCommission, 2)} {currency}
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Сумма свопов</div>
      <div class="stat-value {stats.sumSwap >= 0 ? 'profit' : 'loss'}">
        {formatNumber(stats.sumSwap, 2)} {currency}
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
      <div class="stat-value profit">{formatNumber(stats.avgProfit, 2)} {currency}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Средний убыток</div>
      <div class="stat-value loss">−{formatNumber(stats.avgLoss, 2)} {currency}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. прибыль</div>
      <div class="stat-value profit">{formatNumber(stats.maxProfit, 2)} {currency}</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. убыток</div>
      <div class="stat-value loss">{formatNumber(stats.maxLoss, 2)} {currency}</div>
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
        <small class="stat-sub">({formatNumber(stats.maxConsecutiveWinAmount, 2)} {currency})</small>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Макс. подряд проигрышей</div>
      <div class="stat-value">
        {stats.maxConsecutiveLosses}
        <small class="stat-sub">({formatNumber(stats.maxConsecutiveLossAmount, 2)} {currency})</small>
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
      <div class="stat-label">Макс. просадка</div>
      <div class="stat-value loss">−{formatNumber(stats.maxDrawdown, 2)} {currency}</div>
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
            <option value={tg}>{isIctTag(tg) ? prettyTag(tg) : tg}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if playOptions.length > 0}
      <div class="filter-group">
        <span class="filter-label">Setup</span>
        <select class="filter-select" bind:value={playFilter}>
          <option value="all">Все сетапы</option>
          <option value="__none">Без сетапа</option>
          {#each playOptions as p}
            <option value={`${p.strategyId}:${p.playId}`}>{p.full}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="filter-group">
      <span class="filter-label">Killzone</span>
      <select class="filter-select" bind:value={kzFilter}>
        <option value="all">Все KZ</option>
        {#each $journalSettings.killzones as kz}
          <option value={kz.id}>{kz.label}</option>
        {/each}
        <option value="_OUT">Вне KZ</option>
      </select>
    </div>

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

  <h3 class="stats-section-title">Календарь P&amp;L</h3>
  <p class="calendar-hint">
    По дате <strong>закрытия</strong> (фильтры выше). Max DD — от пика внутри дня по порядку закрытий.
    <strong>Клик по дню</strong> с сделками — краткая сводка.
  </p>
  <div class="pnl-calendar-wrap">
    <div class="pnl-cal-head">
      <div class="pnl-cal-title-block">
        <span class="pnl-cal-month">{pnlCalendar.monthLabel}</span>
        <span
          class="pnl-cal-month-sum {pnlCalendar.monthTotal >= 0 ? 'profit' : 'loss'}"
        >
          {pnlCalendar.monthTotal >= 0 ? '+' : ''}{formatNumber(pnlCalendar.monthTotal, 0)} {currency}
        </span>
      </div>
      <div class="pnl-cal-nav">
        <button type="button" class="pnl-cal-nav-btn" on:click={calendarPrev} aria-label="Предыдущий месяц"
          >‹</button
        >
        <button type="button" class="pnl-cal-nav-btn" on:click={calendarNext} aria-label="Следующий месяц"
          >›</button
        >
      </div>
    </div>
    <div class="pnl-cal-grid" role="grid" aria-label="Календарь PnL по дням">
      <div class="pnl-cal-row pnl-cal-row-head" role="row">
        {#each weekdayShort as wd}
          <div class="pnl-cal-hcell" role="columnheader">{wd}</div>
        {/each}
        <div class="pnl-cal-hcell pnl-cal-hcell-week" role="columnheader">Неделя</div>
      </div>
      {#each pnlCalendar.rows as row}
        <div class="pnl-cal-row" role="row">
          {#each row.cells as cell}
            <div
              class="pnl-cal-cell {cell.inMonth ? '' : 'pnl-cal-cell-muted'} {cell.isToday ? 'pnl-cal-cell-today' : ''} {cell.inMonth && cell.hasTrades ? 'pnl-cal-cell-clickable' : ''}"
              role="gridcell"
              tabindex={cell.inMonth && cell.hasTrades ? 0 : undefined}
              aria-label={cell.inMonth && cell.hasTrades ? `Открыть сделки за ${cell.dayNum} число` : undefined}
              on:click={() => openCalendarDay(cell.key, cell.inMonth, cell.hasTrades)}
              on:keydown={(e) => {
                if (cell.inMonth && cell.hasTrades && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  openCalendarDay(cell.key, cell.inMonth, cell.hasTrades);
                }
              }}
            >
              <span class="pnl-cal-daynum">{cell.dayNum}</span>
              {#if cell.inMonth && cell.hasTrades}
                <span class="pnl-cal-pnl {cell.sum >= 0 ? 'profit' : 'loss'}">
                  {cell.sum >= 0 ? '+' : ''}{formatNumber(cell.sum, 0)} {currency}
                </span>
                <span class="pnl-cal-meta">{cell.count} {tradesWordRu(cell.count)}</span>
                <span class="pnl-cal-metric maxp">
                  Max P: <span class={cell.maxP >= 0 ? 'profit' : 'loss'}>{formatNumber(cell.maxP, 0)} {currency}</span>
                </span>
                <span class="pnl-cal-metric maxdd">
                  Max DD: <span class="loss">{formatNumber(cell.maxDD, 0)} {currency}</span>
                </span>
              {:else if cell.inMonth}
                <span class="pnl-cal-empty">Нет сделок</span>
              {/if}
            </div>
          {/each}
          <div class="pnl-cal-cell pnl-cal-week-sum" role="gridcell">
            <span class={row.weekSum >= 0 ? 'profit' : 'loss'}>
              {row.weekSum >= 0 ? '+' : ''}{formatNumber(row.weekSum, 0)} {currency}
            </span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <Modal open={dayModalOpen} modalClass="day-trades-modal" on:close={closeCalendarDayModal}>
    <div slot="header">
      <h2 class="day-modal-title">{dayModalTitle || 'День'}</h2>
    </div>
    <div slot="body">
      {#if dayModalSummary && dayModalDetail?.trades?.length}
        <div
          class="day-modal-net day-modal-tip {dayModalSummary.sum >= 0 ? 'profit' : 'loss'}"
          title="Суммарный P&amp;L по всем сделкам с датой закрытия в этот день (с учётом фильтров статистики). WR — доля прибыльных сделок; W/L — число выигрышей и убытков."
        >
          {dayModalSummary.sum >= 0 ? '+' : ''}{formatNumber(dayModalSummary.sum, 2)} {currency}
          <span class="day-modal-net-sub"
            >· WR {formatNumber(dayModalSummary.wr, 1)}% ({dayModalSummary.w}W / {dayModalSummary.l}L)</span
          >
        </div>
        <div class="day-modal-kpis">
          <div
            class="day-modal-kpi day-modal-tip"
            title="Средняя прибыль по сделкам с положительным результатом за этот день. Если прибыльных не было — 0."
          >
            <span class="day-modal-kpi-l">Avg win</span>
            <span class="day-modal-kpi-v profit">+{formatNumber(dayModalSummary.avgWin, 2)}</span>
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Средний модуль убытка по сделкам с отрицательным результатом. В ячейке показан со знаком «−»."
          >
            <span class="day-modal-kpi-l">Avg loss</span>
            <span class="day-modal-kpi-v loss"
              >−{formatNumber(dayModalSummary.avgLoss, 2)}</span
            >
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Profit Factor: сумма прибылей / сумма убытков за день. «∞», если убытков не было; «—», если нечего считать."
          >
            <span class="day-modal-kpi-l">PF</span>
            <span class="day-modal-kpi-v"
              >{dayModalSummary.pf === 0
                ? '—'
                : Number.isFinite(dayModalSummary.pf)
                  ? formatNumber(Math.min(dayModalSummary.pf, 999), 2)
                  : '∞'}</span
            >
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Expectancy: средний P&amp;L на одну сделку за день (суммарный результат / число сделок)."
          >
            <span class="day-modal-kpi-l">Expectancy</span>
            <span
              class="day-modal-kpi-v {dayModalSummary.expectancy >= 0 ? 'profit' : 'loss'}"
              >{dayModalSummary.expectancy >= 0 ? '+' : ''}{formatNumber(dayModalSummary.expectancy, 2)}</span
            >
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Максимальная просадка от накопленного пика внутри дня: сделки идут в порядке времени закрытия, считается кривая кумулятивного P&amp;L."
          >
            <span class="day-modal-kpi-l">Max DD</span>
            <span class="day-modal-kpi-v loss">{formatNumber(dayModalSummary.maxDD, 2)}</span>
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Число сделок long и short среди закрытых в этот день. Формат: long / short."
          >
            <span class="day-modal-kpi-l">L / S</span>
            <span class="day-modal-kpi-v">{dayModalSummary.long} / {dayModalSummary.short}</span>
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Максимальный результат одной сделки за день (лучшая сделка по P&amp;L)."
          >
            <span class="day-modal-kpi-l">Best</span>
            <span
              class="day-modal-kpi-v {dayModalSummary.best >= 0 ? 'profit' : 'loss'}"
              >{dayModalSummary.best >= 0 ? '+' : ''}{formatNumber(dayModalSummary.best, 2)}</span
            >
          </div>
          <div
            class="day-modal-kpi day-modal-tip"
            title="Минимальный результат одной сделки за день (худшая сделка по P&amp;L)."
          >
            <span class="day-modal-kpi-l">Worst</span>
            <span class="day-modal-kpi-v loss">{formatNumber(dayModalSummary.worst, 2)}</span>
          </div>
        </div>
        {#if dayModalSummary.withViol > 0}
          <p
            class="day-modal-warn day-modal-tip"
            title="Сделки, у которых при открытии были зафиксированы нарушения правил (ruleViolations). Строки в таблице ниже подсвечены."
          >
            ⚠ {dayModalSummary.withViol} из {dayModalDetail.trades.length} с ruleViolations
          </p>
        {/if}
        <div class="day-modal-table-wrap">
          <table class="day-modal-table">
            <thead>
              <tr>
                <th class="day-modal-tip" title="Время закрытия сделки (локально)">Время</th>
                <th class="day-modal-tip" title="Торговый инструмент">Пара</th>
                <th class="day-modal-tip" title="Направление позиции: L — long, S — short">Направление</th>
                <th class="num day-modal-tip" title="Результат сделки в валюте счёта">P&amp;L</th>
                <th class="day-modal-tip" title="Сетап из плейбука (полный путь — в подсказке у ячейки)">Сетап</th>
              </tr>
            </thead>
            <tbody>
              {#each dayModalDetail.trades as t}
                {@const pk = t.strategyId && t.playId ? `${t.strategyId}:${t.playId}` : ''}
                {@const pm = pk && playMeta[pk] ? playMeta[pk] : null}
                <tr class:day-row-warn={Array.isArray(t.ruleViolations) && t.ruleViolations.length > 0}>
                  <td class="mono">{formatDate(t.dateClose, 'HH:mm')}</td>
                  <td class="pair">{t.pair || '—'}</td>
                  <td
                    class="dir day-modal-tip"
                    title={t.direction === 'short' ? 'Short' : 'Long'}
                    >{t.direction === 'short' ? 'S' : 'L'}</td
                  >
                  <td class="num pnl {Number(t.profit) >= 0 ? 'profit' : 'loss'}">
                    {Number(t.profit) >= 0 ? '+' : ''}{formatNumber(Number(t.profit) || 0, 2)}
                  </td>
                  <td class="setup" title={pm ? `${pm.strategyName} → ${pm.playName}` : ''}>
                    {pm ? pm.playName : '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
    <div slot="footer">
      <button type="button" class="btn btn-sm" on:click={closeCalendarDayModal}>Закрыть</button>
    </div>
  </Modal>

  {#if filtered.length === 0}
    <div class="empty-state-mini">Под выбранные фильтры не попало ни одной сделки</div>
  {/if}

  {#if eq}
    <h3 class="stats-section-title">
      Equity Curve · {#if disciplinedOnly}только без нарушений{:else}фактический баланс{/if}
    </h3>
    <div class="chart-wrap">
      <div class="chart-stat-row">
        {#if disciplinedOnly}
          <span class="chart-stat">
            <i class="dot dot-disc"></i>Disciplined (кривая без сделок с нарушениями):
            <strong class={eq.valueDelta >= 0 ? 'profit' : 'loss'}>
              {formatNumber(eq.lastValue, 2)} {currency}
              ({eq.valueDelta >= 0 ? '+' : ''}{formatNumber(eq.valueDelta, 2)})
            </strong>
          </span>
        {:else}
          <span class="chart-stat">
            <i class="dot dot-real"></i>Реальный баланс (все сделки по фильтрам):
            <strong class={eq.valueDelta >= 0 ? 'profit' : 'loss'}>
              {formatNumber(eq.lastValue, 2)} {currency}
              ({eq.valueDelta >= 0 ? '+' : ''}{formatNumber(eq.valueDelta, 2)})
            </strong>
          </span>
        {/if}
      </div>

      <div class="axis-legend">
        <span><b>Y</b> — Equity, {currency}</span>
        <span><b>X</b> — дата закрытия сделки</span>
        <span class="muted-legend">
          {#if disciplinedOnly}
            <i class="eq-key eq-key-disc"></i>только сделки без ruleViolations ·
          {:else}
            <i class="eq-key eq-key-real"></i>все сделки по фильтру ·
          {/if}
          пунктир оси = стартовый капитал
        </span>
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

        <path d={eq.mainArea} class={disciplinedOnly ? 'area-disc' : 'area-real'} />

        <path
          d={eq.mainLine}
          class={disciplinedOnly ? 'line-disc' : 'line-real'}
          fill="none"
          stroke-width="1.1"
        />

        <circle
          cx={eq.lastX}
          cy={eq.lastY}
          r="4"
          class={disciplinedOnly ? 'dot-svg-disc' : 'dot-svg-real'}
        />

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

  <!-- PnL by Killzone -->
  {#if byKZ.some((b) => b.count > 0)}
    {@const kzMax = Math.max(1, ...byKZ.map((b) => Math.abs(b.sum)))}
    <h3 class="stats-section-title">
      PnL по killzone (NY-time)
      <span class="section-meta">
        Где твой edge: окна с положительным средним = твоя зона. Отрицательные → выкидывай или backtest.
      </span>
    </h3>
    <div class="chart-wrap">
      <div class="axis-legend">
        <span><b>Bar</b> — суммарный PnL за окно, {currency}</span>
        <span><b>WR</b> — % прибыльных в этом KZ</span>
        <span class="muted-legend">Killzones — рассчитываются по дате открытия в America/New_York с DST.</span>
      </div>
      <table class="kz-table">
        <thead>
          <tr>
            <th>Killzone</th>
            <th class="num">Сделок</th>
            <th class="num">WR</th>
            <th class="num">Net PnL</th>
            <th>График</th>
          </tr>
        </thead>
        <tbody>
          {#each byKZ as b}
            {@const wr = b.count ? (b.wins / b.count) * 100 : 0}
            {@const ratio = Math.abs(b.sum) / kzMax}
            <tr class:dim={b.count === 0}>
              <td><span class="kz-tag-cell" title={b.hint}>{b.label}</span></td>
              <td class="num">{b.count}</td>
              <td class="num">{b.count ? formatNumber(wr, 1) + '%' : '—'}</td>
              <td class="num {b.sum >= 0 ? 'profit' : 'loss'}">
                {b.count ? (b.sum >= 0 ? '+' : '') + formatNumber(b.sum, 2) : '—'}
              </td>
              <td class="kz-bar-cell">
                {#if b.count > 0}
                  <div class="kz-bar-track">
                    <div
                      class="kz-bar-fill {b.sum >= 0 ? 'pos' : 'neg'}"
                      style="width: {Math.max(2, ratio * 100)}%"
                    ></div>
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- PnL by Play (плейбуки) -->
  {#if byPlay.length > 0}
    <h3 class="stats-section-title">
      По сетапам (плейбукам)
      <span class="section-meta">
        Какой play твой кормилец, какой — слив. Profit Factor &lt; 1 → переписать или выкинуть.
      </span>
    </h3>
    <div class="axis-legend in-table">
      <span><b>Expectancy</b> — средний PnL на сделку этого сетапа</span>
      <span><b>PF</b> — Σ прибыли ÷ Σ убытков</span>
      <span class="muted-legend">Привязка через поле strategyId/playId сделки. Если в сделке нет связи — она не попадает в эту таблицу.</span>
    </div>
    <div class="tag-table-wrap">
      <table class="tag-table">
        <thead>
          <tr>
            <th>Стратегия</th>
            <th>Setup</th>
            <th class="num">Сделок</th>
            <th class="num">WR</th>
            <th class="num">Net PnL</th>
            <th class="num">Expectancy</th>
            <th class="num">PF</th>
          </tr>
        </thead>
        <tbody>
          {#each byPlay as p}
            <tr>
              <td><span class="strategy-cell">{p.meta.strategyName}</span></td>
              <td><span class="play-cell">{p.meta.playName}</span></td>
              <td class="num">{p.count}</td>
              <td class="num">{formatNumber(p.winRate, 1)}%</td>
              <td class="num {p.sum >= 0 ? 'profit' : 'loss'}">{formatNumber(p.sum, 2)}</td>
              <td class="num {p.expectancy >= 0 ? 'profit' : 'loss'}">{formatNumber(p.expectancy, 2)}</td>
              <td class="num">{Number.isFinite(p.profitFactor) ? formatNumber(p.profitFactor, 2) : '∞'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Aligned with HTF bias -->
  {#if (byBias.aligned.count + byBias.against.count) > 0}
    <h3 class="stats-section-title">
      Совпадение с HTF Bias
      <span class="section-meta">
        Если "против" зарабатывает столько же, как "по" — твой bias предсказательной силы не имеет.
      </span>
    </h3>
    <div class="bias-grid">
      {#each [['aligned', 'По bias', byBias.aligned], ['against', 'Против bias', byBias.against], ['unknown', 'Bias не задан', byBias.unknown]] as [k, lbl, b]}
        {@const wr = b.count ? (b.wins / b.count) * 100 : 0}
        <div class="bias-card {k}">
          <div class="bias-card-label">{lbl}</div>
          <div class="bias-card-row">
            <span>Сделок</span><strong>{b.count}</strong>
          </div>
          <div class="bias-card-row">
            <span>WR</span><strong>{b.count ? formatNumber(wr, 1) + '%' : '—'}</strong>
          </div>
          <div class="bias-card-row">
            <span>Net PnL</span>
            <strong class={b.sum >= 0 ? 'profit' : 'loss'}>
              {b.count ? (b.sum >= 0 ? '+' : '') + formatNumber(b.sum, 2) : '—'}
            </strong>
          </div>
        </div>
      {/each}
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
              <td><span class="tag-pill">{isIctTag(t.tag) ? prettyTag(t.tag) : t.tag}</span></td>
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
    color: var(--accent-fg);
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

  .calendar-hint {
    margin: -8px 20px 10px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .calendar-hint strong {
    color: var(--text);
    font-weight: 600;
  }

  .pnl-calendar-wrap {
    margin: 0 20px 20px;
    padding: 14px 14px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .pnl-cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .pnl-cal-title-block {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .pnl-cal-month {
    font-size: 1.15rem;
    font-weight: 700;
    text-transform: capitalize;
    color: var(--text-strong);
  }
  .pnl-cal-month-sum {
    font-size: 1.35rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .pnl-cal-nav {
    display: flex;
    gap: 6px;
  }
  .pnl-cal-nav-btn {
    width: 38px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-strong);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: background 120ms, border-color 120ms;
  }
  .pnl-cal-nav-btn:hover {
    background: var(--accent-bg);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .pnl-cal-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-x: auto;
  }
  .pnl-cal-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(72px, 1fr)) minmax(76px, 92px);
    gap: 3px;
    align-items: stretch;
  }
  .pnl-cal-row-head {
    min-height: auto;
  }
  .pnl-cal-hcell {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding: 6px 4px;
    text-align: center;
  }
  .pnl-cal-hcell-week {
    text-align: center;
  }

  .pnl-cal-cell {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 6px 6px;
    min-height: 112px;
    background: var(--bg);
    font-size: 10.5px;
    line-height: 1.35;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pnl-cal-cell-muted {
    opacity: 0.38;
    background: var(--bg-2);
    min-height: 72px;
  }
  .pnl-cal-cell-muted .pnl-cal-daynum {
    color: var(--text-muted);
  }
  .pnl-cal-cell-today {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .pnl-cal-daynum {
    font-weight: 700;
    font-size: 12px;
    color: var(--text-strong);
    margin-bottom: 2px;
  }
  .pnl-cal-pnl {
    font-weight: 800;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .pnl-cal-meta {
    font-size: 10px;
    color: var(--text-muted);
  }
  .pnl-cal-metric {
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .pnl-cal-empty {
    margin-top: auto;
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.75;
  }
  .pnl-cal-week-sum {
    min-height: 112px;
    justify-content: center;
    align-items: center;
    text-align: center;
    font-weight: 800;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    background: var(--bg-2);
  }
  .pnl-cal-week-sum .profit,
  .pnl-cal-week-sum .loss {
    font-size: 13px;
  }

  .pnl-cal-cell-clickable {
    cursor: pointer;
    transition: background 120ms, border-color 120ms, box-shadow 120ms;
  }
  .pnl-cal-cell-clickable:hover {
    background: var(--accent-bg);
    border-color: var(--accent-border);
    box-shadow: 0 0 0 1px var(--accent-border);
  }
  .pnl-cal-cell-clickable:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }

  :global(.modal.day-trades-modal) {
    max-width: min(460px, 96vw);
  }
  :global(.modal.day-trades-modal .modal-body) {
    padding: 12px 14px 14px;
  }
  :global(.modal.day-trades-modal .modal-footer) {
    padding: 8px 14px;
  }

  .day-modal-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    text-transform: capitalize;
    color: var(--text-strong);
  }
  .day-modal-tip {
    cursor: help;
  }
  .day-modal-net {
    font-size: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    margin-bottom: 10px;
  }
  .day-modal-net-sub {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .day-modal-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 10px;
    margin-bottom: 12px;
  }
  @media (max-width: 420px) {
    .day-modal-kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .day-modal-kpi {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
  }
  .day-modal-kpi-l {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .day-modal-kpi-v {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-strong);
  }
  .day-modal-warn {
    margin: 0 0 10px;
    font-size: 11.5px;
    color: var(--loss);
  }
  .day-modal-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: min(240px, 40vh);
    overflow-y: auto;
  }
  .day-modal-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .day-modal-table th,
  .day-modal-table td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .day-modal-table th {
    position: sticky;
    top: 0;
    background: var(--bg-2);
    font-weight: 600;
    color: var(--text-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    z-index: 1;
  }
  .day-modal-table td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .day-modal-table td.mono {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .day-modal-table td.pair {
    font-weight: 600;
    max-width: 88px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .day-modal-table td.dir {
    color: var(--text-muted);
    width: 1.5rem;
    text-align: center;
  }
  .day-modal-table td.setup {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
  }
  .day-modal-table tr.day-row-warn td {
    background: color-mix(in srgb, var(--loss) 6%, transparent);
  }
  .day-modal-table tbody tr:last-child td {
    border-bottom: 0;
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

  .line-real { stroke: var(--loss); }
  .line-disc { stroke: var(--profit); }
  .area-real {
    fill: color-mix(in srgb, var(--loss) 18%, transparent);
  }
  .area-disc {
    fill: color-mix(in srgb, var(--profit) 18%, transparent);
  }

  .dot-svg-real {
    fill: var(--loss);
    stroke: var(--bg);
    stroke-width: 2;
  }
  .dot-svg-disc {
    fill: var(--profit);
    stroke: var(--bg);
    stroke-width: 1.5;
  }

  .eq-key {
    display: inline-block;
    width: 14px;
    height: 3px;
    border-radius: 1px;
    margin: 0 4px 2px 2px;
    vertical-align: middle;
  }
  .eq-key-real { background: var(--loss); }
  .eq-key-disc { background: var(--profit); }

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
  .dot-real { background: var(--loss); }
  .dot-disc { background: var(--profit); }

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

  /* ---- KZ table ---- */
  .kz-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .kz-table th, .kz-table td {
    padding: 7px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .kz-table th {
    background: var(--bg-2);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .kz-table tr.dim { opacity: 0.4; }
  .kz-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .kz-tag-cell {
    display: inline-block;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    font-size: 11.5px;
    color: var(--text-strong);
  }
  .kz-bar-cell { width: 240px; }
  .kz-bar-track {
    width: 100%;
    height: 10px;
    background: var(--bg-3);
    border-radius: 5px;
    overflow: hidden;
  }
  .kz-bar-fill {
    height: 100%;
    transition: width 200ms ease;
  }
  .kz-bar-fill.pos { background: var(--profit); }
  .kz-bar-fill.neg { background: var(--loss); }

  .strategy-cell {
    font-size: 12px;
    color: var(--text-muted);
  }
  .play-cell {
    font-size: 12.5px;
    color: var(--text-strong);
    font-weight: 600;
  }

  /* ---- Bias grid ---- */
  .bias-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin: 0 20px 16px;
  }
  .bias-card {
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bias-card.aligned { border-left: 3px solid var(--profit); }
  .bias-card.against { border-left: 3px solid var(--loss); }
  .bias-card.unknown { border-left: 3px solid var(--text-muted); opacity: 0.85; }
  .bias-card-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    font-weight: 700;
  }
  .bias-card-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }
  .bias-card-row span { color: var(--text-muted); }
  .bias-card-row strong {
    font-variant-numeric: tabular-nums;
    color: var(--text-strong);
  }
</style>
