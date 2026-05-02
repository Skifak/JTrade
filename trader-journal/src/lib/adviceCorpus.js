/**
 * Курируемая база советов: дополняй массив advicePosts или JSON в localStorage
 * ключ `adviceCorpusExtension_v1` (массив объектов в том же формате).
 *
 * tags — темы: tilt, revenge, drawdown, discipline, overtrade, journal, risk, general, edge.
 * sourceRefs — id фрагментов из adviceSourcesRegistry.js; текст показывается во всплывающей подсказке.
 */

export const ADVICE_STORAGE_KEY = 'adviceCorpusExtension_v1';

/** Маяк наставника → темы для подбора записей */
export const BEACON_TAG_TO_ADVICE = {
  daily_stop: ['tilt', 'risk', 'discipline'],
  cooldown: ['tilt', 'revenge'],
  profile_loss_cap: ['tilt', 'discipline', 'risk'],
  open_no_sl: ['risk'],
  aggregate_sl_risk: ['risk'],
  aggregate_sl_risk_soft: ['risk'],
  max_open: ['risk', 'discipline'],
  week_red: ['drawdown', 'discipline'],
  month_red: ['drawdown', 'discipline'],
  bias_violations: ['discipline'],
  grind: ['discipline', 'general'],
  sharpe_soft: ['discipline', 'general'],
  discipline_edge: ['discipline', 'general'],
  loss_streak: ['tilt', 'revenge'],
  loss_streak_soft: ['tilt', 'revenge'],
  drawdown_deep: ['drawdown', 'risk'],
  drawdown_watch: ['drawdown', 'tilt'],
  pace: ['overtrade', 'discipline'],
  day_red: ['tilt', 'revenge'],
  discipline: ['discipline'],
  journal_gap: ['journal', 'discipline'],
  momentum: ['general'],
  steady: ['general'],
  manual_no_attachments: ['journal', 'discipline']
};

/** Ключ состояния аналитики → темы советов (если уровень не «Норма»). */
export const STANCE_KEY_TO_ADVICE = {
  impulse_tilt: ['tilt', 'revenge', 'discipline'],
  gambling_process: ['overtrade', 'discipline', 'journal'],
  journal_slack: ['journal', 'discipline'],
  playbook_gap: ['discipline', 'edge'],
  risk_load: ['risk', 'discipline'],
  equity_stress: ['drawdown', 'risk', 'tilt'],
  overload: ['overtrade', 'journal', 'discipline', 'general']
};

function validateAdvicePost(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.id !== 'string' || !p.id.trim()) return false;
  if (!Array.isArray(p.tags)) return false;
  if (p.sourceRefs != null && !Array.isArray(p.sourceRefs)) return false;
  return true;
}

