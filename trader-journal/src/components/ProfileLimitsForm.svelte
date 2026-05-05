<script>
  /** Тот же shape, что formData в ProfileModal. Только цели и заметки — правила в карточках выше. */
  export let formData = {};
</script>

<div class="profile-section">
  <div class="profile-section-title">Цели (Prop Plan)</div>
  <div class="form-group">
    <label for="rules-goal-mode">Формат целей</label>
    <select id="rules-goal-mode" bind:value={formData.goalMode}>
      <option value="percent">В процентах</option>
      <option value="amount">В сумме</option>
    </select>
  </div>
  <div class="goal-grid">
    <div class="form-group goal-day-block">
      <label for="rules-goal-day">Цель на день</label>
      <div class="goal-day-input-row">
        <input id="rules-goal-day" type="number" min="0" step="0.1" bind:value={formData.goalDayValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
      </div>
    </div>
    <div class="form-group">
      <label for="rules-goal-week">Цель на неделю</label>
      <input id="rules-goal-week" type="number" min="0" step="0.1" bind:value={formData.goalWeekValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
    <div class="form-group">
      <label for="rules-goal-month">Цель на месяц</label>
      <input id="rules-goal-month" type="number" min="0" step="0.1" bind:value={formData.goalMonthValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
    <div class="form-group">
      <label for="rules-goal-year">Цель на год</label>
      <input id="rules-goal-year" type="number" min="0" step="0.1" bind:value={formData.goalYearValue} placeholder={formData.goalMode === 'amount' ? formData.accountCurrency : '%'} />
    </div>
  </div>
  <p class="profile-limits-form-hint">Модалка «закрой день при цели» — галочка в карточке «Напоминание закрыть день при цели дня» выше.</p>
</div>

<div class="profile-section">
  <div class="profile-section-title">Заметки к профилю</div>
  <div class="form-group profile-notes-wrap">
    <p class="profile-limits-form-hint">
      Включение чек-листа по строкам заметок — в карточке «Чек-лист из заметок профиля».
    </p>
    <label for="rules-profile-notes">Текст</label>
    <textarea id="rules-profile-notes" rows="3" bind:value={formData.notes} placeholder="Правила, ограничения, checklist перед входом"></textarea>
  </div>
</div>

<style>
  .profile-limits-form-hint {
    margin: 0 0 10px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .goal-day-block .goal-day-input-row {
    margin-bottom: 8px;
  }
  .profile-notes-wrap {
    margin-bottom: 0;
  }
</style>
