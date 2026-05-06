<script>
  import { trades, userProfile } from '../lib/stores';
  import { formatNumber, calculateStats } from '../lib/utils';
  import { fxRate, tradeProfitDisplayUnits, decimalsFor } from '../lib/fxRate';
  import {
    computeMaxRiskAmount,
    computeMaxDailyLossAmount,
    computeMaxWeeklyLossAmount,
    computeDailyProfitLockAmount,
    getCurrentRiskScale,
    getOpenRisk
  } from '../lib/risk';
  import {
    LOSS_STREAK_POSTER_50_ROWS,
    LOSS_STREAK_POSTER_50_STREAK_KEYS
  } from '../lib/traderReferenceStreakPoster50';

  const STREAK_LENGTHS = LOSS_STREAK_POSTER_50_STREAK_KEYS;

  /** Шаг 5% как на референс-постере. */
  const WIN_RATE_ROWS = (() => {
    const r = [];
    for (let p = 5; p <= 95; p += 5) r.push(p / 100);
    return r;
  })();

  const streakTable = LOSS_STREAK_POSTER_50_ROWS;

  $: profile = $userProfile;
  $: currency = profile?.accountCurrency || 'USD';
  $: amtDec = decimalsFor(currency);
  $: closedTrades = ($trades || []).filter((t) => t?.status === 'closed');
  $: openTrades = ($trades || []).filter((t) => t?.status === 'open');
  $: initialCapital = Number(profile?.initialCapital) || 0;

  $: journalStats =
    closedTrades.length > 0
      ? calculateStats(closedTrades, {
          initialCapital,
          profitOf: (t) => tradeProfitDisplayUnits(t, $fxRate)
        })
      : null;

  $: riskBasisLabel = profile
    ? profile.riskMode === 'amount'
      ? `${formatNumber(Number(profile.riskPerTradeAmount) || 0, amtDec)} ${currency}`
      : `${formatNumber(Number(profile.riskPerTradePercent) || 0, 2)}% капитала`
    : '—';

  $: dailyStopBasis = profile
    ? profile.dailyLossLimitMode === 'amount'
      ? `${formatNumber(Number(profile.dailyLossLimitAmount) || 0, amtDec)} ${currency}`
      : `${formatNumber(Number(profile.dailyLossLimitPercent) || 0, 2)}%`
    : '—';

  $: weeklyBasis = profile
    ? profile.weeklyLossLimitEnabled === false
      ? 'выкл.'
      : profile.weeklyLossLimitMode === 'amount'
        ? `${formatNumber(Number(profile.weeklyLossLimitAmount) || 0, amtDec)} ${currency}`
        : `${formatNumber(Number(profile.weeklyLossLimitPercent) || 0, 2)}%`
    : '—';

  $: profitCapBasis = profile
    ? profile.dailyProfitLockEnabled === false
      ? 'выкл.'
      : profile.dailyProfitLockMode === 'amount'
        ? `${formatNumber(Number(profile.dailyProfitLockAmount) || 0, amtDec)} ${currency}`
        : `${formatNumber(Number(profile.dailyProfitLockPercent) || 0, 2)}%`
    : '—';

  $: maxRiskPerTrade = computeMaxRiskAmount(profile);
  $: riskScale = getCurrentRiskScale(closedTrades, profile);
  $: effectiveRiskCap = maxRiskPerTrade > 0 ? maxRiskPerTrade * riskScale : 0;

  $: maxOpen = Math.max(0, Math.floor(Number(profile?.maxOpenTrades) || 0));
  $: exposureBudget = effectiveRiskCap > 0 && maxOpen > 0 ? effectiveRiskCap * maxOpen : null;

  $: dailyStopMoney = computeMaxDailyLossAmount(profile);
  $: weeklyStopMoney =
    profile && profile.weeklyLossLimitEnabled !== false ? computeMaxWeeklyLossAmount(profile) : 0;
  $: profitCapMoney =
    profile && profile.dailyProfitLockEnabled !== false ? computeDailyProfitLockAmount(profile) : 0;

  $: openRiskAgg = getOpenRisk(openTrades, profile);

  $: kellyFractionFull = journalStats?.losingCount && journalStats.avgLoss > 0
    ? (() => {
        const p = journalStats.winRate / 100;
        const q = 1 - p;
        const b = journalStats.avgProfit / journalStats.avgLoss;
        if (b <= 0) return null;
        return (p * b - q) / b;
      })()
    : null;

  /** Как на постере: зелёный при P ≥ 50%, красный ниже. */
  function pctCellBg(pct) {
    if (pct >= 50) {
      const t = (pct - 50) / 50;
      const light = 44 - t * 7;
      return `hsla(118, 58%, ${light}%, 0.85)`;
    }
    const t = pct / 50;
    const light = 40 + t * 8;
    return `hsla(0, 55%, ${light}%, 0.85)`;
  }

  /** payoff b = средний выигрыш / средний убыток (модулируемый столбцы справочника). */
  const BREAK_EVEN_PAYOFFS = (() => {
    const xs = [];
    for (let b = 0.5; b <= 4.01; b += 0.25) xs.push(Number(b.toFixed(2)));
    return xs;
  })();

  /** Популярная трактовка SQN (Van Tharp и др.). Пороги считаются вкл.: SQN ∈ (−∞ … first], затем столбцы. */
  const SQN_UPPER = [1.6, 2.79, 3.99, 5.99, 9.99];

  /** На одну строку больше, чем порогов: последняя — выше последнего порога. */
  const SQN_BANDS = [
    { label: 'Система сомнительна — пересмотр edge и выборки (SQN до 1,6)' },
    { label: 'Слабая / много шума' },
    { label: 'Ниже среднего, но может быть рабочей' },
    { label: 'Средняя — разумный минимум для «живой» системы' },
    { label: 'Сильная по выборке' },
    { label: 'Очень высокая — проверь переобучение и смену режима рынка' }
  ];

  /** Строка теплокарты, ближайшая к винрейту журнала; столбец k ≈ max серии убытков (2…11). */
  $: heatYouActive = !!(journalStats && journalStats.totalTrades > 0);

  $: heatYouRi = heatYouActive
    ? WIN_RATE_ROWS.reduce((bestIdx, w, idx, arr) => {
        const wr = journalStats.winRate / 100;
        return Math.abs(w - wr) < Math.abs(arr[bestIdx] - wr) ? idx : bestIdx;
      }, 0)
    : -1;

  $: heatYouCi = (() => {
    if (!heatYouActive) return -1;
    let m = Math.floor(Number(journalStats.maxConsecutiveLosses) || 0);
    const Lpick = Math.min(11, Math.max(2, m));
    return STREAK_LENGTHS.indexOf(Lpick);
  })();

  $: journalSqn =
    journalStats &&
    journalStats.totalTrades > 2 &&
    Number.isFinite(journalStats.sharpeRatio) &&
    journalStats.sharpeRatio !== 0
      ? Math.sqrt(journalStats.totalTrades) * journalStats.sharpeRatio
      : null;

  $: journalPayoffB =
    journalStats?.losingCount && journalStats.avgLoss > 0 && journalStats.avgProfit > 0
      ? journalStats.avgProfit / journalStats.avgLoss
      : null;

  /** Ближайшая строка к b из журнала (одна ячейка). */
  $: closestPayoffBi =
    journalPayoffB == null
      ? -1
      : BREAK_EVEN_PAYOFFS.reduce((bestIdx, b, idx, arr) => {
          const cd = Math.abs(b - journalPayoffB);
          const pd = Math.abs(arr[bestIdx] - journalPayoffB);
          return cd < pd ? idx : bestIdx;
        }, 0);

  /** Индекс интервала: первый j с SQN ≤ SQN_UPPER[j], иначе последняя строка. */
  $: journalSqnBandIdx =
    journalSqn == null
      ? -1
      : (() => {
          const j = SQN_UPPER.findIndex((t) => journalSqn <= t + 1e-9);
          return j === -1 ? SQN_BANDS.length - 1 : j;
        })();
