<script>
  import { userProfile } from '../lib/stores';
  import { sanitizeProfileGateRulesInput } from '../lib/profileGateRulesNormalize.js';

  /** Как условия play в PlaybookView: список и мутации идут из стора профиля. */
  $: gateRules = sanitizeProfileGateRulesInput($userProfile?.profileGateRules ?? []);

  function addRule() {
    userProfile.addProfileGateRule({ label: 'Новое правило', required: false });
  }

  /** @param {Partial<{label:string,required:boolean}>} patch */
  function updateRule(ruleId, patch) {
    userProfile.updateProfileGateRule(ruleId, patch);
  }

  /** @param {string} ruleId */
  function deleteRule(ruleId) {
    userProfile.deleteProfileGateRule(ruleId);
  }
</script>

<div class="profile-section profile-own-rules">
  <div class="profile-section-title">Свои правила</div>
  <div class="form-group profile-own-rules-fields">
    <p class="profile-own-rules-hint">
      Изменения сразу пишутся в профиль счёта.
      «Чек-лист «Свои правила»» ниже по странице.
    </p>
    <div class="rules-block">
      <div class="rules-title">
        Preconditions (до входа)
        <button type="button" class="btn btn-sm" on:click={addRule}>+ правило</button>
      </div>
      {#if gateRules.length === 0}
        <div class="rules-empty">
          Пусто — добавь хотя бы одно правило или оставь пустым список и полагайся на лимиты в карточках.
        </div>
      {/if}
      {#each gateRules as r (r.id)}
        <div class="rule-row">
          <input
            type="text"
            value={r.label}
            on:change={(e) => updateRule(r.id, { label: e.target.value })}
          />
          <label class="rule-req">
            <input
              type="checkbox"
              checked={!!r.required}
              on:change={(e) => updateRule(r.id, { required: e.currentTarget.checked })}
            />
            required
          </label>
          <button type="button" class="btn btn-sm btn-danger" title="Удалить" on:click={() => deleteRule(r.id)}
            >×</button
          >
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .profile-own-rules {
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }
  .profile-own-rules-hint {
    margin: 0 0 10px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .rules-block {
    margin-top: 4px;
  }
  .rules-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 6px;
  }
  .rules-empty {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .rule-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }
  .rule-row input[type='text'] {
    flex: 1;
    padding: 4px 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
    font-size: 12.5px;
  }
  .rule-req {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
</style>
