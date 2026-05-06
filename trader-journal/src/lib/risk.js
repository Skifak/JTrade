/**
 * Единый модуль риск-менеджмента.
 *
 * Использует настройки из userProfile (initialCapital, riskPerTrade*,
 * dailyLossLimit*, goal*, maxOpenTrades, maxConsecutiveLosses) и считает:
 *
 *   - calculateTradeRisk(trade)            : потенциальный риск конкретной сделки
 *   - suggestVolumeForRisk(trade, profile) : сколько лотов взять под maxRiskAmount
 *   - getDailyPnL(closedTrades)            : PnL за «сегодня» (по dateClose)
 *   - getCurrentStreak(closedTrades)       : текущая серия выигрышей/проигрышей
 *   - getOpenRisk(openTrades)              : Σ потенциальных убытков по открытым
 *   - evaluateTradeRules(trade, profile, ctx) : массив нарушений pre-trade
 *     (+ суммарный риск по открытым с SL × новая сделка ≤ maxOpen × лимит)
 *
 * Функции чистые, без сторов — стор тянет их сверху.
 */
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { get } from 'svelte/store';
import { getContractSize, calculateProfit, isMt5DepositCurrencyProfit } from './utils';
import { fxRate, convertUsd, tradeProfitDisplayUnits } from './fxRate';
import { normalizeStreakScalingMultipliers } from './streakScaling.js';
import {
  legacyProfileNotesChecklistLines,
  normalizeProfileGateRules
} from './profileGateRulesNormalize.js';

export { normalizeProfileGateRules } from './profileGateRulesNormalize.js';

dayjs.extend(isoWeek);

/* -------------------- helpers -------------------- */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Код мягкого правила «нет скрина графика после закрытия». */
export const POST_CLOSE_CHART_VIOLATION_CODE = 'post-close-no-chart';

/**
 * Нарушения, из-за которых сделка исключается из disciplined PnL / equity «disciplined».
 * Код post-close-no-chart — мягкое напоминание про скрин; на пунктирную эквити не влияет.
 */
export function hasMaterialRuleViolations(t) {
  const arr = t?.ruleViolations;
  if (!Array.isArray(arr) || !arr.length) return false;
  return arr.some((x) => x?.code !== POST_CLOSE_CHART_VIOLATION_CODE);
}

/**
 * Есть ли у закрытой сделки вложение-изображение (путь в хранилище).
 */
export function tradeHasChartAttachment(trade) {
  const arr = trade?.attachments;
  if (!Array.isArray(arr) || !arr.length) return false;
  return arr.some((p) => /\.(webp|png|jpe?g|gif|avif|bmp)$/i.test(String(p)));
}

/** Убрать нарушения «нет скрина», если скрин уже прикрепили. */
export function stripPostCloseChartViolations(ruleViolations) {
  if (!Array.isArray(ruleViolations)) return [];
  return ruleViolations.filter((x) => x?.code !== POST_CLOSE_CHART_VIOLATION_CODE);
}

/**
 * Мягкое правило для закрытой сделки: напоминание прикрепить скрин графика (ревью контекста).
 * @returns {Array<{severity:'block'|'warn', code:string, message:string}>}
 */
export function evaluatePostCloseTradeRules(trade, profile) {
  const v = [];
  if (!trade || !profile) return v;
  if (profile.postCloseChartReminderEnabled === false) return v;
  if (trade?.status !== 'closed') return v;
  if (tradeHasChartAttachment(trade)) return v;
  v.push({
    severity: 'warn',
    code: POST_CLOSE_CHART_VIOLATION_CODE,
    message:
      'Нет снимка графика после закрытия. Прикрепи скрин терминала с разметкой зоны входа/выхода и таймфрейма — так при разборе видно, совпал ли факт с планом (структура, liquidity, timing), а не только сухие числа PnL.'
  });
  return v;
}

/** Штраф к «очкам дисциплины» сделки (0–100) за одно нарушение. */
export const DISCIPLINE_PENALTY_BLOCK = 36;
export const DISCIPLINE_PENALTY_WARN = 12;
const DEFAULT_SEVERITY = 'warn';

/**
 * Балл дисциплины одной закрытой сделки: 100 минус взвешенные штрафы (block тяжелее warn).
 */
export function closedTradeDisciplinePoints(trade) {
  if (trade?.status !== 'closed') return null;
  const arr = trade?.ruleViolations;
  if (!Array.isArray(arr) || !arr.length) return 100;
  let penalty = 0;
  for (const x of arr) {
    const sev = x?.severity === 'block' ? 'block' : DEFAULT_SEVERITY;
    penalty += sev === 'block' ? DISCIPLINE_PENALTY_BLOCK : DISCIPLINE_PENALTY_WARN;
  }
  return Math.max(0, 100 - penalty);
}

/**
 * Метрика дисциплины по закрытым сделкам (UI: RiskHud, Profile, Guide).
 *  - score: средневзвешенные «очки» 0–100 (block режет сильнее warn)
 *  - clean: число сделок вообще без ruleViolations
 *  - violationsCount: суммарное число записей нарушений
 *  - blockViolationItems / warnViolationItems: сколько записей каждого типа
 */
