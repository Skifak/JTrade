<script>
  /** Тот же shape, что formData в ProfileModal — только блок «Свои правила». */
  export let formData = {};
</script>

<div class="profile-section profile-own-rules">
  <div class="profile-section-title">Свои правила</div>
  <div class="form-group profile-notes-wrap">
    <p class="profile-own-rules-hint">
      Включение чек-листа по строкам — в карточке «Чек-лист из заметок профиля» в списке правил ниже.
    </p>
    <label for="rules-profile-notes-own">Текст</label>
    <textarea
      id="rules-profile-notes-own"
      rows="4"
      bind:value={formData.notes}
      placeholder="Правила, ограничения, checklist перед входом — одна строка = один пункт чек-листа"
    ></textarea>
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
  .profile-notes-wrap {
    margin-bottom: 0;
  }
</style>
