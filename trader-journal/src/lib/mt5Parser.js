function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value) {
  const normalized = cleanText(value)
    .replace(/\s/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDirection(typeValue) {
  const type = cleanText(typeValue).toLowerCase();
  return type.includes('sell') ? 'short' : 'long';
}

function normalizeDate(mt5Date) {
  const value = cleanText(mt5Date);
  if (!value) return null;
  return value.replace(/\./g, '-');
}

function getRowValues(row) {
  return Array.from(row.querySelectorAll('td'))
    .map((cell) => cleanText(cell.textContent));
}

function getSectionRows(doc, sectionName) {
  const target = cleanText(sectionName).toLowerCase();
  const allRows = Array.from(doc.querySelectorAll('tr'));
  const sectionRows = [];
  let inSection = false;

  for (const row of allRows) {
    const headerText = cleanText(row.querySelector('th b')?.textContent).toLowerCase();
    if (headerText) {
      if (inSection && headerText !== target) break;
      if (headerText === target) {
        inSection = true;
        continue;
      }
    }

    if (!inSection) continue;
    if (row.hasAttribute('bgcolor')) {
      sectionRows.push(row);
    }
  }

  return sectionRows;
}

function buildOpenTrade(values) {
  if (values.length < 11) return null;
  const pair = values[0];
  const position = values[1];
  if (!/^\d+$/.test(position)) return null;
  const dateOpen = normalizeDate(values[2]);
  const direction = normalizeDirection(values[3]);
  const volume = parseNumber(values[4]);
  const priceOpen = parseNumber(values[5]);
  const sl = values[6] ? parseNumber(values[6]) : null;
  const tp = values[7] ? parseNumber(values[7]) : null;
  const swap = parseNumber(values[9]);
  const floatingProfit = parseNumber(values[10]);
  const comment = values[11] || '';

  return {
    id: `mt5_open_${position}`,
    dateOpen,
    dateOpenManual: true,
    pair,
    direction,
    volume,
    priceOpen,
    sl,
    tp,
    status: 'open',
    dateClose: null,
    priceClose: null,
    commission: 0,
    swap,
    profit: floatingProfit,
    tags: ['mt5', 'mt5-trade-report'],
    templateUsed: null,
    comment
  };
}

function buildClosedTrade(values) {
  // Формат блока "Сделки" в MT5:
  // [0]Время [1]Сделка [2]Символ [3]Тип [4]Направление [5]Объем [6]Цена [7]Ордер
  // [8]Издержки(hidden) [9]Комиссия [10]Сбор [11]Своп [12]Прибыль [13]Баланс [14]Комментарий
  if (values.length < 13) return null;
  const dateClose = normalizeDate(values[0]);
  const dealId = values[1];
  const pair = values[2];
  const type = cleanText(values[3]).toLowerCase();
  const entryDirection = cleanText(values[4]).toLowerCase();

  // Берем только реальные рыночные исполнения закрытия позиции.
  if (!/^\d+$/.test(dealId)) return null;
  if (!pair) return null;
  if (type !== 'buy' && type !== 'sell') return null;
  if (entryDirection !== 'out') return null;

  const direction = normalizeDirection(values[3]);
  const volume = parseNumber(values[5]);
  const priceClose = parseNumber(values[6]);
  const commission = parseNumber(values[9]);
  const swap = parseNumber(values[11]);
  const profit = parseNumber(values[12]);

  return {
    id: `mt5_deal_${dealId}`,
    dateOpen: dateClose,
    dateOpenManual: true,
    pair,
    direction,
    volume,
    priceOpen: priceClose,
    sl: null,
    tp: null,
    status: 'closed',
    dateClose,
    priceClose,
    commission,
    swap,
    profit,
    tags: ['mt5', 'mt5-history-report', 'mt5-deals-only'],
    templateUsed: null,
    comment: values[14] || ''
  };
}

export function parseMt5ReportHtml(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const title = cleanText(doc.querySelector('title')?.textContent).toLowerCase();

  if (!title) {
    return { reportType: null, trades: [] };
  }

  if (title.includes('торговый отчет')) {
    const rows = getSectionRows(doc, 'Позиции');
    const trades = rows
      .map(getRowValues)
      .map(buildOpenTrade)
      .filter(Boolean);
    return { reportType: 'trade', trades };
  }

  if (title.includes('отчет торговой истории')) {
    const rows = getSectionRows(doc, 'Сделки');
    const trades = rows
      .map(getRowValues)
      .map(buildClosedTrade)
      .filter(Boolean);
    return { reportType: 'history', trades };
  }

  return { reportType: null, trades: [] };
}
