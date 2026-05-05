/**
 * Подшаги тура внутри модалки профиля: вкладка, фокус, тексты.
 * @typedef {{ tab: string, focusSelector: string | null, resolveFocus?: (formData: Record<string, unknown>) => string | null, title: string, hint: string, validate?: (formData: Record<string, unknown>) => boolean, isSavePrompt?: boolean }} ProfileTourSubstep
 */

/**
 * Короткие заголовки подшагов для экрана «Прогресс обучения».
 * @param {{ hideBasicsSection: boolean, currencySelectableInProfile: boolean }} ctx
 * @returns {string[]}
 */
export function listProfileTourSubstepTitles(ctx) {
  return getProfileTourSubsteps(ctx).map((s) => s.title);
}

/**
 * @param {{ hideBasicsSection: boolean, currencySelectableInProfile: boolean }} ctx
 * @returns {ProfileTourSubstep[]}
 */
export function getProfileTourSubsteps(ctx) {
  const { hideBasicsSection, currencySelectableInProfile } = ctx;
  /** @type {ProfileTourSubstep[]} */
  const steps = [];

  if (!hideBasicsSection) {
    steps.push({
      tab: 'setup',
      focusSelector: '#trader-name',
      title: 'Имя',
      hint: 'Подпись в журнале (можно оставить пустым). Enter или «Далее по полю» — следующий подшаг.'
    });
    if (currencySelectableInProfile) {
      steps.push({
        tab: 'setup',
        focusSelector: '#account-currency',
        title: 'Валюта счёта',
        hint: 'Все суммы и лимиты ниже считаются в этой валюте. Enter / «Далее по полю».'
      });
    }
    steps.push({
      tab: 'setup',
      focusSelector: '#initial-capital',
      title: 'Стартовый капитал',
      hint: 'База для процентов риска, дневного стопа и целей. Enter / «Далее по полю».',
      validate: (fd) => Number.isFinite(Number(fd.initialCapital)) && Number(fd.initialCapital) >= 0
    });
  }

  steps.push(
    {
      tab: 'rules',
      focusSelector: '#pcf-daily-loss-mode',
      title: 'Дневной стоп: формат',
      hint: 'Процент от капитала или фиксированная сумма. Затем введи значение на следующем подшаге.'
    },
    {
      tab: 'rules',
      focusSelector: null,
      resolveFocus: (fd) =>
        fd.dailyLossLimitMode === 'amount' ? '#pcf-daily-loss-amt' : '#pcf-daily-loss-pct',
      title: 'Дневной стоп: значение',
      hint: 'Порог убытка за день — от него зависят гейты журнала. Enter / «Далее по полю».',
      validate: (fd) => {
        if (fd.dailyLossLimitMode === 'amount') {
          return Number.isFinite(Number(fd.dailyLossLimitAmount)) && Number(fd.dailyLossLimitAmount) >= 0;
        }
        return Number.isFinite(Number(fd.dailyLossLimitPercent)) && Number(fd.dailyLossLimitPercent) >= 0;
      }
    },
    {
      tab: 'goals',
      focusSelector: '#goals-goal-day',
      title: 'Цель на день',
      hint: 'Ориентир для HUD и напоминаний. Enter / «Далее по полю», затем обязательно сохрани профиль.',
      validate: (fd) => Number.isFinite(Number(fd.goalDayValue)) && Number(fd.goalDayValue) >= 0
    },
    {
      tab: 'goals',
      focusSelector: '#profile-modal-save-btn',
      title: 'Сохранить в счёт',
      hint: 'Нажми «Сохранить профиль» — значения уйдут в хранилище счёта. Без этого шага обучение не засчитает блок.',
      isSavePrompt: true
    }
  );

  return steps;
}
