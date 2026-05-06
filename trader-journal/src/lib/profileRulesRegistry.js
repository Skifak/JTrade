/**
 * Справочник правил и ограничений, которые пользователь видит в HUD / модалках / гейте сделки.
 * Не включает аналитические эвристики (маяки, корпус FAQ).
 */
import {
  computeMaxRiskAmount,
  computeMaxDailyLossAmount,
  computeMaxWeeklyLossAmount,
  computeMaxMonthlyLossAmount,
  computeDailyProfitLockAmount
} from './risk.js';
import { normalizeProfileGateRules } from './profileGateRulesNormalize.js';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtPctOrAmount(formData, modeKey, pctKey, amtKey) {
  const mode = formData[modeKey];
  if (mode === 'amount') return `${n(formData[amtKey]).toFixed(2)} ${formData.accountCurrency || ''}`.trim();
  return `${n(formData[pctKey]).toFixed(1)}% капитала`;
}

/**
 * @typedef {Object} ProfileRuleEntry
 * @property {string} id
 * @property {string} title
 * @property {'gate'|'hud'|'shell'|'practice'} layer
 * @property {'block'|'warn'|'info'} level
 * @property {string[]} [codes] — коды из evaluateTradeRules
 * @property {string[]} paragraphs
 * @property {boolean} [userConfigurable] — есть ли поля в профиле, задающие порог/поведение
 * @property {string[]} [sourceIds] — ключи mm-vic-* / abu-ruf-* в adviceSourceChunksData.json
 * @property {string} [sourceUrl]
 * @property {(formData: object) => string} summary
 * @property {boolean} [inlineOnly] — только форма: не дублировать карточкой в «Что проверяется»
 */

