/**
 * Правила «наставника» без LLM: сигналы из данных журнала + заранее заданные тексты.
 */
import dayjs from 'dayjs';
import { pickAdviceForBeaconsAndStances } from './adviceCorpus.js';
import { getTradeSource } from './utils.js';
import { getDisciplineScore, getOpenRisk, getPeriodPnL, tradeHasChartAttachment } from './risk.js';

/** Закрытые ручные сделки за окно: всего и сколько с хотя бы одним вложением. */
function manualAttachmentWindow(closedTrades, days) {
  if (!Array.isArray(closedTrades) || days < 1) return { manual: 0, withAny: 0, missing: 0 };
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  let manual = 0;
  let withAny = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    if (dayjs(t.dateClose).isBefore(start)) continue;
    if (getTradeSource(t) !== 'manual') continue;
    manual += 1;
    const n = Array.isArray(t.attachments) ? t.attachments.filter(Boolean).length : 0;
    if (n > 0) withAny += 1;
  }
  return { manual, withAny, missing: manual - withAny };
}

/** Закрытые за N дней: сколько без картинки графика во вложениях. */
function chartImageMissingWindow(closedTrades, days) {
  if (!Array.isArray(closedTrades) || days < 1) return { n: 0, missing: 0 };
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  let n = 0;
  let missing = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    if (dayjs(t.dateClose).isBefore(start)) continue;
    n += 1;
    if (!tradeHasChartAttachment(t)) missing += 1;
  }
  return { n, missing };
}

/** День считается «с дневником», если есть содержательная запись. */
export function dayJournalHasContent(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const t = (s) => String(s || '').trim();
  if (t(entry.mood)) return true;
  if (t(entry.plan).length > 15) return true;
  if (t(entry.review).length > 25) return true;
  if (t(entry.lessons).length > 15) return true;
  const ch = entry.checklist && typeof entry.checklist === 'object' ? entry.checklist : {};
  return Object.values(ch).some((v) => v === true);
}

/** Сколько дней за последние `lookbackDays` имели запись в дневнике. */
export function countJournalDaysRecent(dayJournalMap, lookbackDays = 14) {
  if (!dayJournalMap || typeof dayJournalMap !== 'object') return 0;
  let n = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const key = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    if (dayJournalHasContent(dayJournalMap[key])) n += 1;
  }
  return n;
}

export function countClosedInLastDays(closedTrades, days) {
  if (!Array.isArray(closedTrades) || days < 1) return 0;
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  return closedTrades.filter((t) => {
    if (t?.status !== 'closed' || !t?.dateClose) return false;
    return !dayjs(t.dateClose).isBefore(start);
  }).length;
}

/** Сколько закрытых за последние `days` имели нарушение с кодом `code`. */
function countTradesWithViolationCode(closedTrades, days, code) {
  if (!Array.isArray(closedTrades) || !code || days < 1) return 0;
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  let n = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    if (dayjs(t.dateClose).isBefore(start)) continue;
    const arr = t.ruleViolations;
    if (!Array.isArray(arr)) continue;
    if (arr.some((v) => v && typeof v === 'object' && String(v.code || '').trim() === code)) n += 1;
  }
  return n;
}

/**
 * Ключи состояния для полосы «общий взгляд» в аналитике.
 * @returns {{ id: string; title: string; level: 'ok'|'watch'|'warn'|'danger'; blurb: string }[]}
 */