export function getDisciplineScore(trades) {
  const base = {
    score: 100,
    total: 0,
    clean: 0,
    violationsCount: 0,
    blockViolationItems: 0,
    warnViolationItems: 0
  };
  if (!Array.isArray(trades) || !trades.length) return { ...base };
  const closed = trades.filter((t) => t?.status === 'closed');
  if (!closed.length) return { ...base };
  let sumPoints = 0;
  let clean = 0;
  let violationsCount = 0;
  let blockViolationItems = 0;
  let warnViolationItems = 0;
  for (const t of closed) {
    const arr = t?.ruleViolations;
    const has = Array.isArray(arr) && arr.length;
    if (!has) {
      clean += 1;
      sumPoints += 100;
      continue;
    }
    for (const x of arr) {
      violationsCount += 1;
      if (x?.severity === 'block') blockViolationItems += 1;
      else warnViolationItems += 1;
    }
    const pts = closedTradeDisciplinePoints(t);
    sumPoints += pts != null ? pts : 0;
  }
  const total = closed.length;
  const score = total ? sumPoints / total : 100;
  return {
    score,
    total,
    clean,
    violationsCount,
    blockViolationItems,
    warnViolationItems
  };
}

/**
 * Суммарный PnL только по сделкам без материальных нарушений (см. hasMaterialRuleViolations).
 */
export function getDisciplinedPnL(closedTrades) {
  if (!Array.isArray(closedTrades)) return 0;
  const rs = get(fxRate);
  let sum = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed') continue;
    if (hasMaterialRuleViolations(t)) continue;
    sum += tradeProfitDisplayUnits(t, rs);
  }
  return sum;
}

function effectiveContractSize(trade) {
  const override = Number(trade?.contractSize);
  if (Number.isFinite(override) && override > 0) return override;
  return getContractSize(trade?.pair);
}

/** Сколько USD получаешь/теряешь на 1 единицу движения цены при заданном volume. */
function unitsPerPriceUnit(trade) {
  const volume = num(trade?.volume);
  return volume * effectiveContractSize(trade);
}

/* ----------------- streak scaling ----------------- */

/**
 * Anti-martingale: после серии убытков лимит риска умножается на значение из сетки.
 * Порог «с какого убытка подряд» — `streakScalingApplyFromLossCount` (деф. 2).
 * Для длины серии L: индекс min(L − порог, len−1) в `streakScalingMultipliers`.
 */
export function getCurrentRiskScale(closedTrades, profile) {
  if (!profile?.streakScalingEnabled) return 1;
  const streak = getCurrentStreak(closedTrades);
  const start =
    Number.isFinite(Number(profile?.streakScalingApplyFromLossCount)) &&
    Number(profile.streakScalingApplyFromLossCount) >= 1
      ? Math.min(99, Math.floor(Number(profile.streakScalingApplyFromLossCount)))
      : 2;
  if (streak.kind !== 'loss' || streak.length < start) return 1;
  const multipliers = normalizeStreakScalingMultipliers(profile.streakScalingMultipliers);
  const idx = streak.length - start;
  const clampedIdx = Math.min(Math.max(0, idx), multipliers.length - 1);
  return multipliers[clampedIdx];
}

/* ------------------ risk per trade ---------------- */

/**
 * Возвращает риск, R:R и нормированный процент по конкретной сделке.
 * Если SL не задан — возвращает { hasSl: false, riskAmount: null }.
 *
 *   riskAmount  = |entry - SL| * volume * contractSize  (в валюте PnL — у нас USD)
 *   reward      = |TP    - entry| * volume * contractSize
 *   rrRatio     = reward / riskAmount
 *
 * Это базовая формула «notional risk». Для FX-кросса без USD-конвертации
 * она будет приблизительной — но для UI хватает с лихвой.
 */
export function calculateTradeRisk(trade, profile) {
  const entry = num(trade?.priceOpen);
  const sl = num(trade?.sl);
  const tp = num(trade?.tp);
  const initialCapital = num(profile?.initialCapital);

  const out = {
    hasSl: !!trade?.sl && sl > 0,
    hasTp: !!trade?.tp && tp > 0,
    riskAmount: null,
    rewardAmount: null,
    rrRatio: null,
    riskPercentOfCapital: null,
    units: unitsPerPriceUnit(trade)
  };

  if (out.hasSl && entry > 0) {
    out.riskAmount = Math.abs(entry - sl) * out.units;
    if (initialCapital > 0) {
      out.riskPercentOfCapital = (out.riskAmount / initialCapital) * 100;
    }
  }
  if (out.hasTp && entry > 0) {
    out.rewardAmount = Math.abs(tp - entry) * out.units;
  }
  if (out.riskAmount && out.rewardAmount && out.riskAmount > 0) {
    out.rrRatio = out.rewardAmount / out.riskAmount;
  }

  return out;
}