/** Советы на основе пользовательской базы (otchet/baza.txt), выжимки + ссылки на фрагменты. */
export const advicePosts = [
  {
    id: 'baza-weekend-liquidity',
    tags: ['discipline', 'risk', 'general'],
    title: 'Выходные и тонкий стакан',
    takeaway:
      'Без привычного институционального объёма движения чаще хаотичны; разгон риска от скуки обычно дороже пропуска сессии.',
    directions: [
      'Заранее решить, торгуешь ли выходные вообще и при каких условиях.',
      'Не компенсировать тишину объёмом или «додуманными» сетапами.'
    ],
    sourceRefs: ['chunk-crypto-weekend']
  },
  {
    id: 'baza-dxy-context',
    tags: ['general', 'discipline'],
    title: 'Доллар (DXY) как контекст риска',
    takeaway:
      'Фаза USD помогает понять общий фон для рискованных активов; это фильтр контекста, а не единственный триггер входа.',
    directions: ['Перед идеей свериться с динамикой DXY под свой инструмент.', 'Не подменять системный вход одним макропоказателем.'],
    sourceRefs: ['chunk-dxy-risk']
  },
  {
    id: 'baza-partial-profits',
    tags: ['risk', 'discipline'],
    title: 'Частичная фиксация',
    takeaway:
      'Забрать часть до основной цели снимает давление и реализует результат до ложного разворота или недостижения таргета.',
    directions: ['Зафиксировать в плане уровни частичной фиксации.', 'Не держать всё «до идеального» экстремума по умолчанию.'],
    sourceRefs: ['chunk-partial-take']
  },
  {
    id: 'baza-htf-roadmap',
    tags: ['discipline', 'general', 'edge'],
    title: 'Старший контекст (H1 / H4)',
    takeaway:
      'Младшие ТФ дают шум; контекст на часовиках снижает лишние стопы и спешку решений.',
    directions: ['Сценарий дня начинать со старшего ТФ.', 'Младший использовать для точности входа, а не для «охоты» за каждой свечой.'],
    sourceRefs: ['chunk-htf-context']
  },
  {
    id: 'baza-alerts-not-stare',
    tags: ['discipline', 'overtrade', 'tilt'],
    title: 'Алерты вместо залипания',
    takeaway:
      'Долгий просмотр графика без сценария порождает выдуманные входы; перерывы сохраняют качество фильтра.',
    directions: ['Выставить ключевые алерты и отойти до срабатывания.', 'Ограничить время активного наблюдения за экраном.'],
    sourceRefs: ['chunk-chart-fatigue']
  },
  {
    id: 'baza-news-discipline',
    tags: ['risk', 'discipline'],
    title: 'Новости и хаос',
    takeaway:
      'В окне сильных событий техника может временно уступать хаосу; часто выгоднее не быть в позиции, чем доказывать уровень.',
    directions: ['Иметь календарь событий и правило «красной зоны».', 'Дождаться осмысленной структуры после импульса.'],
    sourceRefs: ['chunk-news-offtable', 'chunk-political-news-vol', 'chunk-uncertain-regime']
  },
  {
    id: 'baza-confirmation',
    tags: ['discipline', 'journal', 'edge'],
    title: 'Подтверждение входа',
    takeaway:
      'Вход без триггера по системе близок к угадыванию импульса; подтверждение в зоне интереса снижает число ложных стартов.',
    directions: ['Описать в плейбуке минимальное подтверждение.', 'Не входить «на ожидании», если условие не выполнено.'],
    sourceRefs: ['chunk-entry-confirm']
  },
  {
    id: 'baza-smc-map',
    tags: ['discipline', 'general', 'edge'],
    title: 'Структура, OB и FVG',
    takeaway:
      'Сначала структура и смена контекста; блоки и имбалансы работают как часть карты, а не как оторванные паттерны.',
    directions: ['Различать коррекцию и смену направления по своим правилам.', 'Связывать OB/FVG со старшим ТФ и ликвидностью.'],
    sourceRefs: ['chunk-smc-triangle']
  },
  {
    id: 'baza-crowd-liquidity',
    tags: ['risk', 'discipline'],
    title: 'Толпа и ликвидность',
    takeaway:
      'Сильный перекос позиций создаёт магнит для снятия стопов; в таких фазах часто лучше ждать ясности.',
    directions: ['Отмечать экстремумы ликвидности в сценарии.', 'Не входить вместе с массовым консенсусом без своего edge.'],
    sourceRefs: ['chunk-crowd-liquidity', 'chunk-liq-reversal-ote']
  },
  {
    id: 'baza-invalidate',
    tags: ['discipline', 'journal'],
    title: 'Отмена сценария',
    takeaway:
      'Если цена ломает логику до входа или в процессе формирования сетапа — идею закрывают, а не подгоняют под старую картинку.',
    directions: ['Зафиксировать условие инвалидизации до входа.', 'Разрешить себе «нет сделки» без чувства упущенной победы.'],
    sourceRefs: ['chunk-scenario-cancel']
  },
  {
    id: 'baza-reset-offline',
    tags: ['tilt', 'discipline'],
    title: 'Перезагрузка при усталости',
    takeaway:
      'Каша на графике и усталость — сигнал к паузе, спорту и отрыву от потока; так возвращается ясность быстрее, чем через добор сделок.',
    directions: ['Правило полной паузы после нескольких часов «каши» на графике.', 'Планировать лёгкий офлайн перед новой неделей.'],
    sourceRefs: ['chunk-offline-recovery', 'chunk-week-reset-sport', 'chunk-body-readiness']
  },
  {
    id: 'baza-risk-engine',
    tags: ['risk', 'discipline', 'edge'],
    title: 'Риск как основа процесса',
    takeaway:
      'Стоп на месте слома тезиса; стабильный риск на сделку и соотношение к прибыли важнее «угадайки» направления.',
    directions: ['Не двигать стоп из надежды.', 'Оценивать серию по соблюдению риска, а не по одному исходу.'],
    sourceRefs: ['chunk-risk-not-guess', 'chunk-greed-fear-mgmt']
  },
  {
    id: 'baza-patience-empty',
    tags: ['discipline', 'tilt'],
    title: 'Нет сетапа — нет сделки',
    takeaway:
      'Отсутствие позиции сохраняет капитал; упущенный без входа профит не является убытком по журналу.',
    directions: ['Явно записать: «сегодня без входа — ок», если условий не было.', 'Ловить движение без триггера = выход из процесса.'],
    sourceRefs: ['chunk-patience-flat', 'chunk-fomo-discipline']
  },
  {
    id: 'baza-gambling-markers',
    tags: ['discipline', 'journal', 'tilt'],
    title: 'Признаки игрового режима',
    takeaway:
      'Торговля от скуки, мониторинг баланса вместо логики, отыгрыш и отсутствие журнала — красные флаги.',
    directions: ['Честно пройти чеклист перед входом.', 'При маркерах — пауза до следующего дня.'],
    sourceRefs: ['chunk-gambling-markers']
  },
  {
    id: 'baza-order-flex',
    tags: ['risk', 'discipline'],
    title: 'Лимитка и контекст',
    takeaway:
      'Статичная заявка может исполниться без твоего участия в момент смены контекста; осознанный вход после проверки даёт гибкость.',
    directions: ['Выбрать модель входа под время у экрана.', 'Не спать через контр-трендовые новости на голой лимитке без плана B.'],
    sourceRefs: ['chunk-limit-market-tradeoff']
  },
  {
    id: 'baza-regime-tool',
    tags: ['discipline', 'edge', 'general'],
    title: 'Режим рынка и инструмент',
    takeaway:
      'Паттерн работает не всегда; нужно понимать, когда рынок «подходит» под твой метод, а когда лучше ждать.',
    directions: ['Добавить в журнал заметку о режиме дня (тренд / диапазон / хаос).', 'Не форсировать инструмент вне условий.'],
    sourceRefs: ['chunk-regime-tool-fit', 'chunk-news-as-catalyst']
  },
  {
    id: 'baza-selective-pro',
    tags: ['discipline', 'general'],
    title: 'Меньше сделок — не «лень»',
    takeaway:
      'Селективность при грязном фоне и новостях защищает депозит; качество входов важнее активности ради канала или эго.',
    directions: ['Разрешить себе неделю с малым числом сделок при соблюдении правил.', 'Сравнивать недели по качеству сценариев, не по счётчику ордеров.'],
    sourceRefs: ['chunk-selective-trading']
  },
  {
    id: 'baza-life-meta',
    tags: ['general', 'discipline', 'tilt'],
    title: 'Масштаб важности и информация',
    takeaway:
      'Чем меньше каждая сделка ощущается как «всё или ничего», тем стабильнее решения; узкий круг источников и прозрачность уменьшают шум.',
    directions: ['Фиксировать риск так, чтобы один стоп не бил по идентичности.', 'Отбирать 3–5 проверенных источников вместо бесконечной ленты.'],
    sourceRefs: ['chunk-work-life-balance', 'chunk-trusted-sources', 'chunk-career-beyond-buttons']
  }
];

