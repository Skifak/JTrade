/**
 * Обучение по журналу: блоки (темы) и линейные шаги.
 * Якоря: data-tour="<target>".
 */

/**
 * @typedef {{ id: string, label: string, lede?: string }} JournalTourBlock
 */

/**
 * continueTourTarget: перехват клика = «Далее» (без реального действия кнопки).
 * @typedef {{
 *   id: string,
 *   blockId: string,
 *   target: string | null,
 *   title: string,
 *   body: string,
 *   tab?: string | null,
 *   continueTourTarget?: string | null,
 *   actionHint?: string,
 *   progressLabel?: string
 * }} JournalTourStep
 */

/** @type {JournalTourBlock[]} */
export const JOURNAL_TOUR_BLOCKS = [
  { id: 'intro', label: 'Старт', lede: 'Введение' },
  { id: 'account', label: 'Счёт и профиль', lede: 'Лимиты, валюта, цели' },
  { id: 'hud', label: 'Риск-HUD', lede: 'Панель над таблицей' },
  { id: 'trades', label: 'Сделки', lede: 'Окно сделки и шаблоны' },
  { id: 'shell', label: 'Навигация', lede: 'Вкладки журнала' },
  { id: 'lists', label: 'Списки и статистика', lede: 'Открытые и сводка' },
  { id: 'diary', label: 'Дневник', lede: 'День в тексте' },
  { id: 'finish', label: 'Итог', lede: 'Замыкание маршрута' }
];

/** @param {string} blockId */
export function getJournalTourBlock(blockId) {
  return JOURNAL_TOUR_BLOCKS.find((b) => b.id === blockId) ?? null;
}

/** Цели шагов, для которых нужно открыто окно сделки (add/edit). */
export const TOUR_TRADE_FORM_TARGETS = new Set([
  'tour-trade-templates-rail',
  'tour-trade-save-template',
  'tour-trade-save'
]);

/** @param {JournalTourStep | null | undefined} step */
export function tourStepNeedsTradeFormOpen(step) {
  return !!(step?.target && TOUR_TRADE_FORM_TARGETS.has(step.target));
}