</script>

<div class="trader-ref">
  <header class="trader-ref__head">
    <h2 class="trader-ref__title">Справочник трейдера</h2>
    <p class="trader-ref__lede">
      Сводка лимитов из профиля, журнала и справочных таблиц. Теплокарта — референс-постер:
      вероятность встретить серию убытков в периоде из <strong>50</strong> сделок (значения как на оригинале).
      Ниже — безубыток vs payoff и шкала SQN.
    </p>
  </header>

  <section class="trader-ref__section">
    <h3 class="trader-ref__h">Аллокация риска (из профиля)</h3>
    <div class="trader-ref__scroll">
      <table class="ref-table">
        <tbody>
          <tr>
            <th scope="row">Капитал (профиль)</th>
            <td>{formatNumber(initialCapital, amtDec)} {currency}</td>
          </tr>
          <tr>
            <th scope="row">Риск на сделку (правило)</th>
            <td>{riskBasisLabel}</td>
          </tr>
          <tr>
            <th scope="row">Anti-martingale множитель</th>
            <td>×{formatNumber(Number(riskScale) || 1, 4)}</td>
          </tr>
          <tr>
            <th scope="row">Эффективный лимит одной ставки до SL</th>
            <td>
              {#if effectiveRiskCap > 0}
                −{formatNumber(effectiveRiskCap, amtDec)} {currency}
              {:else}
                не задан
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Макс. позиций (профиль)</th>
            <td>{maxOpen > 0 ? maxOpen : '—'}</td>
          </tr>
          <tr>
            <th scope="row">Бюджет Σ (лимит × позиции)</th>
            <td>
              {#if exposureBudget != null && exposureBudget > 0}
                −{formatNumber(exposureBudget, amtDec)} {currency}
              {:else}
                задай две величины выше и SL в сделках
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Сейчас Σ риска по открытым (по SL)</th>
            <td>
              {formatNumber(Number(openRiskAgg.totalRisk) || 0, amtDec)}
              {currency}
              {#if openRiskAgg.withoutSlCount > 0}
                <span class="trader-ref__muted">(+{openRiskAgg.withoutSlCount} без SL)</span>
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Дневной стоп (действует при убытке)</th>
            <td>
              {#if dailyStopMoney > 0}
                −{formatNumber(dailyStopMoney, amtDec)} ({dailyStopBasis})
              {:else}
                не задан ({dailyStopBasis})
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Недельный стоп</th>
            <td>
              {#if weeklyStopMoney > 0}
                −{formatNumber(weeklyStopMoney, amtDec)} ({weeklyBasis})
              {:else}
                {weeklyBasis}
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Потолок дневной прибыли</th>
            <td>
              {#if profitCapMoney > 0}
                +{formatNumber(profitCapMoney, amtDec)} ({profitCapBasis})
              {:else}
                {profitCapBasis}
              {/if}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="trader-ref__section">
    <h3 class="trader-ref__h">Математическое ожидание по журналу</h3>
    {#if !journalStats}
      <p class="trader-ref__muted">Нет закрытых сделок — после появления выборки здесь же появятся числа.</p>
    {:else}
      <div class="trader-ref__scroll">
        <table class="ref-table">
          <tbody>
            <tr>
              <th scope="row">Выборка</th>
              <td>{journalStats.totalTrades} закрытых</td>
            </tr>
            <tr>
              <th scope="row">Винрейт</th>
              <td>{formatNumber(journalStats.winRate, 2)}%</td>
            </tr>
            <tr>
              <th scope="row">Средний плюс / средний минус</th>
              <td>
                {formatNumber(journalStats.avgProfit, amtDec)} /
                −{formatNumber(journalStats.avgLoss, amtDec)}
                {currency}
              </td>
            </tr>
            <tr>
              <th scope="row">Ожидание прибыли на сделку (E)</th>
              <td class:journal-stats--neg={journalStats.expectancy < 0}>
                {formatNumber(journalStats.expectancy, amtDec)} {currency}
              </td>
            </tr>
            <tr>
              <th scope="row">Profit factor</th>
              <td>{journalStats.profitFactor === Infinity ? '∞' : formatNumber(journalStats.profitFactor, 3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="trader-ref__note trader-ref__note--narrow">
        <strong>Разложение через винрейт:</strong> E ≈ WR·AvgWin − (1−WR)·AvgLoss при независимых средних победителя и
        минус-сделках; твои фактические суммы уже с учётом курсового отображения, как во вкладке «Статистика» при таком же
        способе пересчёта PnL.
      </div>
      <div class="trader-ref__note">
        {#if kellyFractionFull == null}
          Kelly (полное): недоступно без убыточных сделок и положительного b = AvgWin/AvgLoss.
        {:else if kellyFractionFull <= 0}
          Полная доля Kelly: ≤ 0 для текущей выборки (edge не поддерживается формулой p·b − q при этих средних).
        {:else}
          Полная доля Kelly f*=(p·b−q)/b при b=AvgWin/AvgLoss —
          <strong>~{formatNumber(100 * kellyFractionFull, 2)}%</strong>
          депозита; на практике используют дробь (¼–½ Kelly) и сверяют с лимитом риска по SL в профиле.
        {/if}
      </div>
    {/if}
  </section>

  <section class="trader-ref__section">
    <h3 class="trader-ref__h">Минимальный винрейт для безубытка</h3>
    <p class="trader-ref__muted">
      При фиксированном среднем отношении выигрыш:убыток <strong>b = AvgWin / AvgLoss</strong> (одинаковые размеры позиций и
      идентичное распределение — учебная модель) безубыток при винрейте <strong>WR ≥ 1/(1+b)</strong>. Ниже — справочные
      значения; у реальной выборки b и WR плавают.
    </p>
    <div class="trader-ref__scroll">
      <table class="ref-table">
        <thead>
          <tr>
            <th scope="col">AvgWin / AvgLoss (b)</th>
            <th scope="col">Мин. WR безубытка, %</th>
          </tr>
        </thead>
        <tbody>
          {#each BREAK_EVEN_PAYOFFS as b, bi}
            <tr class:ref-table__row-you={closestPayoffBi === bi && journalPayoffB != null}>
              <td>
                {formatNumber(b, 2)}:1{#if closestPayoffBi === bi && journalPayoffB != null}
                  <span class="trader-ref__tag">журнал → {formatNumber(journalPayoffB, 3)}:1</span>
                {/if}
              </td>
              <td>{formatNumber(100 / (1 + b), 2)}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if journalPayoffB != null}
      <p class="trader-ref__note">
        Подсвечена строка, ближайшая к <strong>{formatNumber(journalPayoffB, 3)}:1</strong> (AvgWin / AvgLoss по журналу).
      </p>
    {/if}
  </section>

  <section class="trader-ref__section">
    <h3 class="trader-ref__h">SQN — «качество» выборки (Van Tharp et al.)</h3>
    <p class="trader-ref__muted">
      Оценочно: <strong>SQN ≈ √N · Sharpe<sub>сделок</sub></strong> (как на вкладке «Статистика»: среднее чистого PnL / σ по сделкам). Интерпретация ступеней — типичная трактовка из изданий Van Tharp и трейдерских обзоров, не жёсткая норма.
    </p>
    <div class="trader-ref__scroll">
      <table class="ref-table">
        <thead>
          <tr>
            <th scope="col">Порог интервала</th>
            <th scope="col">Справочная оценка</th>
          </tr>
        </thead>
        <tbody>
          {#each SQN_BANDS as band, bi}
            <tr class:ref-table__row-you={journalSqnBandIdx === bi}>
              <td class="sqn-interval">
                {#if bi === 0}
                  ≤ {formatNumber(SQN_UPPER[0], 2)}
                {:else if bi < SQN_UPPER.length}
                  <span title="Строго: больше {formatNumber(SQN_UPPER[bi - 1], 2)}">
                    до {formatNumber(SQN_UPPER[bi], 2)} вкл.
                  </span>
                {:else}
                  свыше {formatNumber(SQN_UPPER[SQN_UPPER.length - 1], 2)}
                {/if}
              </td>
              <td>{band.label}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if journalSqn != null}
      <p class="trader-ref__note">
        По журналу: <strong>SQN ≈ {formatNumber(journalSqn, 2)}</strong> ({journalStats.totalTrades} сделок) — строка её
        диапазона подсвечена.
      </p>
    {/if}
  </section>

  <section class="trader-ref__section">
    <h3 class="trader-ref__h">Вероятность серии убытков (50 сделок)</h3>
    <p class="trader-ref__muted">
      Таблица с референс-постера: для каждого винрейта — вероятность получить серию убытков длиной не меньше
      <em>k</em> (столбцы ≥2…≥11) в серии из 50 сделок. Подсветка: зелёный при P ≥ 50%, красный при P &lt; 50%.
    </p>
    {#if heatYouActive && heatYouRi >= 0 && heatYouCi >= 0}
      <p class="trader-ref__muted trader-ref__muted--tight">
        <strong>Обводка «ты»:</strong> строка с винрейтом
        {Math.round(WIN_RATE_ROWS[heatYouRi] * 100)}% (ближайшая к {formatNumber(journalStats.winRate, 2)}% по журналу) и
        столбец «≥{STREAK_LENGTHS[heatYouCi]}» (макс. зафиксированная серия убытков
        {journalStats.maxConsecutiveLosses} подряд → кламп 2…11).
      </p>
    {/if}
    <div class="trader-ref__scroll trader-ref__scroll--wide">
      <table class="ref-table ref-table--heat">
        <thead>
          <tr>
            <th class="ref-table__corner">Винрейт</th>
            {#each STREAK_LENGTHS as L, ci}
              <th
                class:ref-table__col-you={heatYouActive && heatYouCi >= 0 && ci === heatYouCi}
                title="Длина серии убытков ≥ {L}">≥{L}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each WIN_RATE_ROWS as wr, ri}
            <tr>
              <th
                scope="row"
                class:ref-table__row-you-side={heatYouActive && ri === heatYouRi}
              >{Math.round(wr * 100)}%</th>
              {#each streakTable[ri] as pct, ci}
                <td
                  class="ref-table__cell"
                  class:ref-table__cell--you={heatYouActive &&
                    ri === heatYouRi &&
                    heatYouCi >= 0 &&
                    ci === heatYouCi}
                  style:background={pctCellBg(pct)}
                  title="WR {Math.round(wr * 100)}%, k={STREAK_LENGTHS[ci]}"
                >
                  {formatNumber(pct, 1)}%
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  .trader-ref {
    padding: 12px 8px 24px;
    max-width: 1100px;
    margin: 0 auto;
    box-sizing: border-box;
  }
  .trader-ref__head {
    margin-bottom: 18px;
  }
  .trader-ref__title {
    margin: 0 0 8px;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  .trader-ref__lede {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .trader-ref__section {
    margin-bottom: 22px;
  }
  .trader-ref__h {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-strong);
  }
  .trader-ref__muted {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0 0 10px;
  }
  .trader-ref__muted--tight {
    margin-bottom: 8px;
  }
  .trader-ref__tag {
    display: inline-block;
    margin-left: 6px;
    font-size: 10px;
    font-weight: 600;
    color: color-mix(in srgb, var(--accent) 75%, var(--text-muted));
  }
  .trader-ref__note {
    margin-top: 10px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .trader-ref__note--narrow {
    max-width: 52rem;
  }
  .trader-ref__scroll {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .trader-ref__scroll--wide {
    max-height: min(70vh, 720px);
    overflow: auto;
  }
  .ref-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .ref-table th,
  .ref-table td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .ref-table tbody th {
    font-weight: 600;
    color: var(--text-strong);
    white-space: nowrap;
    width: 40%;
  }
  .ref-table tbody tr:last-child th,
  .ref-table tbody tr:last-child td {
    border-bottom: none;
  }
  .ref-table--heat thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg-2);
    color: var(--text-strong);
    font-size: 10.5px;
    text-align: center;
    white-space: nowrap;
  }
  .ref-table__corner {
    position: sticky;
    left: 0;
    z-index: 3;
    text-align: left;
  }
  .ref-table--heat tbody th {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--bg-2);
    width: 3.5rem;
    text-align: right;
    padding-right: 8px;
  }
  .ref-table__cell {
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--text-strong);
    font-size: 10.5px;
    min-width: 3.1rem;
  }
  .journal-stats--neg {
    color: var(--loss);
    font-weight: 600;
  }
  .ref-table tbody tr.ref-table__row-you > th,
  .ref-table tbody tr.ref-table__row-you > td {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 72%, var(--border));
    border-radius: 4px;
  }
  .ref-table--heat thead th.ref-table__col-you {
    box-shadow:
      inset 0 -3px 0 0 color-mix(in srgb, var(--accent) 82%, transparent),
      inset 0 3px 0 0 color-mix(in srgb, var(--accent) 55%, transparent);
    color: var(--accent);
    z-index: 4;
  }
  .ref-table--heat tbody th.ref-table__row-you-side {
    box-shadow:
      inset 3px 0 0 0 color-mix(in srgb, var(--accent) 78%, transparent),
      inset -1px 0 0 color-mix(in srgb, var(--accent) 35%, transparent);
    background-color: color-mix(in srgb, var(--accent) 14%, var(--bg-2));
  }
  .ref-table__cell.ref-table__cell--you {
    position: relative;
    z-index: 2;
    box-shadow:
      inset 0 0 0 3px color-mix(in srgb, var(--accent) 88%, white),
      0 0 10px color-mix(in srgb, var(--accent) 28%, transparent);
  }
  .sqn-interval {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