/**
 * Какой volume выбрать, чтобы риск сделки совпал с maxRiskAmount.
 * Возвращает null если нельзя посчитать (нет SL / нет priceOpen).
 *
 *   newVolume = maxRiskAmount * scale / (|entry - SL| * contractSize)
 *
 * scale — антимартингейл-множитель (см. getCurrentRiskScale). Если профиль
 * выключил streakScalingEnabled — scale = 1.
 *
 * Округляем вниз до 0.01 лота (стандартный шаг MT5), чтобы не
 * превышать лимит из-за ошибки округления.
 */
export function suggestVolumeForRisk(trade, profile, ctx = {}) {
  const entry = num(trade?.priceOpen);
  const sl = num(trade?.sl);
  if (!entry || !sl || entry === sl) return null;

  const cs = effectiveContractSize(trade);
  if (!cs) return null;

  const baseRisk = computeMaxRiskAmount(profile);
  if (!baseRisk || baseRisk <= 0) return null;

  const scale = Array.isArray(ctx.closedTrades)
    ? getCurrentRiskScale(ctx.closedTrades, profile)
    : 1;
  const targetRisk = baseRisk * scale;

  const raw = targetRisk / (Math.abs(entry - sl) * cs);
  if (!Number.isFinite(raw) || raw <= 0) return null;

  const stepped = Math.floor(raw * 100) / 100;
  return stepped >= 0.01 ? stepped : Number(raw.toFixed(4));
}

export function computeMaxRiskAmount(profile) {
  if (!profile) return 0;
  if (profile.riskMode === 'amount') return num(profile.riskPerTradeAmount);
  return (num(profile.initialCapital) * num(profile.riskPerTradePercent)) / 100;
}

export function computeMaxDailyLossAmount(profile) {
  if (!profile) return 0;
  if (profile.dailyLossLimitMode === 'amount') return num(profile.dailyLossLimitAmount);
  return (num(profile.initialCapital) * num(profile.dailyLossLimitPercent)) / 100;
}

/** Недельный лимит убытка (ISO-неделя), 0 — выкл. */
export function computeMaxWeeklyLossAmount(profile) {
  if (!profile) return 0;
  if (profile.weeklyLossLimitEnabled === false) return 0;
  if (profile.weeklyLossLimitMode === 'amount') return num(profile.weeklyLossLimitAmount);
  return (num(profile.initialCapital) * num(profile.weeklyLossLimitPercent)) / 100;
}

/** Месячный лимит убытка (календарный месяц), 0 — выкл. */
export function computeMaxMonthlyLossAmount(profile) {
  if (!profile) return 0;
  if (profile.monthlyLossLimitEnabled === false) return 0;
  if (profile.monthlyLossLimitMode === 'amount') return num(profile.monthlyLossLimitAmount);
  return (num(profile.initialCapital) * num(profile.monthlyLossLimitPercent)) / 100;
}

/** Потолок дневной прибыли: после достижения новые входы блокируются. 0 — выкл. */
export function computeDailyProfitLockAmount(profile) {
  if (!profile) return 0;
  if (profile.dailyProfitLockEnabled === false) return 0;
  if (profile.dailyProfitLockMode === 'amount') return num(profile.dailyProfitLockAmount);
  return (num(profile.initialCapital) * num(profile.dailyProfitLockPercent)) / 100;
}

export function computeGoalAmount(profile, period /* 'Day'|'Week'|'Month'|'Year' */) {
  if (!profile) return 0;
  const v = num(profile[`goal${period}Value`]);
  if (profile.goalMode === 'amount') return v;
  return (num(profile.initialCapital) * v) / 100;
}

/* ------------------- aggregates ------------------- */

export function getDailyPnL(closedTrades, now = new Date()) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0;
  const today = dayjs(now).format('YYYY-MM-DD');
  const rs = get(fxRate);
  return closedTrades.reduce((sum, t) => {
    if (!t?.dateClose) return sum;
    const day = dayjs(t.dateClose).format('YYYY-MM-DD');
    if (day !== today) return sum;
    return sum + tradeProfitDisplayUnits(t, rs);
  }, 0);
}

/** Закрытый PnL за текущую ISO-неделю (по dateClose), в валюте счёта. */
export function getIsoWeekPnL(closedTrades, now = new Date()) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0;
  const rs = get(fxRate);
  const ref = dayjs(now);
  const ws = ref.startOf('isoWeek');
  const we = ref.endOf('isoWeek');
  let sum = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    const dc = dayjs(t.dateClose);
    if (dc.isBefore(ws) || dc.isAfter(we)) continue;
    sum += tradeProfitDisplayUnits(t, rs);
  }
  return sum;
}

/** Метка времени последнего закрытия (ms) или null. */
export function getLastClosedTradeCloseTimeMs(closedTrades) {
  if (!Array.isArray(closedTrades)) return null;
  let max = 0;
  for (const t of closedTrades) {
    if (t?.status !== 'closed' || !t?.dateClose) continue;
    const ms = new Date(t.dateClose).getTime();
    if (Number.isFinite(ms) && ms > max) max = ms;
  }
  return max > 0 ? max : null;
}