export function computeAnalyticsStances(ctx) {
  const {
    dailyStopHit,
    cooldownActive,
    profileLossStreakHit,
    streak,
    todayPnL,
    overtradeRisk,
    discipline,
    nClosed,
    journal7,
    journal14,
    openRisk,
    open,
    riskShareSl,
    maxOpenProfile,
    ddPct,
    closed7,
    maxPerDay,
    weekPnL,
    monthPnL,
    capital,
    weekLossShare,
    monthLossShare
  } = ctx;

  const lossStreak = streak.kind === 'loss' ? streak.length : 0;
  const tp = todayPnL != null && Number.isFinite(Number(todayPnL)) ? Number(todayPnL) : null;
  const discTotal = Number(discipline?.total) || 0;
  const discScore = Number(discipline?.score) || 0;
  const paceHeavy = maxPerDay > 0 && closed7 > maxPerDay * 5;
  const paceMid = maxPerDay > 0 && closed7 > maxPerDay * 3;

  let tiltLevel = 'ok';
  let tiltBlurb = 'Импульс и эмоции в норме';
  if (dailyStopHit || cooldownActive || profileLossStreakHit || lossStreak >= 4) {
    tiltLevel = 'danger';
    tiltBlurb = 'Стоп дня, пауза или длинная серия минусов';
  } else if (lossStreak >= 2 && tp != null && tp < 0 && !dailyStopHit) {
    tiltLevel = 'danger';
    tiltBlurb = 'Красный день на фоне серии минусов';
  } else if (lossStreak >= 3) {
    tiltLevel = 'warn';
    tiltBlurb = 'Длинная серия минусов — снизь темп и выпиши причину';
  } else if (lossStreak >= 2) {
    tiltLevel = 'warn';
    tiltBlurb = 'Несколько минусов подряд — зона импульса';
  } else if (lossStreak >= 1 && tp != null && tp < 0) {
    tiltLevel = 'watch';
    tiltBlurb = 'Минус дня после минуса — второй вход только по правилам';
  }

  let gamLevel = 'ok';
  let gamBlurb = 'Темп не похож на игру ради процесса';
  if ((paceHeavy && discScore < 62 && discTotal >= 10) || (overtradeRisk && discScore < 60 && discTotal >= 10)) {
    gamLevel = 'danger';
    gamBlurb = 'Высокий темп при слабой дисциплине — риск лудомании';
  } else if (overtradeRisk || (discTotal >= 12 && discScore < 58)) {
    gamLevel = 'danger';
    gamBlurb = 'Переторговка или частые нарушения плейбука';
  } else if (paceHeavy || (discTotal >= 8 && discScore < 65)) {
    gamLevel = 'warn';
    gamBlurb = 'Много сделок или заметные отходы от правил';
  } else if (paceMid || (discTotal >= 6 && discScore < 72)) {
    gamLevel = 'watch';
    gamBlurb = 'Повышенный темп входов';
  }

  let jLevel = 'ok';
  let jBlurb = 'Журнал поддерживает решения';
  if (nClosed >= 14 && journal7 === 0 && journal14 <= 1) {
    jLevel = 'danger';
    jBlurb = 'Почти нет записей при большой выборке сделок';
  } else if (nClosed >= 15 && journal14 < 3) {
    jLevel = 'warn';
    jBlurb = 'Мало дней с содержательным дневником';
  } else if (nClosed >= 8 && journal7 <= 1) {
    jLevel = 'watch';
    jBlurb = 'Слабая опора в журнале на неделе';
  }

  let pLevel = 'ok';
  let pBlurb = 'Исполнение близко к плану';
  if (discTotal >= 15 && discScore < 58) {
    pLevel = 'danger';
    pBlurb = 'Много сделок с нарушениями плейбука';
  } else if (discTotal >= 10 && discScore < 65) {
    pLevel = 'warn';
    pBlurb = 'Заметный разрыв плана и факта';
  } else if (discTotal >= 6 && discScore < 72) {
    pLevel = 'watch';
    pBlurb = 'Есть отходы от системы';
  }

  let rLevel = 'ok';
  let rBlurb = 'Открытый риск выглядит сдержанно';
  if (open.length && openRisk.withoutSlCount > 0) {
    rLevel = 'danger';
    rBlurb = 'Есть позиции без SL';
  } else if (riskShareSl >= 0.18) {
    rLevel = 'danger';
    rBlurb = 'Очень высокий суммарный риск по SL';
  } else if (maxOpenProfile > 0 && open.length >= maxOpenProfile) {
    rLevel = 'warn';
    rBlurb = 'На потолке по числу позиций';
  } else if (riskShareSl >= 0.11) {
    rLevel = 'warn';
    rBlurb = 'Повышенная доля капитала под SL';
  } else if (open.length && riskShareSl >= 0.06) {
    rLevel = 'watch';
    rBlurb = 'Следи за кластером позиций';
  }

  let eLevel = 'ok';
  let eBlurb = 'Просадка и недельный тренд спокойные';
  if (ddPct >= 18) {
    eLevel = 'danger';
    eBlurb = 'Глубокая просадка по журналу';
  } else if (ddPct >= 10 && streak.kind === 'loss' && lossStreak >= 2) {
    eLevel = 'danger';
    eBlurb = 'Просадка и минусовая серия одновременно';
  } else if (ddPct >= 10) {
    eLevel = 'warn';
    eBlurb = 'Выраженная просадка эквити';
  } else if (capital > 0 && monthPnL < 0 && monthLossShare >= 0.04 && nClosed >= 18) {
    eLevel = 'warn';
    eBlurb = 'Тяжёлый месяц относительно капитала';
  } else if (ddPct >= 7) {
    eLevel = 'watch';
    eBlurb = 'Просадка заметна — усиль фильтр';
  } else if (capital > 0 && weekPnL < 0 && weekLossShare >= 0.02 && nClosed >= 10) {
    eLevel = 'watch';
    eBlurb = 'Неделя давит на депозит';
  }

  let oLevel = 'ok';
  let oBlurb = 'Нагрузка и рефлексия сбалансированы';
  if (closed7 >= 12 && journal7 <= 1 && nClosed >= 15) {
    oLevel = 'danger';
    oBlurb = 'Много сделок без опоры в дневнике';
  } else if (overtradeRisk || (closed7 >= 10 && journal7 <= 1)) {
    oLevel = 'warn';
    oBlurb = 'Плотная неделя или переторговка при слабом журнале';
  } else if (closed7 >= 7 && journal7 <= 2) {
    oLevel = 'watch';
    oBlurb = 'Высокий темп — добавь паузы и разбор';
  }

  return [
    { id: 'impulse_tilt', title: 'Тильт', level: tiltLevel, blurb: tiltBlurb },
    { id: 'gambling_process', title: 'Лудомания', level: gamLevel, blurb: gamBlurb },
    { id: 'journal_slack', title: 'Лень к разбору', level: jLevel, blurb: jBlurb },
    { id: 'playbook_gap', title: 'Дисциплина', level: pLevel, blurb: pBlurb },
    { id: 'risk_load', title: 'Риск счёта', level: rLevel, blurb: rBlurb },
    { id: 'equity_stress', title: 'Просадка', level: eLevel, blurb: eBlurb },
    { id: 'overload', title: 'Перегруз', level: oLevel, blurb: oBlurb }
  ];
}

