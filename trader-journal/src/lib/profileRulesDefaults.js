/**
 * Значения по умолчанию для вкладки «Правила и ограничения».
 * Не включает имя, валюту, капитал, комиссию — только пороги и правила.
 */
export function getRulesTabDefaults() {
  return {
    riskMode: 'percent',
    riskPerTradePercent: 1,
    riskPerTradeAmount: 100,
    dailyLossLimitMode: 'percent',
    dailyLossLimitPercent: 3,
    dailyLossLimitAmount: 300,
    weeklyLossLimitMode: 'percent',
    weeklyLossLimitPercent: 0,
    weeklyLossLimitAmount: 0,
    weeklyLossLimitEnabled: false,
    dailyProfitLockMode: 'percent',
    dailyProfitLockPercent: 0,
    dailyProfitLockAmount: 0,
    dailyProfitLockEnabled: false,
    noNewTradesAfterHourLocal: 0,
    afterHoursCutoffEnabled: false,
    minMinutesBetweenTrades: 0,
    minTradeIntervalEnabled: false,
    minRiskRewardHardBlock: false,
    minRiskRewardRatio: 1.5,
    goalMode: 'percent',
    goalDayValue: 1,
    goalWeekValue: 2,
    goalMonthValue: 5,
    goalYearValue: 20,
    maxOpenTrades: 3,
    maxTradesPerDay: 0,
    maxConsecutiveLosses: 3,
    cooldownAfterLossMin: 0,
    streakScalingEnabled: false,
    streakScalingApplyFromLossCount: 2,
    streakScalingMultipliers: [0.5, 0.25, 0.125],
    dailyReviewEnabled: true,
    journalDayReminderEnabled: true,
    journalDayReminderHourLocal: 21,
    postCloseChartReminderEnabled: true,
    profileNotesChecklistEnabled: true,
    notes: ''
  };
}