/** @type {ProfileRuleEntry[]} */
export const PROFILE_RULE_ENTRIES = [
  {
    id: 'risk-per-trade',
    title: 'Риск на сделку не выше лимита',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['risk-exceeds'],
    sourceIds: ['mm-vic-03'],
    paragraphs: [
      'Перед сохранением открытой сделки считается денежный риск от входа до SL (объём × контракт × расстояние до стопа).',
      'Если риск выше лимита из профиля, сохранение блокируется (кроме явного подтверждения там, где модалка это позволяет).',
      'При включённом anti-martingale лимит на сделку дополнительно умножается на текущий коэффициент после серии убытков.'
    ],
    summary: (fd) => {
      const lim = computeMaxRiskAmount(fd);
      const label = fd.riskMode === 'amount' ? 'фикс. сумма' : '% от капитала';
      return lim > 0
        ? `Лимит: до ${lim.toFixed(2)} ${fd.accountCurrency || ''} (${label})`.trim()
        : 'Лимит не задан или капитал 0 — проверка рыночного риска не опирается на профиль.';
    }
  },
  {
    id: 'exposure-budget',
    title: 'Суммарный риск по открытым + новая сделка',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['exposure-cap'],
    sourceIds: ['abu-ruf-06', 'abu-ruf-07'],
    paragraphs: [
      'Для всех открытых позиций с выставленным SL суммируется потенциальный убыток; добавляется риск новой (или редактируемой) сделки.',
      'Сумма не должна превышать «бюджет»: число разрешённых открытых позиций × лимит риска на одну сделку (с учётом anti-martingale).',
      'Так закрывается дыра после импорта или ручных правок, когда каждая позиция в отдельности выглядела нормально, а суммарная экспозиция — нет.'
    ],
    summary: (fd) => {
      const per = computeMaxRiskAmount(fd);
      const mo = n(fd.maxOpenTrades);
      if (mo <= 0 || per <= 0) return 'Задай положительные «макс. открытых» и риск на сделку — тогда включится бюджет экспозиции.';
      return `Бюджет Σриска: до ${(per * mo).toFixed(2)} ${fd.accountCurrency || ''} (${mo} × ${per.toFixed(2)})`.trim();
    }
  },
  {
    id: 'daily-stop',
    title: 'Дневной лимит убытка (kill-switch)',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['daily-stop'],
    sourceIds: ['abu-ruf-01'],
    paragraphs: [
      'PnL за календарный день по закрытым сделкам сравнивается с лимитом. При достижении лимита новая сделка блокируется.',
      'На главном экране кнопка «Новая сделка» также отключается до следующего дня — это тот же порог, что в профиле.'
    ],
    summary: (fd) => {
      const lim = computeMaxDailyLossAmount(fd);
      return lim > 0
        ? `Стоп дня: −${lim.toFixed(2)} ${fd.accountCurrency || ''} (${fmtPctOrAmount(fd, 'dailyLossLimitMode', 'dailyLossLimitPercent', 'dailyLossLimitAmount')})`
        : 'Дневной лимит не задан — kill-switch по дню выключен.';
    }
  },
  {
    id: 'weekly-loss-stop',
    title: 'Недельный лимит убытка (kill-switch)',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['weekly-stop'],
    sourceIds: ['abu-ruf-01', 'mm-vic-03'],
    paragraphs: [
      'Суммируется PnL всех закрытых сделок за текущую ISO-неделю (понедельник–воскресенье по локальному dayjs).',
      'При достижении лимита новая открытая позиция блокируется и кнопка «Новая сделка» отключена (аналогично дневному kill-switch). Сброс при переходе на новую неделю.'
    ],
    summary: (fd) => {
      if (fd.weeklyLossLimitEnabled === false) return 'Выключено.';
      const lim = computeMaxWeeklyLossAmount(fd);
      return lim > 0
        ? `Включено. Стоп недели: −${lim.toFixed(2)} ${fd.accountCurrency || ''} (${fmtPctOrAmount(fd, 'weeklyLossLimitMode', 'weeklyLossLimitPercent', 'weeklyLossLimitAmount')})`.trim()
        : 'Включено, но лимит 0 — недельный стоп не задаётся.';
    }
  },
  {
    id: 'monthly-loss-stop',
    title: 'Месячный лимит убытка (kill-switch)',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['monthly-stop'],
    sourceIds: ['abu-ruf-01', 'mm-vic-03'],
    paragraphs: [
      'Суммируется PnL всех закрытых сделок за текущий календарный месяц (по dateClose, локальный dayjs).',
      'При достижении лимита новая открытая позиция блокируется и главная кнопка входа отключена. Сброс в начале следующего месяца.'
    ],
    summary: (fd) => {
      if (fd.monthlyLossLimitEnabled === false) return 'Выключено.';
      const lim = computeMaxMonthlyLossAmount(fd);
      return lim > 0
        ? `Включено. Стоп месяца: −${lim.toFixed(2)} ${fd.accountCurrency || ''} (${fmtPctOrAmount(fd, 'monthlyLossLimitMode', 'monthlyLossLimitPercent', 'monthlyLossLimitAmount')})`.trim()
        : 'Включено, но лимит 0 — месячный стоп не задаётся.';
    }
  },
  {
    id: 'max-open',
    title: 'Максимум открытых позиций',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['max-open'],
    sourceIds: ['mm-vic-07', 'abu-ruf-11'],
    paragraphs: [
      'Считаются другие открытые сделки той же учётки. Если лимит уже достигнут, ещё одну открытую запись добавить нельзя без закрытия или редактирования сценария.'
    ],
    summary: (fd) =>
      n(fd.maxOpenTrades) > 0
        ? `Не больше ${n(fd.maxOpenTrades)} поз. одновременно`
        : 'Лимит не задан (0) — в коде трактуется как отсутствие ограничения по этому пункту.'
  },
  {
    id: 'max-trades-day',
    title: 'Лимит закрытых сделок за день',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['max-trades-day'],
    sourceIds: ['mm-vic-07', 'abu-ruf-11'],
    paragraphs: [
      'Считаются сделки с датой закрытия «сегодня». Если лимит исчерпан, новая открытая запись блокируется — защита от овертрейдинга.'
    ],
    summary: (fd) =>
      n(fd.maxTradesPerDay) > 0
        ? `До ${n(fd.maxTradesPerDay)} закрытых за сегодня`
        : '0 — без лимита на число закрытий за день.'
  },
  {
    id: 'loss-streak-stop',
    title: 'Стоп после серии убытков',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['streak-stop'],
    sourceIds: ['abu-ruf-04'],
    paragraphs: [
      'Подряд идущие закрытые убыточные сделки. Когда длина ≥ лимита из профиля, новые входы блокируются до смены серии.',
      'Не подменяет паузу «в голове» — но технически не даст оформить следующую запись в журнале без нарушения правила.'
    ],
    summary: (fd) =>
      n(fd.maxConsecutiveLosses) > 0
        ? `Блок нового входа при ${n(fd.maxConsecutiveLosses)} убытках подряд`
        : 'Лимит не задан.'
  },
  {
    id: 'cooldown',
    title: 'Cooldown после минуса',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    codes: ['cooldown'],
    sourceIds: ['mm-vic-07', 'abu-ruf-11'],
    paragraphs: [
      'После фиксации убыточной сделки запускается таймер. Пока он идёт, кнопка новой сделки и форма блокируются — снижение revenge-входов.',
      'Оставшееся время видно в HUD (карточка Anti-revenge).'
    ],
    summary: (fd) =>
      n(fd.cooldownAfterLossMin) > 0
        ? `Включено. Пауза ${n(fd.cooldownAfterLossMin)} мин после убыточного закрытия`
        : 'Выключено.'
  },
  {
    id: 'no-sl',
    title: 'Предупреждение без стоп-лосса',
    layer: 'gate',
    level: 'warn',
    userConfigurable: false,
    codes: ['no-sl'],
    sourceIds: ['mm-vic-03'],
    paragraphs: [
      'Без SL нельзя вычислить денежный риск сделки; журнал помечает предупреждение. Это не блок по умолчанию, но ломает контроль лимита и бюджета экспозиции.'
    ],
    summary: () => 'Всегда предупреждение, если SL пустой.'
  },
  {
    id: 'rr-below-one',
    title: 'R:R ниже 1:1 при заданном TP',
    layer: 'gate',
    level: 'warn',
    userConfigurable: false,
    codes: ['rr-low'],
    sourceIds: ['mm-vic-03', 'abu-ruf-06'],
    paragraphs: [
      'Если и SL, и TP заданы, отношение потенциальной прибыли к риску считается автоматически. Ниже 1:1 — предупреждение (блок не ставится).'
    ],
    summary: () => 'Предупреждение при TP ближе к входу, чем SL.'
  },
  {
    id: 'hedge-same-pair',
    title: 'Противоположное направление по той же паре',
    layer: 'gate',
    level: 'warn',
    userConfigurable: false,
    codes: ['hedge'],
    sourceIds: ['abu-ruf-07'],
    paragraphs: [
      'Если уже есть открытая позиция по паре в одну сторону, а новая — в другую, выдаётся предупреждение (хедж / размытие сценария).'
    ],
    summary: () => 'Только предупреждение.'
  },
  {
    id: 'notes-checklist',
    title: 'Чек-лист «Свои правила»',
    layer: 'gate',
    level: 'warn',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['notes-checklist', 'notes-checklist-required'],
    sourceIds: ['mm-vic-02'],
    paragraphs: [
      'На вкладке «Правила» в блоке «Свои правила» задаётся список пунктов как в плейбуке (Preconditions): поле текста + optional required.',
      'Пункты с required не отмечены в форме сделки — блокировка сохранения; без required — только предупреждение в истории нарушений.'
    ],
    summary: (fd) => {
      if (fd.profileNotesChecklistEnabled === false) return 'Выключено.';
      const items = normalizeProfileGateRules(fd);
      const req = items.filter((r) => r.required).length;
      return items.length
        ? `Включено. ${items.length} пункт(ов)${req ? `, ${req} required → блок` : ''} — галочки в форме`
        : 'Включено. Список пуст — чек-лист не показывается.';
    }
  },
  {
    id: 'playbook-required',
    title: 'Обязательные пункты play в плейбуке',
    layer: 'gate',
    level: 'block',
    userConfigurable: false,
    codes: ['play-preconditions'],
    sourceIds: ['abu-ruf-14'],
    paragraphs: [
      'У сетапа (play) могут быть pre/entry правила с флажком required. Пока не отмечены — сохранение сделки с этим play блокируется.'
    ],
    summary: () => 'Зависит от выбранного play в форме сделки.'
  },
  {
    id: 'play-killzone',
    title: 'Killzone play',
    layer: 'gate',
    level: 'warn',
    userConfigurable: false,
    codes: ['play-killzone', 'play-killzone-out'],
    sourceIds: ['mm-vic-05', 'abu-ruf-14'],
    paragraphs: [
      'Если у play задан список допустимых killzone, а текущее окно сессии другое (или вне KZ), журнал выдаёт предупреждение.',
      'Временная зона — настройки терминала/ОС; KZ берутся из общей логики приложения.'
    ],
    summary: () => 'Срабатывает только при привязке сделки к play с killzones.'
  },
  {
    id: 'htf-bias',
    title: 'Совпадение с HTF bias / режим play',
    layer: 'gate',
    level: 'warn',
    userConfigurable: false,
    codes: ['against-bias', 'play-against-but-aligned'],
    sourceIds: ['mm-vic-05', 'abu-ruf-14'],
    paragraphs: [
      'Если для пары задан daily/H4 bias, направление сделки сравнивается с ним. Против bias — предупреждение (кроме play, где явно требуется counter-bias).',
      'Если play только «против bias», а сделка по bias — тоже предупреждение.'
    ],
    summary: () => 'Нужны bias по символу и выбранный play с требованием HTF.'
  },
  {
    id: 'anti-martingale',
    title: 'Anti-martingale (масштаб после серии убытков)',
    layer: 'gate',
    level: 'info',
    userConfigurable: true,
    inlineOnly: true,
    codes: [],
    sourceIds: ['abu-ruf-06'],
    paragraphs: [
      'Настраиваемая сетка множителей: с выбранного числа убытков подряд лимит риска умножается на первый коэффициент, затем на следующий за каждый дополнительный убыток; последний множитель держится при длинной серии.',
      'Влияет на проверку «риск на сделку» и на бюджет экспозиции — в HUD отображается как ×коэффициент.'
    ],
    summary: (fd) => {
      if (!fd.streakScalingEnabled) return 'Выключено.';
      const from = Number(fd.streakScalingApplyFromLossCount) >= 1 ? Math.floor(Number(fd.streakScalingApplyFromLossCount)) : 2;
      const g = Array.isArray(fd.streakScalingMultipliers) ? fd.streakScalingMultipliers : [];
      const parts = g.slice(0, 4).map((x) => `×${Number(x)}`);
      const chain = parts.length ? parts.join(' → ') : '×…';
      const tail = g.length > 4 ? ' → …' : '';
      return `Включено. С ${from} уб.: ${chain}${tail}`;
    }
  },
  {
    id: 'goal-day-popup',
    title: 'Напоминание закрыть день при цели дня',
    layer: 'shell',
    level: 'info',
    userConfigurable: true,
    inlineOnly: true,
    sourceIds: ['abu-ruf-06'],
    paragraphs: [
      'Если дневная цель по профилю достигнута по закрытому PnL и опция включена, появляется модалка «закрой день» — чтобы зафиксировать процесс, а не переторговать.'
    ],
    summary: (fd) =>
      fd.dailyReviewEnabled !== false && n(fd.goalDayValue) > 0
        ? 'Включено (есть модалка при достижении цели дня).'
        : 'Выключено или цель дня нулевая.'
  },
  {
    id: 'journal-day-reminder',
    title: 'Напоминание заполнить дневник',
    layer: 'shell',
    level: 'info',
    userConfigurable: true,
    inlineOnly: true,
    sourceIds: ['mm-vic-07', 'abu-ruf-11'],
    paragraphs: [
      'В заданный локальный час, если дневник за сегодня пуст, показывается ненавязчивое напоминание (можно скрыть до конца дня).'
    ],
    summary: (fd) =>
      fd.journalDayReminderEnabled !== false
        ? `Включено. Час (локально): ${n(fd.journalDayReminderHourLocal)}`
        : 'Выключено.'
  },
  {
    id: 'post-close-chart',
    title: 'Скрин графика после закрытой сделки',
    layer: 'shell',
    level: 'warn',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['post-close-no-chart'],
    sourceIds: ['mm-vic-02'],
    paragraphs: [
      'Сразу после закрытия память о контексте максимальна: свечной характер, зона ликвидности, где стоял SL/TP, совпадение с killzone и планом play. Снимок экрана фиксирует это для пост-анализа так же, как запись в дневник фиксирует состояние.',
      'Без визуала через неделю легко «дорисовать» оправдательную историю; со скрином ревью остаётся привязанным к фактическому графику — лучше для честной статистики и развития edge.',
      'Включено: тост и баннер после «Закрыть сделку»; в редактировании закрытой без изображения — предупреждение WARN; подтверждение добавляет код в ruleViolations (легче, чем block). После прикрепления файла-картинки предупреждение снимается при сохранении.'
    ],
    summary: (fd) =>
      fd.postCloseChartReminderEnabled !== false
        ? 'Включено: напоминание + мягкое правило при правке закрытой без скрина.'
        : 'Выключено.'
  },
  {
    id: 'daily-profit-lock',
    title: 'Потолок дневной прибыли (фиксация дня)',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['daily-profit-lock'],
    sourceIds: ['abu-ruf-06', 'abu-ruf-13'],
    paragraphs: [
      'Когда закрытый PnL за сегодня достигает заданного потолка, новые входы блокируются — защита от переторговки и отдачи прибыли после хорошего дня.',
      'Отличается от модалки «цель дня»: это жёсткий запрет на новую сделку после порога.'
    ],
    summary: (fd) => {
      if (fd.dailyProfitLockEnabled === false) return 'Выключено.';
      const lim = computeDailyProfitLockAmount(fd);
      return lim > 0
        ? `Включено. Потолок: +${lim.toFixed(2)} ${fd.accountCurrency || ''} (${fmtPctOrAmount(fd, 'dailyProfitLockMode', 'dailyProfitLockPercent', 'dailyProfitLockAmount')})`.trim()
        : 'Включено, но лимит 0 — потолок не действует.';
    }
  },
  {
    id: 'after-hours-cutoff',
    title: 'Ограничение на открытие сделок после заданного часа',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['after-hours-cutoff'],
    sourceIds: ['mm-vic-07', 'abu-ruf-11'],
    paragraphs: [
      'Локальный час 1–23: начиная с этого часа (включительно) новые сделки не оформливаются. Подходит для «не торговать ночью» или урезания хвоста сессии.',
      '0 в профиле — правило выключено.'
    ],
    summary: (fd) => {
      if (fd.afterHoursCutoffEnabled === false) return 'Выключено.';
      const h = Math.floor(n(fd.noNewTradesAfterHourLocal));
      return h >= 1 && h <= 23
        ? `Включено. С ${h}:00 локально новые входы закрыты`
        : 'Включено, но час 0 — правило без эффекта (задай 1–23).';
    }
  },
  {
    id: 'min-trade-interval',
    title: 'Минимальный интервал после закрытия',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['trade-interval'],
    sourceIds: ['mm-vic-07'],
    paragraphs: [
      'Отсчёт от времени последнего закрытия в журнале. Если прошло меньше N минут — новая сделка блокируется (анти-овертрейд и время на осознанность).',
      '0 — выключено.'
    ],
    summary: (fd) =>
      fd.minTradeIntervalEnabled === false
        ? 'Выключено.'
        : n(fd.minMinutesBetweenTrades) > 0
        ? `Включено. Не раньше чем через ${n(fd.minMinutesBetweenTrades)} мин после закрытия`
        : 'Включено, но 0 мин — без эффекта.'
  },
  {
    id: 'rr-min-block',
    title: 'Минимальный R:R (жёсткий порог)',
    layer: 'gate',
    level: 'block',
    userConfigurable: true,
    inlineOnly: true,
    codes: ['rr-below-min'],
    sourceIds: ['mm-vic-03', 'abu-ruf-06'],
    paragraphs: [
      'Если включено и заданы SL и TP, отношение потенциальной прибыли к риску должно быть не ниже порога из профиля. Иначе — блок, а не только предупреждение.',
      'Классическое «хуже 1:1» остаётся предупреждением, если жёсткий порог не включён.'
    ],
    summary: (fd) =>
      fd.minRiskRewardHardBlock && n(fd.minRiskRewardRatio) > 0
        ? `Включено. Блок при R:R < ${n(fd.minRiskRewardRatio).toFixed(2)}`
        : 'Выключено (только предупр. ниже 1:1).'
  }
];