/**
 * @param {object} input
 * @param {any[]} input.closedTrades
 * @param {any[]} input.openTrades
 * @param {object} input.profile
 * @param {Record<string, any>} input.dayJournalMap
 * @param {object} input.stats — результат calculateStats
 * @param {{ kind: string; length: number; sum: number }} input.streak — getCurrentStreak
 * @param {boolean} input.dailyStopHit
 * @param {boolean} input.cooldownActive
 * @param {number|null} input.todayPnL — getDailyPnL
 */
export function buildMentorPack(input) {
  const closed = Array.isArray(input.closedTrades) ? input.closedTrades : [];
  const open = Array.isArray(input.openTrades) ? input.openTrades : [];
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const stats = input.stats && typeof input.stats === 'object' ? input.stats : {};
  const streak = input.streak || { kind: 'none', length: 0, sum: 0 };
  const dayMap = input.dayJournalMap && typeof input.dayJournalMap === 'object' ? input.dayJournalMap : {};
  const discipline = getDisciplineScore(closed);

  const nClosed = closed.length;
  const journal7 = countJournalDaysRecent(dayMap, 7);
  const journal14 = countJournalDaysRecent(dayMap, 14);
  const closed7 = countClosedInLastDays(closed, 7);
  const closed30 = countClosedInLastDays(closed, 30);

  const m30 = manualAttachmentWindow(closed, 30);
  const manualAttachRate30 = m30.manual > 0 ? m30.withAny / m30.manual : null;

  const capital = Number(profile.initialCapital) || 0;
  const openRisk = getOpenRisk(open, profile);
  const weekPnL = getPeriodPnL(closed, 'week');
  const monthPnL = getPeriodPnL(closed, 'month');

  const maxPerDay = Number(profile.maxTradesPerDay) || 0;
  const overtradeRisk = maxPerDay > 0 && closed7 > maxPerDay * 5;

  const maxConsecLossProfile = Number(profile.maxConsecutiveLosses) || 0;
  const maxOpenProfile = Number(profile.maxOpenTrades) || 0;
  const profileLossStreakHit =
    maxConsecLossProfile > 0 &&
    streak.kind === 'loss' &&
    streak.length >= maxConsecLossProfile;

  const riskShareSl =
    capital > 0 && openRisk.totalRisk > 0 ? openRisk.totalRisk / capital : 0;

  const weekLossShare = capital > 0 && weekPnL < 0 ? -weekPnL / capital : 0;
  const monthLossShare = capital > 0 && monthPnL < 0 ? -monthPnL / capital : 0;

  const biasAgainstWeek = countTradesWithViolationCode(closed, 7, 'against-bias');
  const sharpe = Number(stats.sharpeRatio) || 0;

  const ddPct = Number(stats.maxDrawdownPercent) || 0;
  const ddHard = ddPct >= 18;
  const ddWarn = ddPct >= 10 && ddPct < 18;

  const winRate = Number(stats.winRate) || 0;
  const expectancy = Number(stats.expectancy) || 0;

  const grindZone =
    nClosed >= 28 &&
    winRate >= 40 &&
    winRate <= 62 &&
    expectancy <= 0 &&
    expectancy > -Math.max(capital * 0.0015, 1);

  /** @type {{ priority: number; tone: 'danger'|'warn'|'calm'|'good'; title: string; body: string[]; tag: string }[]} */
  const beacons = [];

  if (input.dailyStopHit) {
    beacons.push({
      priority: 100,
      tone: 'danger',
      tag: 'daily_stop',
      title: 'Стоп дня: торговля уже заблокирована',
      body: [
        'Дневной лимит убытка сработал — это не поражение системы, а срабатывание предохранителя.',
        'Сейчас задача не «отбить», а сохранить ясность: короткая запись в дневнике — что привело к серии и что завтра изменишь в процессе.'
      ]
    });
  } else if (input.cooldownActive) {
    beacons.push({
      priority: 95,
      tone: 'warn',
      tag: 'cooldown',
      title: 'Режим паузы (cooldown)',
      body: [
        'После минуса включена пауза — это защита от revenge-trade.',
        'Пока таймер активен: не ищи вход «чтобы вернуть». Зафиксируй эмоцию и правило входа на следующую сессию в дневнике.'
      ]
    });
  }

  if (profileLossStreakHit) {
    beacons.push({
      priority: 94,
      tone: 'danger',
      tag: 'profile_loss_cap',
      title: `Лимит серии убытков из профиля (${maxConsecLossProfile} подряд)`,
      body: [
        `Сейчас ${streak.length} минусов подряд — ты сам задавал это ограничение как стоп-кран.`,
        'Не расширяй правило «на сегодня»: зафиксируй в дневнике триггер серии и условие возврата к обычному риску (например, после одного нейтрального дня).'
      ]
    });
  }

  if (open.length && openRisk.withoutSlCount > 0) {
    beacons.push({
      priority: 83,
      tone: 'warn',
      tag: 'open_no_sl',
      title:
        openRisk.withoutSlCount === 1
          ? 'Одна открытая позиция без SL'
          : `${openRisk.withoutSlCount} открытых позиций без SL`,
      body: [
        'Риск без стопа не ограничен цифрой — это главный источник «неожиданных» просадок и импульсивных решений.',
        'Если позиция принципиально без SL — пропиши в заметках к сделке правило выхода по времени/структуре и проверь размер так, чтобы он терпим.'
      ]
    });
  }

  if (capital > 0 && openRisk.withSlCount > 0 && riskShareSl >= 0.18) {
    beacons.push({
      priority: 68,
      tone: 'warn',
      tag: 'aggregate_sl_risk',
      title: `Суммарный риск по SL ≈ ${(riskShareSl * 100).toFixed(1)}% от капитала в профиле`,
      body: [
        'Несколько позиций с одновременным срабатыванием SL могут дать удар сильнее, чем кажется по одной сделке.',
        'Проверь корреляцию пар и лимит одновременных сценариев; при необходимости уменьши объём или число активных идей.'
      ]
    });
  } else if (capital > 0 && openRisk.withSlCount > 0 && riskShareSl >= 0.11) {
    beacons.push({
      priority: 56,
      tone: 'calm',
      tag: 'aggregate_sl_risk_soft',
      title: `Суммарный риск по SL около ${(riskShareSl * 100).toFixed(1)}% капитала`,
      body: [
        'Это ещё нормальная зона для многих систем, но уже повод не добавлять третью коррелированную идею без осознанности.',
        'Кратко выпиши в дневнике: какие позиции считаются одним «кластером» риска.'
      ]
    });
  }

  if (maxOpenProfile > 0 && open.length >= maxOpenProfile) {
    beacons.push({
      priority: 52,
      tone: 'warn',
      tag: 'max_open',
      title: `Открытых позиций: ${open.length} (лимит профиля ${maxOpenProfile})`,
      body: [
        'На потолке по числу позиций качество фильтрации обычно падает — хочется «добрать» идею любой ценой.',
        'Новый вход имеет смысл только если он явно сильнее худшей из уже открытых; иначе управляй тем, что есть.'
      ]
    });
  }

  if (nClosed >= 10 && capital > 0 && weekPnL < 0 && weekLossShare >= 0.02) {
    beacons.push({
      priority: 60,
      tone: 'warn',
      tag: 'week_red',
      title: `Неделя в минусе (~${weekPnL.toFixed(2)} у.е., ≈${(weekLossShare * 100).toFixed(1)}% капитала)`,
      body: [
        'Короткая полоса минуса — нормальная часть игры с положительным ожиданием; важно не удвоить ставку.',
        'Сравни эту неделю с предыдущей: изменился рынок или ты изменил поведение (время, объём, фильтр)?'
      ]
    });
  }

  if (nClosed >= 18 && capital > 0 && monthPnL < 0 && monthLossShare >= 0.04) {
    beacons.push({
      priority: 66,
      tone: 'warn',
      tag: 'month_red',
      title: `Месяц в минусе (~${monthPnL.toFixed(2)} у.е., ≈${(monthLossShare * 100).toFixed(1)}% капитала)`,
      body: [
        'Если минус месяца совпадает с ростом нарушений или числа сделок — это про процесс, не про «неудачный рынок».',
        'Сделай паузу на постановку одной гипотезы улучшения (один параметр) и проверяй её следующие 2 недели.'
      ]
    });
  }

  if (closed7 >= 5 && biasAgainstWeek >= 3) {
    beacons.push({
      priority: 53,
      tone: 'warn',
      tag: 'bias_violations',
      title: `${biasAgainstWeek} сделок за 7 дней с пометкой «против bias»`,
      body: [
        'Повторяющиеся входы против направления старшего контекста часто дают худший профиль убытков.',
        'Если это осознанная контртрендовая система — ок; если нет, усиль фильтр: торговать только по направлению bias или с явным структурным обоснованием.'
      ]
    });
  }

  if (grindZone) {
    beacons.push({
      priority: 38,
      tone: 'calm',
      tag: 'grind',
      title: 'Похоже на фазу «боковика» по журналу',
      body: [
        `Около ${winRate.toFixed(1)}% wins при почти нулевом ожидании на сделку — типичная зона, где рынок «не платит» за шум.`,
        'Имеет смысл сузить A+: меньше пар, жёстче триггер входа или пауза до понятного трендового дня недели.'
      ]
    });
  }

  if (nClosed >= 24 && sharpe < -0.35) {
    beacons.push({
      priority: 36,
      tone: 'calm',
      tag: 'sharpe_soft',
      title: 'Низкое отношение средней к волатильности результатов (Sharpe)',
      body: [
        'При высоком разбросе результатов по сделкам «чуть в плюсе» и «чуть в минусе» ощущается как качели.',
        'Проверь размер позиции и число сделок в одинаковых условиях — часто стабильнее меньше сделок с тем же edge.'
      ]
    });
  }

  if (closed30 >= 12 && discipline.total >= 10 && discipline.score >= 85 && winRate >= 52 && expectancy > 0) {
    beacons.push({
      priority: 28,
      tone: 'good',
      tag: 'discipline_edge',
      title: 'Сильная дисциплина и положительное ожидание',
      body: [
        `Большая доля «чистых» сделок (${discipline.score.toFixed(0)}%) при WR ~${winRate.toFixed(1)}% — хороший маркер процесса.`,
        'Не ослабляй фильтр из-за комфорта: следующий шаг — масштаб только после стабильности на том же наборе правил.'
      ]
    });
  }

  if (streak.kind === 'loss' && streak.length >= 4) {
    beacons.push({
      priority: 88,
      tone: 'danger',
      tag: 'loss_streak',
      title: `Серия убытков: ${streak.length} подряд`,
      body: [
        `Сумма серии около ${Number(streak.sum).toFixed(2)} у.е. по журналу — рынок допускает такие полосы.`,
        'Маяк: снизь частоту или размер до восстановления серии «нейтральных» дней. Один фокус — исполнение плана, не результат одной сделки.'
      ]
    });
  } else if (streak.kind === 'loss' && streak.length >= 2) {
    beacons.push({
      priority: 72,
      tone: 'warn',
      tag: 'loss_streak_soft',
      title: `${streak.length} убытка подряд`,
      body: [
        'Это ещё не обязательно тильт, но зона повышенной импульсивности.',
        'Перед следующим входом: проверь плейбук и killzone — если условия «на троечку», лучше пропуск.'
      ]
    });
  }

  if (ddHard) {
    beacons.push({
      priority: 78,
      tone: 'danger',
      tag: 'drawdown_deep',
      title: `Просадка по журналу около ${ddPct.toFixed(1)}% от пика эквити`,
      body: [
        'Глубокая просадка — время упростить: меньше инструментов, строже фильтр сетапов.',
        'Запиши в дневнике один параметр, который готов соблюдать 2 недели (например, не торговать первые 30 мин после новости).'
      ]
    });
  } else if (ddWarn && streak.kind === 'loss') {
    beacons.push({
      priority: 58,
      tone: 'warn',
      tag: 'drawdown_watch',
      title: `Просадка ${ddPct.toFixed(1)}% и минусовая серия`,
      body: [
        'Комбинация просадки и серии минусов заслуживает паузы или снижения риска.',
        'Сравни последние убыточные сделки: одна и та же ошибка повторяется? Если да — точечное правило в плейбук.'
      ]
    });
  }

  if (overtradeRisk) {
    beacons.push({
      priority: 55,
      tone: 'warn',
      tag: 'pace',
      title: 'Высокий темп сделок за неделю',
      body: [
        `За 7 дней закрыто ${closed7} сделок при лимите ${maxPerDay}/день в профиле — возможна переторговка.`,
        'Маяк: добавь обязательную паузу между сделками или лимит «не более N на сессию».'
      ]
    });
  }

  const todayPnL = input.todayPnL != null ? Number(input.todayPnL) : null;
  if (
    !input.dailyStopHit &&
    todayPnL != null &&
    Number.isFinite(todayPnL) &&
    todayPnL < 0 &&
    streak.kind === 'loss' &&
    streak.length >= 2
  ) {
    beacons.push({
      priority: 62,
      tone: 'warn',
      tag: 'day_red',
      title: 'День в минусе при серии минусов',
      body: [
        `Сегодня в сумме около ${todayPnL.toFixed(2)} у.е. — не добавляй позиций «на откуп» без плана.`,
        'Закрой торговый блок коротким итогом в дневнике: что сработало / что нет — одним абзацем.'
      ]
    });
  }

  if (discipline.total >= 8 && discipline.score < 65) {
    beacons.push({
      priority: 52,
      tone: 'warn',
      tag: 'discipline',
      title: 'Много сделок с нарушениями гейта',
      body: [
        `Средний балл дисциплины ~${discipline.score.toFixed(0)}% — блокировки (BLOCK) сильнее тянут метрику вниз, чем предупреждения (WARN).`,
        'Выбери одно правило недели и отмечай только его; упрощение повышает соблюдение.'
      ]
    });
  }

  const ch14 = chartImageMissingWindow(closed, 14);
  if (
    profile.postCloseChartReminderEnabled !== false &&
    ch14.n >= 5 &&
    ch14.missing / ch14.n >= 0.55
  ) {
    beacons.push({
      priority: 43,
      tone: 'calm',
      tag: 'post_close_chart',
      title: 'Много закрытых без скрина графика (14 дн.)',
      body: [
        `Около ${((100 * ch14.missing) / ch14.n).toFixed(0)}% закрытых за две недели без изображения — визуальный контекст теряется быстрее памяти.`,
        'Скрин сразу после выхода фиксирует то, что было на экране: зона, структура, таймфрейм. Без него пост-анализ легко превращается в рационализацию цифры PnL.'
      ]
    });
  }

  if (nClosed >= 15 && journal14 < 3) {
    beacons.push({
      priority: 48,
      tone: 'calm',
      tag: 'journal_gap',
      title: 'Мало записей в дневнике при большой выборке сделок',
      body: [
        `Закрытых сделок уже ${nClosed}, но за 14 дней мало дней с содержательным дневником.`,
        'Рефлексия без записей теряется — 5 минут после сессии резко повышают качество решений на следующей неделе.'
      ]
    });
  }

  if (
    m30.manual >= 2 &&
    manualAttachRate30 != null &&
    manualAttachRate30 < 0.5
  ) {
    const strict = m30.manual >= 4 && manualAttachRate30 < 0.35;
    beacons.push({
      priority: strict ? 47 : 44,
      tone: 'calm',
      tag: 'manual_no_attachments',
      title:
        m30.manual <= 3 && m30.missing === m30.manual
          ? `Ручные закрытые за 30 дн.: ни одного вложения (${m30.manual})`
          : `Мало скринов/файлов у ручных сделок (${m30.missing} без вложений из ${m30.manual} за 30 дн.)`,
      body: [
        'Сделки из MT5 уже попадают как история брокера; ручные записи — место для контекста: до/после, зона, триггер, план.',
        'Цель: у каждой значимой ручной закрытой хотя бы одно вложение — разбор позже будет быстрее и честнее.'
      ]
    });
  }

  if (streak.kind === 'win' && streak.length >= 3 && beacons.every((b) => b.priority < 70)) {
    beacons.push({
      priority: 12,
      tone: 'good',
      tag: 'momentum',
      title: `Серия побед: ${streak.length}`,
      body: [
        'Серия плюсов разгоняет уверенность — держи тот же процесс, не раздувай риск.',
        'Зафиксируй в дневнике, что именно совпало с планом (не только результат).'
      ]
    });
  } else if (beacons.length === 0) {
    beacons.push({
      priority: 10,
      tone: 'good',
      tag: 'steady',
      title: 'Спокойная фаза',
      body: [
        'Явных красных флагов по журналу сейчас нет — хорошее окно для спокойной работы по плану.',
        'Поддерживай ритм дневника: даже короткая заметка помогает не потерять нить при следующей полосе.'
      ]
    });
  }

  beacons.sort((a, b) => b.priority - a.priority);
  const topBeacons = beacons.slice(0, 7);

  const stances = computeAnalyticsStances({
    dailyStopHit: !!input.dailyStopHit,
    cooldownActive: !!input.cooldownActive,
    profileLossStreakHit,
    streak,
    todayPnL: input.todayPnL,
    overtradeRisk,
    discipline,
    nClosed,
    journal7,
    journal14,
    openRisk,
    open,
    riskShareSl,
    maxOpenProfile,
    ddPct,
    closed7,
    maxPerDay,
    weekPnL,
    monthPnL,
    capital,
    weekLossShare,
    monthLossShare
  });

  const advicePick = pickAdviceForBeaconsAndStances(
    topBeacons.map((b) => b.tag),
    stances,
    6
  );

  const roadmap = [
    {
      id: 'sample',
      title: 'База наблюдений',
      hint: 'минимум 10 закрытых сделок в журнале',
      done: nClosed >= 10
    },
    {
      id: 'journal',
      title: 'Регулярная рефлексия',
      hint: '≥3 дня с дневником за последние 7 дней',
      done: journal7 >= 3
    },
    {
      id: 'manual_attach',
      title: 'Вложения у ручных сделок',
      hint: '≥70% закрытых ручных за 30 дн. с хотя бы одним файлом (если таких ≥3)',
      done: m30.manual < 3 || manualAttachRate30 == null || manualAttachRate30 >= 0.7
    },
    {
      id: 'risk_frame',
      title: 'Рамка риска',
      hint: 'капитал + хотя бы один явный лимит (риск на сделку, день или число сделок)',
      done:
        Number(profile.initialCapital) > 0 &&
        (Number(profile.riskPerTradePercent) > 0 ||
          Number(profile.riskPerTradeAmount) > 0 ||
          maxPerDay > 0 ||
          Number(profile.dailyLossLimitPercent) > 0 ||
          Number(profile.dailyLossLimitAmount) > 0)
    },
    {
      id: 'open_sl',
      title: 'Ограниченный риск на открытом',
      hint: 'нет открытых или у каждой позиции задан SL',
      done: open.length === 0 || openRisk.withoutSlCount === 0
    },
    {
      id: 'discipline',
      title: 'Чистое исполнение',
      hint: '≥70% сделок без нарушений плейбука (от 15 сделок)',
      done: discipline.total >= 15 && discipline.score >= 70
    },
    {
      id: 'drawdown',
      title: 'Устойчивость к просадкам',
      hint: 'историческая просадка журнала ниже 15% или мало сделок (<20)',
      done: nClosed < 20 || ddPct < 15
    },
    {
      id: 'expectancy',
      title: 'Ожидание в плюс',
      hint: 'ожидание на сделку > 0 при ≥30 закрытых',
      done: nClosed < 30 || expectancy > 0
    }
  ];

  const doneCount = roadmap.filter((r) => r.done).length;
  const roadmapLen = roadmap.length;
  let phase = 'Старт';
  if (doneCount >= Math.max(roadmapLen - 1, 6)) phase = 'Устойчивый процесс';
  else if (doneCount >= 4) phase = 'Выстраивание дисциплины';
  else if (doneCount >= 1) phase = 'Формирование базы';

  const headline =
    nClosed < 5
      ? 'Мало данных для жёстких выводов — собирай сделки и короткие заметки в дневнике.'
      : `Фаза: «${phase}». Закрытых сделок: ${nClosed}. Win rate журнала: ${winRate.toFixed(1)}%.`;

  let reflectionPrompt =
    streak.kind === 'loss' && streak.length >= 2
      ? 'Что общего у последних минусовых сделок: время, пара, эмоция, отклонение от плана? Одно предложение.'
      : journal7 < 2
        ? 'Что ты хочешь повторить завтра из сегодняшней сессии — даже если результат дня нейтральный?'
        : 'Какой один фильтр входа ты усилишь на следующей неделе — и как проверишь, что он соблюдён?';

  if (open.length && openRisk.withoutSlCount > 0) {
    reflectionPrompt =
      'Для каждой открытой без SL: где точка инвалидизации и что ты сделаешь, если цена туда дойдёт? Одно предложение на позицию.';
  } else if (profileLossStreakHit) {
    reflectionPrompt =
      'Какое одно действие ты предпримешь до следующей сессии, чтобы не игнорировать свой же лимит серии убытков?';
  } else if (grindZone) {
    reflectionPrompt =
      'Какой один тип сетапа ты временно отключаешь на 2 недели, чтобы выйти из боковика по результатам?';
  } else if (
    m30.manual >= 2 &&
    manualAttachRate30 != null &&
    manualAttachRate30 < 0.5
  ) {
    reflectionPrompt =
      'Какое одно вложение добавишь к последней ручной сделке и что на нём должно быть видно через неделю?';
  }

  return {
    headline,
    phase,
    doneCount,
    roadmapTotal: roadmap.length,
    beacons: topBeacons,
    stances,
    advicePick,
    roadmap,
    reflectionPrompt,
    metrics: {
      nClosed,
      journal7,
      journal14,
      closed7,
      closed30,
      ddPct,
      streakKind: streak.kind,
      streakLen: streak.length,
      disciplineScore: discipline.score,
      expectancy,
      winRate,
      openCount: open.length,
      openWithoutSl: openRisk.withoutSlCount,
      weekPnL,
      monthPnL,
      riskShareSl,
      sharpe,
      manualClosed30: m30.manual,
      manualWithAttachments30: m30.withAny,
      manualAttachRate30
    }
  };
}