/** Закрытых сделок за календарный день (по dateClose). */
export function countClosedTradesOnDay(closedTrades, now = new Date()) {
  if (!Array.isArray(closedTrades)) return 0;
  const key = dayjs(now).format('YYYY-MM-DD');
  return closedTrades.filter(
    (t) =>
      t?.status === 'closed' && t.dateClose && dayjs(t.dateClose).format('YYYY-MM-DD') === key
  ).length;
}

export function getPeriodPnL(closedTrades, period /* 'day'|'week'|'month'|'year' */, now = new Date()) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0;
  const start = dayjs(now).startOf(period);
  const end = dayjs(now).endOf(period);
  const rs = get(fxRate);
  return closedTrades.reduce((sum, t) => {
    if (!t?.dateClose) return sum;
    const d = dayjs(t.dateClose);
    if (d.isBefore(start) || d.isAfter(end)) return sum;
    return sum + tradeProfitDisplayUnits(t, rs);
  }, 0);
}

/**
 * Текущая «непрерывная» серия выигрышей/проигрышей.
 * Идём от свежей закрытой сделки назад. Сделки с profit == 0 пропускаем.
 *   { kind: 'win'|'loss'|'none', length: number, sum: number }
 */
export function getCurrentStreak(closedTrades) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) {
    return { kind: 'none', length: 0, sum: 0 };
  }
  const rs = get(fxRate);
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(b.dateClose).getTime() - new Date(a.dateClose).getTime());

  let kind = 'none';
  let length = 0;
  let sum = 0;
  for (const t of sorted) {
    const p = tradeProfitDisplayUnits(t, rs);
    if (p === 0) continue;
    const cur = p > 0 ? 'win' : 'loss';
    if (kind === 'none') kind = cur;
    if (cur !== kind) break;
    length += 1;
    sum += p;
  }
  return { kind, length, sum };
}

/** Σ потенциальных убытков по открытым сделкам (только те, где задан SL). */
export function getOpenRisk(openTrades, profile) {
  if (!Array.isArray(openTrades) || !openTrades.length) {
    return { totalRisk: 0, withSlCount: 0, withoutSlCount: 0 };
  }
  let totalRisk = 0;
  let withSlCount = 0;
  let withoutSlCount = 0;
  for (const t of openTrades) {
    const r = calculateTradeRisk(t, profile);
    if (r.hasSl && r.riskAmount != null) {
      totalRisk += r.riskAmount;
      withSlCount += 1;
    } else {
      withoutSlCount += 1;
    }
  }
  return { totalRisk, withSlCount, withoutSlCount };
}

/* ------------------- pre-trade rules ------------------- */

/**
 * Прогон правил для НОВОЙ или РЕДАКТИРУЕМОЙ открытой сделки.
 * @returns Array<{severity:'block'|'warn', code:string, message:string}>
 */
