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
 *   - getDisciplineScore(trades)           : доля сделок без зарегистрированных
 *                                            нарушений правил
 *
 * Функции чистые, без сторов — стор тянет их сверху.
 */
import dayjs from 'dayjs';
import { getContractSize, calculateProfit } from './utils';

/* -------------------- helpers -------------------- */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
 *   newVolume = maxRiskAmount / (|entry - SL| * contractSize)
 *
 * Округляем вниз до 0.01 лота (стандартный шаг MT5), чтобы не
 * превышать лимит из-за ошибки округления.
 */
export function suggestVolumeForRisk(trade, profile) {
  const entry = num(trade?.priceOpen);
  const sl = num(trade?.sl);
  if (!entry || !sl || entry === sl) return null;

  const cs = effectiveContractSize(trade);
  if (!cs) return null;

  const maxRiskAmount = computeMaxRiskAmount(profile);
  if (!maxRiskAmount || maxRiskAmount <= 0) return null;

  const raw = maxRiskAmount / (Math.abs(entry - sl) * cs);
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
  return closedTrades.reduce((sum, t) => {
    if (!t?.dateClose) return sum;
    const day = dayjs(t.dateClose).format('YYYY-MM-DD');
    if (day !== today) return sum;
    return sum + num(t.profit);
  }, 0);
}

export function getPeriodPnL(closedTrades, period /* 'day'|'week'|'month'|'year' */, now = new Date()) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0;
  const start = dayjs(now).startOf(period);
  const end = dayjs(now).endOf(period);
  return closedTrades.reduce((sum, t) => {
    if (!t?.dateClose) return sum;
    const d = dayjs(t.dateClose);
    if (d.isBefore(start) || d.isAfter(end)) return sum;
    return sum + num(t.profit);
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
  const sorted = [...closedTrades]
    .filter((t) => t?.dateClose)
    .sort((a, b) => new Date(b.dateClose).getTime() - new Date(a.dateClose).getTime());

  let kind = 'none';
  let length = 0;
  let sum = 0;
  for (const t of sorted) {
    const p = num(t.profit);
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

  const otherOpen = isEdit ? openTrades.filter((t) => t.id !== editingId) : openTrades;

  const risk = calculateTradeRisk(trade, profile);
  const maxRiskAmount = computeMaxRiskAmount(profile);
  const maxDailyLossAmount = computeMaxDailyLossAmount(profile);
  const dailyPnL = getDailyPnL(closedTrades);
  const streak = getCurrentStreak(closedTrades);

  if (!risk.hasSl) {
    violations.push({
      severity: 'warn',
      code: 'no-sl',
      message: 'Stop Loss не задан — невозможно посчитать риск сделки.'
    });
  } else if (maxRiskAmount > 0 && risk.riskAmount != null && risk.riskAmount > maxRiskAmount * 1.001) {
    const suggestion = suggestVolumeForRisk(trade, profile);
    violations.push({
      severity: 'block',
      code: 'risk-exceeds',
      message:
        `Риск сделки ${risk.riskAmount.toFixed(2)} превышает лимит ` +
        `${maxRiskAmount.toFixed(2)} (на ${(risk.riskAmount - maxRiskAmount).toFixed(2)}).` +
        (suggestion ? ` Рекомендуемый объём: ${suggestion} лот.` : '')
    });
  }

  if (risk.hasSl && risk.hasTp && risk.rrRatio != null && risk.rrRatio < 1) {
    violations.push({
      severity: 'warn',
      code: 'rr-low',
      message: `Соотношение R:R = 1:${risk.rrRatio.toFixed(2)} (хуже 1:1).`
    });
  }

  const maxOpen = num(profile.maxOpenTrades);
  if (!isEdit && maxOpen > 0 && otherOpen.length >= maxOpen) {
    violations.push({
      severity: 'block',
      code: 'max-open',
      message: `Уже открыто ${otherOpen.length} позиций (лимит ${maxOpen}).`
    });
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

  return violations;
}

/* ------------------- discipline ------------------- */

/**
 * Discipline Score:
 *   1) % сделок без зарегистрированных нарушений
 *   2) violationsCount — суммарное число нарушений
 *
 * Старые сделки без поля ruleViolations считаются «чистыми».
 */
export function getDisciplineScore(trades) {
  if (!Array.isArray(trades) || !trades.length) {
    return { score: 100, total: 0, clean: 0, violationsCount: 0 };
  }
  let clean = 0;
  let violationsCount = 0;
  for (const t of trades) {
    const v = Array.isArray(t.ruleViolations) ? t.ruleViolations : [];
    if (v.length === 0) clean += 1;
    violationsCount += v.length;
  }
  const total = trades.length;
  const score = total ? Math.round((clean / total) * 1000) / 10 : 100;
  return { score, total, clean, violationsCount };
}

/**
 * What-if equity: сумма PnL только по «дисциплинированным» закрытым сделкам.
 * Полезно показать в Statistics: «без нарушений у тебя было бы X».
 */
export function getDisciplinedPnL(closedTrades) {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0;
  let sum = 0;
  for (const t of closedTrades) {
    const v = Array.isArray(t.ruleViolations) ? t.ruleViolations : [];
    if (v.length > 0) continue;
    sum += num(t.profit);
  }
  return sum;
}

/* ------------------- floating PnL aggregate ------------------- */

/**
 * Σ floating PnL по всем открытым сделкам с использованием карты live-цен.
 *   livePricesMap: { [normalizedKey]: { price } }
 *   keyOf: (trade) => key
 */
export function getOpenFloatingPnL(openTrades, livePricesMap, keyOf) {
  if (!Array.isArray(openTrades) || !openTrades.length) return 0;
  let sum = 0;
  for (const t of openTrades) {
    const key = keyOf(t);
    const lp = livePricesMap?.[key];
    const price = lp?.price != null ? Number(lp.price) : null;
    if (price && Number.isFinite(price)) {
      const p = calculateProfit({ ...t, status: 'closed', priceClose: price });
      if (Number.isFinite(p)) sum += p;
    } else if (t.profit != null) {
      sum += num(t.profit);
    }
  }
  return sum;
}
