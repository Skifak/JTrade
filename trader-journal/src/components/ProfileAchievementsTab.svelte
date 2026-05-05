<script>
  import { achievementProgress, buildAchievementCards, buildJournalMetrics } from '../lib/achievements';
  import { trades, userProfile } from '../lib/stores';
  import { dayJournal } from '../lib/dayJournal';
  import { fxRate, tradeProfitDisplayUnits } from '../lib/fxRate';

  $: profitOf = (t) => tradeProfitDisplayUnits(t, $fxRate);
  $: metrics = buildJournalMetrics($trades, [], $dayJournal, $userProfile, profitOf);
  $: cards = buildAchievementCards($achievementProgress, metrics);
</script>

<div class="ach-tab">
  <header class="ach-head">
    <h3 class="ach-title">Достижения</h3>
    <p class="ach-sub">
      Всё считается из журнала: закрытые сделки, дневник, метрика дисциплины и цели из профиля. Счётчик «получено повторно» —
      сколько раз сработало условие достижения.
    </p>
  </header>

  <div class="ach-grid">
    {#each cards as c (c.id)}
      <article class="ach-card">
        <div class="ach-card-head">
          <h4 class="ach-card-title">{c.title}</h4>
          <span
            class="ach-win-label"
            class:ach-win-label--pending={c.wins === 0}
            aria-label={c.wins > 0 ? 'Достижение получено' : 'Ещё не получено'}
          >Win</span>
        </div>
        <p class="ach-card-body">{c.body}</p>
        <div class="ach-card-tail">
          <div class="ach-meta">
            <span class="ach-progress-label">{c.progressLabel}</span>
          </div>
          <div class="ach-bar" role="img" aria-label="Прогресс по шагам">
            {#each c.segments as on, i (i)}
              <span class="ach-seg" class:ach-seg--on={on}></span>
            {/each}
          </div>
          <div class="ach-repeat-kicker">
            Получено повторно:
            <span class="ach-repeat-num">#{c.wins}</span>
          </div>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  .ach-tab {
    padding-bottom: 16px;
  }
  .ach-head {
    margin-bottom: 18px;
  }
  .ach-title {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--text-strong);
  }
  .ach-sub {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-muted);
    max-width: 52rem;
  }
  .ach-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
  .ach-card {
    border-radius: 12px;
    padding: 12px 14px 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--accent) 8%, var(--bg-2)),
      var(--bg-2) 52%,
      var(--bg)
    );
    box-shadow: 0 8px 26px color-mix(in srgb, var(--text) 6%, transparent);
    min-height: 168px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .ach-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .ach-card-title {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 800;
    color: var(--text-strong);
    line-height: 1.3;
  }
  .ach-win-label {
    flex-shrink: 0;
    align-self: flex-start;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--success, #22c55e) 92%, var(--text-strong));
    background: color-mix(in srgb, var(--success, #22c55e) 14%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--success, #22c55e) 35%, var(--border));
  }
  .ach-win-label--pending {
    color: var(--text-muted);
    background: color-mix(in srgb, var(--text) 6%, var(--bg-2));
    border-color: color-mix(in srgb, var(--text) 12%, var(--border));
    opacity: 0.75;
  }
  .ach-card-body {
    margin: 0 0 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text);
    opacity: 0.95;
    flex: 0 1 auto;
  }
  .ach-card-tail {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  }
  .ach-meta {
    margin-bottom: 8px;
  }
  .ach-progress-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .ach-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: stretch;
    margin-bottom: 10px;
  }
  .ach-repeat-kicker {
    margin: 0;
    padding: 0;
    border: none;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--text-muted);
  }
  .ach-repeat-num {
    margin-left: 6px;
    font-size: 13px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    color: var(--text-strong);
  }
  .ach-seg {
    flex: 1 1 0;
    min-width: 6px;
    height: 7px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text) 12%, var(--border));
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
  }
  .ach-seg--on {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 70%, var(--bg)),
      color-mix(in srgb, var(--accent) 40%, var(--bg))
    );
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
</style>