export function evaluateTradeRules(trade, profile, ctx = {}) {
  const violations = [];
  if (!trade || !profile) return violations;

  const openTrades = Array.isArray(ctx.openTrades) ? ctx.openTrades : [];
  const closedTrades = Array.isArray(ctx.closedTrades) ? ctx.closedTrades : [];
  const isEdit = !!ctx.isEditing;
  const editingId = trade?.id;
  const now = ctx.now instanceof Date ? ctx.now : new Date();

  const otherOpen = isEdit ? openTrades.filter((t) => t.id !== editingId) : openTrades;

  const risk = calculateTradeRisk(trade, profile);
  const baseRiskAmount = computeMaxRiskAmount(profile);
  const scale = getCurrentRiskScale(closedTrades, profile);
  const maxRiskAmount = baseRiskAmount * scale;
  const maxDailyLossAmount = computeMaxDailyLossAmount(profile);
  const dailyPnL = getDailyPnL(closedTrades, now);
  const streak = getCurrentStreak(closedTrades);

  if (!risk.hasSl) {
    violations.push({
      severity: 'warn',
      code: 'no-sl',
      message: 'Stop Loss не задан — невозможно посчитать риск сделки.'
    });
  } else if (maxRiskAmount > 0 && risk.riskAmount != null && risk.riskAmount > maxRiskAmount + 0.005) {
    const suggestion = suggestVolumeForRisk(trade, profile, { closedTrades });
    const scaleNote = scale < 1 ? ` (anti-martingale урезает лимит до ${maxRiskAmount.toFixed(2)})` : '';
    violations.push({
      severity: 'block',
      code: 'risk-exceeds',
      message:
        `Риск сделки ${risk.riskAmount.toFixed(2)} превышает лимит ` +
        `${maxRiskAmount.toFixed(2)}${scaleNote}.` +
        (suggestion ? ` Рекомендуемый объём: ${suggestion} лот.` : '')
    });
  }

  const maxOpenForExposure = num(profile.maxOpenTrades);
  if (
    maxOpenForExposure > 0 &&
    maxRiskAmount > 0 &&
    risk.hasSl &&
    risk.riskAmount != null
  ) {
    const openRiskAgg = getOpenRisk(otherOpen, profile);
    const exposureBudget = maxRiskAmount * maxOpenForExposure;
    const totalExposure = openRiskAgg.totalRisk + risk.riskAmount;
    if (totalExposure > exposureBudget + 0.005) {
      violations.push({
        severity: 'block',
        code: 'exposure-cap',
        message:
          `Σ риска открытых (по SL) + эта сделка: ${totalExposure.toFixed(2)} ` +
          `превышает бюджет ${exposureBudget.toFixed(2)} ` +
          `(${maxOpenForExposure} × ${maxRiskAmount.toFixed(2)}). ` +
          'Уменьши объём/риск или закрой часть позиций.'
      });
    }
  }

  if (risk.hasSl && risk.hasTp && risk.rrRatio != null) {
    const rrMin = num(profile.minRiskRewardRatio);
    if (profile.minRiskRewardHardBlock && rrMin > 0 && risk.rrRatio < rrMin - 1e-9) {
      violations.push({
        severity: 'block',
        code: 'rr-below-min',
        message: `R:R ${risk.rrRatio.toFixed(2)} ниже минимума ${rrMin.toFixed(2)} (порог из профиля).`
      });
    } else if (risk.rrRatio < 1) {
      violations.push({
        severity: 'warn',
        code: 'rr-low',
        message: `Соотношение R:R = 1:${risk.rrRatio.toFixed(2)} (хуже 1:1).`
      });
    }
  }

  const maxOpen = num(profile.maxOpenTrades);
  if (!isEdit && maxOpen > 0 && otherOpen.length >= maxOpen) {
    violations.push({
      severity: 'block',
      code: 'max-open',
      message: `Уже открыто ${otherOpen.length} позиций (лимит ${maxOpen}).`
    });
  }

  const maxDayTrades = num(profile.maxTradesPerDay);
  if (!isEdit && maxDayTrades > 0) {
    const closedToday = countClosedTradesOnDay(closedTrades);
    if (closedToday >= maxDayTrades) {
      violations.push({
        severity: 'block',
        code: 'max-trades-day',
        message: `Уже ${closedToday} закрытых сделок сегодня (лимит ${maxDayTrades}).`
      });
    }
  }

  if (maxDailyLossAmount > 0 && dailyPnL <= -maxDailyLossAmount) {
    violations.push({
      severity: 'block',
      code: 'daily-stop',
      message:
        `Дневной лимит убытка достигнут: ${dailyPnL.toFixed(2)} ` +
        `(лимит -${maxDailyLossAmount.toFixed(2)}).`
    });
  }

  const maxWeeklyLoss = computeMaxWeeklyLossAmount(profile);
  if (!isEdit && maxWeeklyLoss > 0) {
    const weekPnL = getIsoWeekPnL(closedTrades, now);
    if (weekPnL <= -maxWeeklyLoss) {
      violations.push({
        severity: 'block',
        code: 'weekly-stop',
        message:
          `Недельный лимит убытка (ISO-неделя): ${weekPnL.toFixed(2)} ` +
          `(лимит −${maxWeeklyLoss.toFixed(2)}).`
      });
    }
  }

  const maxMonthlyLoss = computeMaxMonthlyLossAmount(profile);
  if (!isEdit && maxMonthlyLoss > 0) {
    const monthPnL = getPeriodPnL(closedTrades, 'month', now);
    if (monthPnL <= -maxMonthlyLoss) {
      violations.push({
        severity: 'block',
        code: 'monthly-stop',
        message:
          `Месячный лимит убытка: ${monthPnL.toFixed(2)} ` +
          `(лимит −${maxMonthlyLoss.toFixed(2)}).`
      });
    }
  }

  const profitCap = computeDailyProfitLockAmount(profile);
  if (!isEdit && profitCap > 0) {
    const dp = getDailyPnL(closedTrades, now);
    if (dp >= profitCap - 1e-9) {
      violations.push({
        severity: 'block',
        code: 'daily-profit-lock',
        message:
          `Достигнут потолок дневной прибыли: +${dp.toFixed(2)} ` +
          `(лимит +${profitCap.toFixed(2)}). Новые входы отключены.`
      });
    }
  }

  const cutoffHr = Math.floor(num(profile.noNewTradesAfterHourLocal));
  const afterHoursOn = profile.afterHoursCutoffEnabled !== false;
  if (!isEdit && afterHoursOn && cutoffHr >= 1 && cutoffHr <= 23 && dayjs(now).hour() >= cutoffHr) {
    violations.push({
      severity: 'block',
      code: 'after-hours-cutoff',
      message: `После ${cutoffHr}:00 локально новые сделки не оформляются (настройка профиля).`
    });
  }

  const gapMin = Math.max(0, Math.floor(num(profile.minMinutesBetweenTrades)));
  const intervalOn = profile.minTradeIntervalEnabled !== false;
  if (!isEdit && intervalOn && gapMin > 0) {
    const lastMs = getLastClosedTradeCloseTimeMs(closedTrades);
    if (lastMs != null && now.getTime() - lastMs < gapMin * 60000) {
      violations.push({
        severity: 'block',
        code: 'trade-interval',
        message: `С последнего закрытия прошло меньше ${gapMin} мин (пауза между сделками).`
      });
    }
  }

  const maxStreak = num(profile.maxConsecutiveLosses);
  if (
    maxStreak > 0 &&
    streak.kind === 'loss' &&
    streak.length >= maxStreak
  ) {
    violations.push({
      severity: 'block',
      code: 'streak-stop',
      message: `Серия убытков подряд: ${streak.length} (лимит ${maxStreak}). Возьми паузу.`
    });
  }

  // Хедж: позиция в обратную сторону по той же паре уже открыта.
  if (trade?.pair && trade?.direction) {
    const conflict = otherOpen.find(
      (t) => t.pair === trade.pair && t.direction !== trade.direction
    );
    if (conflict) {
      violations.push({
        severity: 'warn',
        code: 'hedge',
        message:
          `Уже открыта противоположная позиция по ${trade.pair} ` +
          `(${conflict.direction === 'long' ? 'Long' : 'Short'}).`
      });
    }
  }

  // Cooldown — после убыточной сделки.
  if (ctx.cooldownRemainingMs && ctx.cooldownRemainingMs > 0) {
    const min = Math.ceil(ctx.cooldownRemainingMs / 60000);
    violations.push({
      severity: 'block',
      code: 'cooldown',
      message: `Cooldown после убыточной сделки: подожди ещё ${min} мин. ` +
        'Не входи в revenge-trade.'
    });
  }

  const gateRules = normalizeProfileGateRules(profile);
  const ackedGate = Array.isArray(ctx.acknowledgedChecklist) ? ctx.acknowledgedChecklist : [];

  /** @param {{ id:string,label:string }} rule */
  const gateAcked = (rule) =>
    ackedGate.includes(rule.id) || ackedGate.includes(rule.label);

  if (profile.profileNotesChecklistEnabled !== false && gateRules.length > 0) {
    const requiredDefs = gateRules.filter((r) => r.required);
    const missedReq = gateRules.filter((r) => r.required && !gateAcked(r));
    const missedOpt = gateRules.filter((r) => !r.required && !gateAcked(r));
    if (missedReq.length > 0) {
      violations.push({
        severity: 'block',
        code: 'notes-checklist-required',
        message:
          `Свои правила (профиль): не отмечены обязательные пункты ` +
          `(${missedReq.length} из ${requiredDefs.length}).`
      });
    } else if (missedOpt.length > 0) {
      violations.push({
        severity: 'warn',
        code: 'notes-checklist',
        message:
          `Чек-лист «Свои правила» не пройден ` +
          `(${missedOpt.length} из ${gateRules.length}).`
      });
    }
  }

  // Playbook preconditions — required-пункты выбранного play должны быть отмечены.
  const play = ctx.play;
  if (play) {
    const ackedPlay = Array.isArray(ctx.acknowledgedPlayRules) ? ctx.acknowledgedPlayRules : [];
    const requiredPre = (play.preconditions || []).filter((r) => r.required);
    const requiredEntry = (play.entryConditions || []).filter((r) => r.required);
    const allRequired = [...requiredPre, ...requiredEntry];
    const missedReq = allRequired.filter((r) => !ackedPlay.includes(r.id));
    if (missedReq.length > 0) {
      violations.push({
        severity: 'block',
        code: 'play-preconditions',
        message:
          `Play «${play.name}»: не отмечены обязательные правила ` +
          `(${missedReq.length} из ${allRequired.length}). ` +
          `Без них сделка нарушает плейбук.`
      });
    }

    // Killzones — если play требует конкретные KZ.
    if (Array.isArray(play.killzones) && play.killzones.length > 0 && ctx.currentKillzone) {
      if (!play.killzones.includes(ctx.currentKillzone)) {
        violations.push({
          severity: 'warn',
          code: 'play-killzone',
          message:
            `Play «${play.name}» рассчитан на killzones [${play.killzones.join(', ')}]. ` +
            `Сейчас сделка попадает в ${ctx.currentKillzone}.`
        });
      }
    } else if (Array.isArray(play.killzones) && play.killzones.length > 0 && !ctx.currentKillzone) {
      violations.push({
        severity: 'warn',
        code: 'play-killzone-out',
        message:
          `Play «${play.name}» рассчитан на killzones [${play.killzones.join(', ')}], ` +
          `а сделка открывается вне любых KZ.`
      });
    }
  }

  // HTF Bias — направление сделки должно совпадать с daily/h4 bias.
  if (ctx.bias && trade?.direction) {
    const aligned = ctx.biasAligned;
    const playReq = play?.htfRequirement;
    if (aligned === false && playReq !== 'against') {
      violations.push({
        severity: 'warn',
        code: 'against-bias',
        message:
          `Сделка ${trade.direction === 'long' ? 'Long' : 'Short'} против bias ` +
          `(${ctx.biasLabel || 'bias установлен в обратную сторону'}). ` +
          `ICT-сетапы против HTF почти всегда ловят SL.`
      });
    } else if (aligned === true && playReq === 'against') {
      violations.push({
        severity: 'warn',
        code: 'play-against-but-aligned',
        message:
          `Play «${play.name}» работает только против bias (Judas-style), ` +
          `а сделка идёт ПО bias.`
      });
    }
  }

  return violations;
}

