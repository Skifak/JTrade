/**
 * Ссылка на чарт TradingView: только тикер/пара без префикса брокера (GER40, EURUSD, …).
 * @param {string} pairOrSymbol
 */
export function tradingViewChartUrl(pairOrSymbol) {
  const sym = String(pairOrSymbol || '')
    .trim()
    .replace(/\s+/g, '');
  if (!sym) return '';
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;
}
