<script>
  import JournalSourceHint from './JournalSourceHint.svelte';
  import {
    PROFILE_RULE_ENTRIES,
    getProfileRuleLayerLabel,
    getProfileRuleLevelLabel
  } from '../lib/profileRulesRegistry';

  /** Профиль / форма — тот же shape, что в ProfileModal */
  export let formData = {};

  /** Список правил (по умолчанию все) */
  export let entries = PROFILE_RULE_ENTRIES;

  export let shellTitle = 'Твои правила в приложении';
  export let shellLede =
    'Только то, что реально влияет на HUD, окна и сохранение сделки. Условия виджетов аналитики здесь не перечислены.';

  /** После карточки с этим индексом (0-based) — раздел подгрупп; −1 не показывать. */
  export let dividerAfterIndex = -1;

  let expandedIds = new Set();

  /** @param {string} id */
  function toggle(id) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedIds = next;
  }
</script>

<div class="profile-rules-shell">
  <div class="profile-rules-shell-head">
    <h3 class="profile-rules-shell-title">{shellTitle}</h3>
    <p class="profile-rules-shell-lede">
      {shellLede}
    </p>
  </div>
  <div class="profile-rules-list">
    {#each entries as entry, i (entry.id)}
      <article class="profile-rule-card">
        <div class="profile-rule-top">
          <div class="profile-rule-titles">
            <span class="profile-rule-name">{entry.title}</span>
            <div class="profile-rule-badges">
              <span class="profile-rule-badge profile-rule-badge--layer">{getProfileRuleLayerLabel(entry.layer)}</span>
              <span
                class="profile-rule-badge"
                class:profile-rule-badge--block={entry.level === 'block'}
                class:profile-rule-badge--warn={entry.level === 'warn'}
                class:profile-rule-badge--info={entry.level === 'info'}
              >{getProfileRuleLevelLabel(entry.level)}</span>
              {#if entry.sourceIds?.length}
                <JournalSourceHint sourceIds={entry.sourceIds} />
              {/if}
            </div>
          </div>
          <button
            type="button"
            class="btn btn-sm profile-rule-more-btn"
            aria-expanded={expandedIds.has(entry.id)}
            on:click={() => toggle(entry.id)}
          >
            {expandedIds.has(entry.id) ? 'Свернуть' : 'Подробнее'}
          </button>
        </div>
        <p class="profile-rule-summary">{entry.summary(formData)}</p>
        {#if expandedIds.has(entry.id)}
          <div class="profile-rule-body">
            {#each entry.paragraphs as para}
              <p>{para}</p>
            {/each}
            {#if entry.sourceUrl}
              <a
                class="profile-rule-source-link"
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer">Оригинал поста</a>
            {/if}
          </div>
        {/if}
      </article>
      {#if dividerAfterIndex >= 0 && i === dividerAfterIndex}
        <div class="profile-rules-mid-divider" role="separator">
          <span class="profile-rules-mid-divider-line" aria-hidden="true"></span>
          <span class="profile-rules-mid-divider-label">Дальше — лимиты из профиля (числа в форме ниже)</span>
          <span class="profile-rules-mid-divider-line" aria-hidden="true"></span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .profile-rules-shell {
    margin: 12px 0 14px;
    padding: 14px 14px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, var(--bg-2));
    box-sizing: border-box;
  }
  .profile-rules-shell-head {
    margin-bottom: 12px;
  }
  .profile-rules-shell-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-strong);
  }
  .profile-rules-shell-lede {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .profile-rules-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .profile-rules-mid-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 2px 0;
  }
  .profile-rules-mid-divider-line {
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--accent) 22%, var(--border));
    min-width: 12px;
  }
  .profile-rules-mid-divider-label {
    flex-shrink: 0;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    max-width: 70%;
    text-align: center;
    line-height: 1.3;
  }
  .profile-rule-card {
    padding: 10px 11px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .profile-rule-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .profile-rule-titles {
    min-width: 0;
    flex: 1;
  }
  .profile-rule-name {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-strong);
    line-height: 1.35;
  }
  .profile-rule-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .profile-rule-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 3px 7px;
    border-radius: 5px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--bg-2);
  }
  .profile-rule-badge--layer {
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  }
  .profile-rule-badge--block {
    border-color: color-mix(in srgb, var(--loss) 45%, var(--border));
    color: var(--loss);
    background: color-mix(in srgb, var(--loss) 10%, var(--bg));
  }
  .profile-rule-badge--warn {
    border-color: color-mix(in srgb, var(--warning) 50%, var(--border));
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 10%, var(--bg));
  }
  .profile-rule-badge--info {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
    color: var(--text-muted);
  }
  .profile-rule-more-btn {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 11px;
  }
  .profile-rule-summary {
    margin: 8px 0 0;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .profile-rule-body {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.48;
    color: var(--text);
  }
  .profile-rule-body p {
    margin: 0 0 8px;
  }
  .profile-rule-body p:last-of-type {
    margin-bottom: 0;
  }
  .profile-rule-source-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .profile-rule-source-link:hover {
    color: color-mix(in srgb, var(--accent) 75%, var(--text-strong));
  }
</style>