/* ------------------- daily stop ------------------- */

/**
 * Дневной стоп пробит — для kill-switch UI.
 * Возвращает { hit: bool, pnl: number, limit: number }.
 */
export function checkDailyStop(closedTrades, profile, now = new Date()) {
  const limit = computeMaxDailyLossAmount(profile);
  const pnl = getDailyPnL(closedTrades, now);
  return {
    hit: limit > 0 && pnl <= -limit,
    pnl,
    limit
  };
}

/** Недельный стоп (ISO-неделя) — для kill-switch UI. */
export function checkWeeklyStop(closedTrades, profile, now = new Date()) {
  const limit = computeMaxWeeklyLossAmount(profile);
  const pnl = getIsoWeekPnL(closedTrades, now);
  return {
    hit: limit > 0 && pnl <= -limit,
    pnl,
    limit
  };
}

/** Месячный стоп — календарный месяц по dateClose (тот же агрегат, что в гейте). */
export function checkMonthlyStop(closedTrades, profile, now = new Date()) {
  const limit = computeMaxMonthlyLossAmount(profile);
  const pnl = getPeriodPnL(closedTrades, 'month', now);
  return {
    hit: limit > 0 && pnl <= -limit,
    pnl,
    limit
  };
}

/** Потолок дневной прибыли — для kill-switch UI. */
export function checkDailyProfitLock(closedTrades, profile, now = new Date()) {
  const cap = computeDailyProfitLockAmount(profile);
  const pnl = getDailyPnL(closedTrades, now);
  return {
    hit: cap > 0 && pnl >= cap - 1e-9,
    pnl,
    cap
  };
}