/** Порядок карточек в блоке «Риски по сделкам» на вкладке правил. */
export const PROFILE_RULE_TAB_TRADE_RISK_IDS = [
  'risk-per-trade',
  'exposure-budget',
  'daily-stop',
  'weekly-loss-stop',
  'monthly-loss-stop'
];

/** Секции вкладки: сначала риски по сделкам, затем прочие правила в том же порядке, что в реестре. */
export const PROFILE_RULE_TAB_SECTIONS = (() => {
  const set = new Set(PROFILE_RULE_TAB_TRADE_RISK_IDS);
  const trade = PROFILE_RULE_TAB_TRADE_RISK_IDS.map((id) => PROFILE_RULE_ENTRIES.find((e) => e.id === id)).filter(
    Boolean
  );
  const rest = PROFILE_RULE_ENTRIES.filter((e) => !set.has(e.id));
  return [
    { title: 'Риски по сделкам', entries: trade },
    { title: null, entries: rest }
  ];
})();

/** Без числовых полей в профиле — встроенное поведение гейта / HUD */
export const PROFILE_RULE_ENTRIES_CORE = PROFILE_RULE_ENTRIES.filter((e) => !e.userConfigurable);

/** Отражают пороги и переключатели с вкладки «Правила и ограничения» */
export const PROFILE_RULE_ENTRIES_TUNABLE = PROFILE_RULE_ENTRIES.filter((e) => e.userConfigurable);

