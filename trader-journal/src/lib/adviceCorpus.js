/**
 * Курируемая база советов: дополняй массив advicePosts или JSON в localStorage
 * ключ `adviceCorpusExtension_v1` (массив объектов в том же формате).
 *
 * tags — темы: tilt, revenge, drawdown, discipline, overtrade, journal, risk, general, edge.
 * sourceRefs — id постов (mm-vic-*, abu-ruf-*) в adviceSourceChunksData.json; оригиналы — во всплывающей ⓘ.
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
  manual_no_attachments: ['journal', 'discipline'],
  post_close_chart: ['journal', 'discipline', 'edge']
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

/** Советы: выжимки + полные посты Виктора / Руфата (ⓘ). */
export const advicePosts = [
  {
    id: 'mix-chaos-process',
    tags: ['discipline', 'general', 'journal'],
    title: 'Хаос, процесс и навык',
    takeaway:
      'Случайный исход одной сделки не определяет качество трейдера; на дистанции важны повторяемые решения и журнал.',
    directions: [
      'Различать краткосрочную удачу и долгосрочный навык по серии, а не по одной сделке.',
      'Оценивать «успех» как качество процесса, а не только цифру последнего трейда.'
    ],
    sourceRefs: ['mm-vic-01', 'mm-vic-02']
  },
  {
    id: 'mix-journal-rufat',
    tags: ['journal', 'discipline'],
    title: 'Журнал и разбор на дистанции',
    takeaway:
      'Без записи и честного разбора теряется связь между действиями и результатом; дневник сделок тащит дисциплину в быт.',
    directions: [
      'Фиксировать контекст входа и состояние, а не только PnL.',
      'Переоценивать серии и закономерности, а не каждый тик.'
    ],
    sourceRefs: ['mm-vic-02', 'abu-ruf-13']
  },
  {
    id: 'mix-post-close-chart',
    tags: ['journal', 'discipline', 'edge'],
    title: 'Снимок графика после сделки',
    takeaway:
      'Цифра PnL не хранит то, что ты видел на экране: расположение стопа относительно структуры, характер входной свечи, совпадение с killzone и планом play.',
    directions: [
      'Сразу после закрытия сделай скрин с разметкой (хотя бы линии зоны и отметка выхода) — через сутки память уже «дорисует» выгодную версию.',
      'На дистанции скрины связывают результат с визуальным edge: видно, был ли set-up похож на учебный или ты подменил процесс оправданием.',
      'Это не «красота журнала», а страховка от самообмана при разборе серии.'
    ],
    sourceRefs: ['mm-vic-02']
  },
  {
    id: 'vic-risk-accept',
    tags: ['risk', 'discipline', 'tilt'],
    title: 'Принять риск до кнопки',
    takeaway:
      'Risk acceptor проживает худший сценарий до входа; убыток — статья расходов серии, а не «несправедливость мира».',
    directions: [
      'Если мысль о полном стопе ломает — урежь размер или не входи.',
      'Не строить самооценку на исходе одной сделки.'
    ],
    sourceRefs: ['mm-vic-03']
  },
  {
    id: 'vic-strategy-world',
    tags: ['discipline', 'edge', 'general'],
    title: 'Стратегия как искусственные правила',
    takeaway:
      'Правила ограничивают хаос рынка и дают петлю обратной связи: правила → действие → рынок → корректировка.',
    directions: [
      'Смотреть на чужую стратегию как на карту решений, а не только на PnL.',
      'Разрешать эволюцию правил по данным.'
    ],
    sourceRefs: ['mm-vic-04']
  },
  {
    id: 'vic-static-dynamic',
    tags: ['edge', 'discipline'],
    title: 'Статика vs динамика в анализе',
    takeaway:
      'Жёсткие правила vs факторный разбор — не «хорошо/плохо», а что работает на тебе и сколько времени у экрана.',
    directions: [
      'Понимать цену каждого подхода: скучная роботность vs длинная дорога к стабильности в динамике.',
      'Комбинировать базу и факторы осознанно.'
    ],
    sourceRefs: ['mm-vic-05']
  },
  {
    id: 'mix-fomo-chase',
    tags: ['psych', 'discipline', 'tilt'],
    title: 'FOMO и догон импульса',
    takeaway:
      'Готовность к развилкам и отказ от «последней электрички» снижает импульсивные входы; догон после импульса часто даёт поздний риск.',
    directions: [
      'Продумать заранее, как себя чувствуешь, если цена уйдёт без тебя или развернётся после входа.',
      'Не брать сделку «в воздухе» после выноса без зоны и плана.'
    ],
    sourceRefs: ['mm-vic-06', 'abu-ruf-05']
  },
  {
    id: 'vic-anxiety-notes',
    tags: ['psych', 'journal', 'discipline'],
    title: 'Тревога и выгрузка в текст',
    takeaway:
      'Письменно формулировать навязчивые мысли снижает их власть; дневник вечером отсекает большую часть шума.',
    directions: [
      'При первых признаках тревоги — вынести мысли в заметку.',
      'Отделять реальную проблему от «крутится в голове».'
    ],
    sourceRefs: ['mm-vic-07']
  },
  {
    id: 'ruf-market-context',
    tags: ['risk', 'market', 'discipline'],
    title: 'Контекст рынка и «ралли облегчения»',
    takeaway:
      'Фон, накопление и волатильность важнее FOMO; спекуляция со стопами и планом отличается от набора «на эйфории».',
    directions: [
      'Не смешивать долгосрок и краткосрочные идеи без отдельного плана.',
      'Помнить про разгрузку ликвидности после сильных импульсов.'
    ],
    sourceRefs: ['abu-ruf-01']
  },
  {
    id: 'ruf-wisdom-pain',
    tags: ['discipline', 'journal'],
    title: 'Мудрость из опыта, не из цитаты',
    takeaway:
      'Фразы вроде «торгуй по тренду» обретают смысл только после цены ошибок; книги не подменяют прожитую серию на рынке.',
    directions: [
      'Усваивать убыток как плату за обучение, а не как повод отыгрываться.',
      'Строить выводы на своей статистике.'
    ],
    sourceRefs: ['abu-ruf-02', 'abu-ruf-03']
  },
  {
    id: 'ruf-revenge-lost',
    tags: ['tilt', 'psych', 'discipline'],
    title: 'Отыгрыш и принятие потери',
    takeaway:
      'Что потеряно — потеряно; отыгрыш раздувает серию ошибок. Лучше рестарт с меньшим размером и холодной головой.',
    directions: [
      'После стопа — пауза по правилам, не «доказать рынку».',
      'Разделить эмоцию и следующий сетап.'
    ],
    sourceRefs: ['abu-ruf-04']
  },
  {
    id: 'ruf-profit-exit',
    tags: ['risk', 'discipline'],
    title: 'Фиксация прибыли и выход до сделки',
    takeaway:
      'План выхода задаётся до входа; «ещё чуть-чуть» без уровня возвращает прибыль рынку.',
    directions: [
      'Прописать хотя бы один сценарий фиксации заранее.',
      'Не пересиживать выполненный план из жадности.'
    ],
    sourceRefs: ['abu-ruf-06', 'abu-ruf-13']
  },
  {
    id: 'ruf-structure-filter',
    tags: ['discipline', 'edge', 'overtrade'],
    title: 'Нет структуры — нет сетапа',
    takeaway:
      'Диапазон и отсутствие импульса не обязаны превращаться в сделки из скуки; фильтр режет львиную долю лишних потерь.',
    directions: [
      'Дождаться импульса, отката и реакции в зоне.',
      'Отмечать в журнале «нет сетапа» как нормальный исход дня.'
    ],
    sourceRefs: ['abu-ruf-07', 'abu-ruf-14']
  },
  {
    id: 'ruf-process-people',
    tags: ['journal', 'discipline', 'general'],
    title: 'Процесс и окружение',
    takeaway:
      'Один перед графиком дольше топчешься в тех же ловушках; обмен идеями в моменте ускоряет насмотренность.',
    directions: [
      'Сравнивать свои допущения с чужой разметкой без копирования слепо.',
      'Делать упор на процесс, а не на героический одиночный сетап.'
    ],
    sourceRefs: ['abu-ruf-08', 'abu-ruf-12']
  },
  {
    id: 'mix-discipline-life',
    tags: ['discipline', 'psych', 'general'],
    title: 'Дисциплина на графике и в жизни',
    takeaway:
      'Рынок усиливает черты: спешка, жадность, бесистемность видны в сделках и со временем переносятся в быт.',
    directions: [
      'Ловить в журнале повтор импульсивности, а не только уровни.',
      'Укреплять спокойные решения вне экрана как поддержку процесса.'
    ],
    sourceRefs: ['abu-ruf-09', 'mm-vic-02']
  },
  {
    id: 'ruf-horizon-taleb',
    tags: ['general', 'risk', 'discipline'],
    title: 'Длинный горизонт и случайность',
    takeaway:
      'Рынок 24/7 не про «быстрые проценты», а про понимание потока ликвидности; удачу путать с мастерством опасно (Талеб).',
    directions: [
      'Платят за терпение совпадения метода и фазы рынка.',
      'Готовиться встречать удачу холодной головой и кэшем.'
    ],
    sourceRefs: ['abu-ruf-10', 'abu-ruf-15']
  },
  {
    id: 'ruf-burnout-structure',
    tags: ['psych', 'discipline', 'overtrade'],
    title: 'Выгорание и структура',
    takeaway:
      'Перегруз чаще от ловли каждого движения и бесструктурных активов; система и люди рядом удерживают фокус.',
    directions: [
      'Сужать список инструментов до тех, где есть логика твоего метода.',
      'Трактовать выгорание как сигнал поломки процесса.'
    ],
    sourceRefs: ['abu-ruf-11', 'mm-vic-07']
  },
  {
    id: 'ruf-greed-stability',
    tags: ['risk', 'discipline'],
    title: 'Жадность vs стабильность на дистанции',
    takeaway:
      'Выжать максимум из одной сделки ломает кривую; стабильность — там, где контролируется жадность и есть дневник.',
    directions: [
      'Фиксировать жадные моменты в журнале отдельным тегом.',
      'Мыслить месяцами капитала, а не одним закрытием.'
    ],
    sourceRefs: ['abu-ruf-13']
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