/** Окно по локальному часу: hit если новые входы запрещены. */
export function checkAfterHoursCutoff(profile, now = new Date()) {
  if (profile?.afterHoursCutoffEnabled === false) return { hit: false, cutoff: 0 };
  const c = Math.floor(num(profile.noNewTradesAfterHourLocal));
  if (c < 1 || c > 23) return { hit: false, cutoff: 0 };
  return { hit: dayjs(now).hour() >= c, cutoff: c };
}

/* ------------------- equity curve ------------------- */

/**
 * Equity-кривая по закрытым сделкам (по dateClose, по возрастанию).
 *  - real: initialCapital + Σ profit
 *  - disciplined: то же, но сделки с материальными нарушениями не меняют баланс
 *    (post-close-no-chart на пунктир не влияет).
 *    («что было бы, если не входил в нарушающие сделки»).
 */
export function getEquityCurve(closedTrades, initialCapital = 0) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return [];
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(a.dateClose).getTime() - new Date(b.dateClose).getTime());

  const out = [
    {
      ts: sorted[0] ? new Date(sorted[0].dateClose).getTime() - 1 : Date.now(),
      real: initialCapital,
      disciplined: initialCapital
    }
  ];
  let real = initialCapital;
  let disciplined = initialCapital;
  for (const t of sorted) {
    const p = num(t.profit);
    real += p;
    if (!hasMaterialRuleViolations(t)) disciplined += p;
    out.push({ ts: new Date(t.dateClose).getTime(), real, disciplined });
  }
  return out;
}

/* ------------------- time-of-day analytics ------------------- */

/** PnL по часам открытия сделки (0..23). */
export function getPnLByHour(closedTrades) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, sum: 0, count: 0, wins: 0 }));
  if (!Array.isArray(closedTrades)) return buckets;
  for (const t of closedTrades) {
    const ref = t?.dateOpen || t?.dateClose;
    if (!ref) continue;
    const h = new Date(ref).getHours();
    if (h < 0 || h > 23) continue;
    const p = num(t.profit);
    buckets[h].sum += p;
    buckets[h].count += 1;
    if (p > 0) buckets[h].wins += 1;
  }
  return buckets;
}

/** PnL по дням недели (0=Пн … 6=Вс). */
export function getPnLByWeekday(closedTrades) {
  const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const buckets = labels.map((label, i) => ({ weekday: i, label, sum: 0, count: 0, wins: 0 }));
  if (!Array.isArray(closedTrades)) return buckets;
  for (const t of closedTrades) {
    const ref = t?.dateOpen || t?.dateClose;
    if (!ref) continue;
    const jsDow = new Date(ref).getDay(); // 0=Sun
    const idx = (jsDow + 6) % 7;          // 0=Mon
    const p = num(t.profit);
    buckets[idx].sum += p;
    buckets[idx].count += 1;
    if (p > 0) buckets[idx].wins += 1;
  }
  return buckets;
}

/* ------------------- tag analytics ------------------- */

/**
 * Разбивка по тегам сетапов.
 *  - Сделка без тегов → группа '(без тега)'.
 *  - Сделка с несколькими тегами учитывается в каждой группе.
 */