/** Карточки справки только для порогов без отдельного чекбокса в форме */
export const PROFILE_RULE_ENTRIES_REFERENCE = PROFILE_RULE_ENTRIES_TUNABLE.filter((e) => !e.inlineOnly);

/** Полный справочник по порядку объявления — для вкладки «Правила» (карточка + поле в одном месте). */
export const PROFILE_RULE_ENTRIES_TAB = PROFILE_RULE_ENTRIES;

/** @deprecated см. PROFILE_RULE_ENTRIES_TAB — оба совпадают с полным списком */
export const PROFILE_RULE_ENTRIES_MAIN = PROFILE_RULE_ENTRIES;

/** @param {string} id */
export function getProfileRuleById(id) {
  const k = String(id || '').trim();
  return PROFILE_RULE_ENTRIES.find((e) => e.id === k) || null;
}

export function getProfileRuleLayerLabel(layer) {
  switch (layer) {
    case 'gate':
      return 'Проверка при сохранении';
    case 'hud':
      return 'Интерфейс';
    case 'shell':
      return 'Окно / напоминание';
    case 'practice':
      return 'Практика';
    default:
      return layer;
  }
}

export function getProfileRuleLevelLabel(level) {
  switch (level) {
    case 'block':
      return 'Блок';
    case 'warn':
      return 'Предупр.';
    case 'info':
      return 'Инфо';
    default:
      return level;
  }
}