function readExtensionFromStorage() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ADVICE_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(validateAdvicePost);
  } catch {
    return [];
  }
}

/** Сброс кэша (оставлено для совместимости; расширение читается из storage при каждом подборе). */
export function invalidateAdviceExtensionCache() {}

export function getMergedAdvicePosts() {
  return [...advicePosts, ...readExtensionFromStorage()];
}

/**
 * Подбор по множеству темов advice-тегов.
 * @param {Set<string>|string[]} needRaw
 * @param {number} limit
 */
export function pickAdviceForAdviceTags(needRaw, limit = 6) {
  const need = needRaw instanceof Set ? new Set(needRaw) : new Set(needRaw);
  if (need.size === 0) need.add('general');

  const posts = getMergedAdvicePosts();
  /** @type {{ post: object; score: number; matched: string[] }[]} */
  const scored = [];

  for (const post of posts) {
    const ptags = Array.isArray(post.tags) ? post.tags : [];
    const matched = [];
    let score = 0;
    for (const t of ptags) {
      if (need.has(t)) {
        matched.push(t);
        score += 2;
      }
    }
    if (score > 0) scored.push({ post, score, matched });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.post.id).localeCompare(String(b.post.id));
  });

  const seen = new Set();
  const out = [];
  for (const row of scored) {
    const id = row.post.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...row.post,
      matchedAdviceTags: row.matched
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {string[]} beaconTags
 * @param {{ id: string; level: string }[]} stances — level === 'ok' не добавляет темы
 * @param {number} limit
 */
export function pickAdviceForBeaconsAndStances(beaconTags, stances, limit = 6) {
  const need = new Set();
  for (const bt of beaconTags || []) {
    const arr = BEACON_TAG_TO_ADVICE[bt];
    if (Array.isArray(arr)) {
      for (const a of arr) need.add(a);
    }
  }
  if (Array.isArray(stances)) {
    for (const s of stances) {
      if (!s || s.level === 'ok') continue;
      const arr = STANCE_KEY_TO_ADVICE[s.id];
      if (Array.isArray(arr)) {
        for (const a of arr) need.add(a);
      }
    }
  }
  return pickAdviceForAdviceTags(need, limit);
}

/**
 * @param {string[]} beaconTags — tag активных маяков (уже отсортированных по приоритету)
 * @param {number} limit
 * @returns {Array<object & { matchedAdviceTags: string[] }>}
 */
export function pickAdviceForBeacons(beaconTags, limit = 5) {
  const need = new Set();
  for (const bt of beaconTags) {
    const arr = BEACON_TAG_TO_ADVICE[bt];
    if (Array.isArray(arr)) {
      for (const a of arr) need.add(a);
    }
  }
  if (need.size === 0) need.add('general');
  return pickAdviceForAdviceTags(need, limit);
}