export function getStatsByTag(closedTrades) {
  const map = new Map();
  if (!Array.isArray(closedTrades)) return [];

  function bucket(tag) {
    if (!map.has(tag)) {
      map.set(tag, { tag, count: 0, wins: 0, losses: 0, sum: 0, grossWin: 0, grossLoss: 0 });
    }
    return map.get(tag);
  }

  for (const t of closedTrades) {
    const tags = Array.isArray(t.tags) && t.tags.length ? t.tags : ['(без тега)'];
    const p = num(t.profit);
    for (const tg of tags) {
      const b = bucket(tg);
      b.count += 1;
      b.sum += p;
      if (p > 0) { b.wins += 1; b.grossWin += p; }
      else if (p < 0) { b.losses += 1; b.grossLoss += -p; }
    }
  }

  return [...map.values()]
    .map((b) => ({
      ...b,
      winRate: b.count ? (b.wins / b.count) * 100 : 0,
      expectancy: b.count ? b.sum / b.count : 0,
      profitFactor: b.grossLoss ? b.grossWin / b.grossLoss : (b.grossWin ? Infinity : 0)
    }))
    .sort((a, b) => b.sum - a.sum);
}

/* ------------------- notes checklist ------------------- */

/**
 * Превращает свободные заметки профиля в чек-лист.
 * Каждая непустая строка → элемент чек-листа.
 * Игнорируются строки-комментарии (начинаются с #).
 */
export function parseNotesChecklist(notes) {
  return legacyProfileNotesChecklistLines(notes);
}

/* ------------------- bias / play analytics ------------------- */

/**
 * Сравнивает PnL по сделкам "по bias" vs "против bias".
 * tradeBias(t) -> true|false|null (null = unknown/neutral, не учитывается).
 */
export function getStatsByBiasAlignment(closedTrades, tradeAlignedFn) {
  const buckets = {
    aligned: { count: 0, sum: 0, wins: 0 },
    against: { count: 0, sum: 0, wins: 0 },
    unknown: { count: 0, sum: 0, wins: 0 }
  };
  if (!Array.isArray(closedTrades)) return buckets;
  for (const t of closedTrades) {
    const a = typeof tradeAlignedFn === 'function' ? tradeAlignedFn(t) : null;
    const bucket = a === true ? buckets.aligned : a === false ? buckets.against : buckets.unknown;
    const p = num(t.profit);
    bucket.count += 1;
    bucket.sum += p;
    if (p > 0) bucket.wins += 1;
  }
  return buckets;
}

/**
 * Сводка по play — winrate / expectancy / PF в разрезе сетапа из плейбука.
 * tradeKey(t) -> 'strategyId:playId' или null.
 * playMeta — объект { 'sId:pId': { strategyName, playName } }.
 */
export function getStatsByPlay(closedTrades, playMeta = {}) {
  const map = new Map();
  if (!Array.isArray(closedTrades)) return [];
  for (const t of closedTrades) {
    if (!t.strategyId || !t.playId) continue;
    const key = `${t.strategyId}:${t.playId}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        strategyId: t.strategyId,
        playId: t.playId,
        meta: playMeta[key] || { strategyName: '?', playName: '?' },
        count: 0,
        wins: 0,
        losses: 0,
        sum: 0,
        grossWin: 0,
        grossLoss: 0
      });
    }
    const b = map.get(key);
    const p = num(t.profit);
    b.count += 1;
    b.sum += p;
    if (p > 0) { b.wins += 1; b.grossWin += p; }
    else if (p < 0) { b.losses += 1; b.grossLoss += -p; }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      winRate: b.count ? (b.wins / b.count) * 100 : 0,
      expectancy: b.count ? b.sum / b.count : 0,
      profitFactor: b.grossLoss ? b.grossWin / b.grossLoss : (b.grossWin ? Infinity : 0)
    }))
    .sort((a, b) => b.sum - a.sum);
}

/* ------------------- floating PnL aggregate ------------------- */

/**
 * Σ floating PnL по всем открытым сделкам с использованием карты live-цен.
 *   livePricesMap: { [normalizedKey]: { price } }
 *   keyOf: (trade) => key
 */
export function getOpenFloatingPnL(openTrades, livePricesMap, keyOf, rateState) {
  if (!Array.isArray(openTrades) || !openTrades.length) return 0;
  const rs = rateState || get(fxRate);
  let sum = 0;
  for (const t of openTrades) {
    const key = keyOf(t);
    const lp = livePricesMap?.[key];
    const price = lp?.price != null ? Number(lp.price) : null;
    if (price && Number.isFinite(price)) {
      if (isMt5DepositCurrencyProfit(t)) {
        sum += num(t.profit);
      } else {
        const p = calculateProfit({ ...t, status: 'closed', priceClose: price });
        sum += Number.isFinite(p) ? convertUsd(p, rs) : 0;
      }
    } else {
      sum += tradeProfitDisplayUnits(t, rs);
    }
  }
  return sum;
}