/** @type {JournalTourStep[]} */
export const JOURNAL_TOUR_STEPS = [
  {
    id: 'welcome',
    blockId: 'intro',
    target: null,
    title: 'Старт',
    progressLabel: 'Введение',
    body:
      'Обучение разбито на блоки: счёт, HUD, сделки, навигация, дневник. Двигайся по шагам; «Прогресс обучения» показывает чеклист. Закрыть тур можно в любой момент.'
  },
  {
    id: 'profile',
    blockId: 'account',
    target: 'tour-profile',
    title: 'Задача: профиль',
    progressLabel: 'Модалка профиля',
    body:
      'Нажми «Профиль». В модалке — подшаги по полям (Enter / «Далее по полю»). Финал блока — «Сохранить профиль»; без сохранения основной тур не уйдёт дальше.',
    actionHint:
      'Подшаги счёта видны в «Прогресс обучения». Дальше по туру — только после сохранения профиля.'
  },
  {
    id: 'risk-hud',
    blockId: 'hud',
    target: 'tour-hud',
    title: 'Проверка HUD',
    progressLabel: 'Строка риска',
    body:
      'Сверь дневной P/L, лимиты, цели и дисциплину с тем, что задал в профиле. При расхождении — снова профиль.'
  },
  {
    id: 'trade-open',
    blockId: 'trades',
    target: 'tour-new-trade',
    title: 'Открыть окно сделки',
    progressLabel: '+ Сделка',
    body:
      'Нажми «+ Сделка». Дальше весь блок «Сделки» идёт внутри этого окна: шаблоны слева и кнопки внизу — не в общем журнале.',
    actionHint:
      'После открытия формы жми «Далее» — подсветится колонка шаблонов.'
  },
  {
    id: 'trade-templates',
    blockId: 'trades',
    target: 'tour-trade-templates-rail',
    title: 'Шаблоны в окне сделки',
    progressLabel: 'Колонка «Шаблоны»',
    body:
      'Слева список шаблонов: нажми на строку — подставитcя пара, направление, теги и т.п. (цены входа/SL/TP подставляются заново). Можно работать без шаблонов — просто просмотри зону.',
    actionHint:
      'Если колонки не видно — расширь окно; на узком экране боковая колонка уезжает под макет.'
  },
  {
    id: 'trade-save-template',
    blockId: 'trades',
    target: 'tour-trade-save-template',
    title: 'Сохранить как шаблон',
    progressLabel: 'Кнопка «Сохранить как шаблон»',
    body:
      'Заполни пару полей под свой типовой вход и нажми «Сохранить как шаблон» — появится в списке слева. Имя можно отредактировать в диалоге.',
    actionHint:
      'Можно пропустить, если шаблон пока не нужен — просто «Далее».'
  },
  {
    id: 'trade-save',
    blockId: 'trades',
    target: 'tour-trade-save',
    title: 'Сохранить сделку',
    progressLabel: 'Кнопка «Сохранить»',
    body:
      'Заполни обязательные поля и сохрани сделку (учебную). Закрыть форму можно после сохранения или оставить открытой — затем «Далее».',
    actionHint:
      'Если kill-switch блокирует сохранение — ослабь лимит в профиле или отложи шаг.'
  },
  {
    id: 'tabs',
    blockId: 'shell',
    target: 'tour-tabs',
    title: 'Вкладки журнала',
    progressLabel: 'Полоса вкладок',
    body:
      'Здесь списки сделок, статистика, аналитика, дневник, справка. Следующие шаги по очереди откроют «Открытые», «Статистику» и «Дневник».'
  },
  {
    id: 'tab-open',
    blockId: 'lists',
    target: 'tour-tab-open',
    tab: 'open',
    title: 'Открытые позиции',
    progressLabel: 'Вкладка «Открытые»',
    body:
      'Открытые сделки: рыночный P/L и действия до закрытия.'
  },
  {
    id: 'tab-stats',
    blockId: 'lists',
    target: 'tour-tab-stats',
    tab: 'stats',
    title: 'Статистика',
    progressLabel: 'Вкладка «Статистика»',
    body:
      'Сводка по закрытым: edge, серии, фильтры.'
  },
  {
    id: 'tab-journal',
    blockId: 'diary',
    target: 'tour-tab-journal',
    tab: 'journal',
    title: 'Дневник дня',
    progressLabel: 'Вкладка «Дневник»',
    body:
      'Заполни сегодняшний день: план, итог или чек-лист — связка цифр с контекстом.',
    actionHint:
      'Сохрани дневник, затем «Далее».'
  },
  {
    id: 'done',
    blockId: 'finish',
    target: 'tour-learn-cta',
    title: 'Готово',
    progressLabel: 'Повтор тура',
    body:
      'Маршрут пройден: профиль, HUD, сделка с шаблонами, вкладки, дневник. Запустить снова — «Пройти обучение»; теория — «Гайд».',
    continueTourTarget: 'tour-learn-cta'
  }
];

export function journalTourStepCount() {
  return JOURNAL_TOUR_STEPS.length;
}

/** `data-tour` на текущем поле профиля (подшаги), пока открыта модалка. */
export const JOURNAL_TOUR_PROFILE_MODAL_SPOT = 'tour-profile-modal-spot';

/** @param {string} blockId */
export function getFirstStepIndexForJournalTourBlock(blockId) {
  return JOURNAL_TOUR_STEPS.findIndex((s) => s.blockId === blockId);
}

/** Индекс первого шага следующего блока или -1. */
export function getNextJournalTourBlockFirstStepIndex(fromIndex) {
  const cur = JOURNAL_TOUR_STEPS[fromIndex];
  if (!cur) return -1;
  for (let i = fromIndex + 1; i < JOURNAL_TOUR_STEPS.length; i++) {
    if (JOURNAL_TOUR_STEPS[i].blockId !== cur.blockId) return i;
  }
  return -1;
}
