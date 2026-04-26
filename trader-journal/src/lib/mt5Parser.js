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
  // "Торговый отчет" / секция "Позиции" (открытые):
  // [0]Символ [1]Позиция [2]Время [3]Тип [4]Объем [5]Цена [6]S/L [7]T/P
  // [8]Рыночная цена [9]Своп [10]Прибыль(плавающая) [11]Комментарий
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
  const marketPrice = values[8] ? parseNumber(values[8]) : null;
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
    marketPrice,
    commission: 0,
    swap,
    profit: floatingProfit,
    tags: ['mt5', 'mt5-trade-report'],
    templateUsed: null,
    comment
  };
}

function buildClosedPositionFromHistory(values) {
  // Формат блока "Позиции" в "Отчете торговой истории" MT5:
  // [0]Время(откр) [1]Позиция [2]Символ [3]Тип [4]hidden(colspan=8)
  // [5]Объем [6]Цена(откр) [7]S/L [8]T/P [9]Время(закр) [10]Цена(закр)
  // [11]Комиссия [12]Своп [13]Прибыль(colspan=2)
  if (values.length < 14) return null;

  const dateOpen = normalizeDate(values[0]);
  const positionId = values[1];
  const pair = values[2];
  const type = cleanText(values[3]).toLowerCase();

  if (!/^\d+$/.test(positionId)) return null;
  if (!pair) return null;
  if (type !== 'buy' && type !== 'sell') return null;

  const direction = normalizeDirection(values[3]);
  const volume = parseNumber(values[5]);
  const priceOpen = parseNumber(values[6]);
  const sl = values[7] ? parseNumber(values[7]) : null;
  const tp = values[8] ? parseNumber(values[8]) : null;
  const dateClose = normalizeDate(values[9]);
  const priceClose = parseNumber(values[10]);
  const commission = parseNumber(values[11]);
  const swap = parseNumber(values[12]);
  const profit = parseNumber(values[13]);

  return {
    id: `mt5_pos_${positionId}`,
    dateOpen,
    dateOpenManual: true,
    pair,
    direction,
    volume,
    priceOpen,
    sl,
    tp,
    status: 'closed',
    dateClose,
    priceClose,
    commission,
    swap,
    profit,
    tags: ['mt5', 'mt5-history-report'],
    templateUsed: null,
    comment: ''
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
    const positionRows = getSectionRows(doc, 'Позиции');
    const trades = positionRows
      .map(getRowValues)
      .map(buildClosedPositionFromHistory)
      .filter(Boolean);

    // Подтянем комментарии из секции "Сделки" по совпадению (dateClose + symbol)
    const dealRows = getSectionRows(doc, 'Сделки');
    const dealComments = new Map();
    for (const row of dealRows) {
      const v = getRowValues(row);
      // [0]Время [1]Сделка [2]Символ [3]Тип [4]Направление ... [14]Комментарий
      if (v.length < 15) continue;
      const entryDirection = cleanText(v[4]).toLowerCase();
      if (entryDirection !== 'out') continue;
      const dateClose = normalizeDate(v[0]);
      const pair = v[2];
      const comment = v[14];
      if (!dateClose || !pair || !comment) continue;
      dealComments.set(`${dateClose}|${pair}`, comment);
    }

    for (const t of trades) {
      const key = `${t.dateClose}|${t.pair}`;
      if (dealComments.has(key)) t.comment = dealComments.get(key);
    }

    return { reportType: 'history', trades };
  }

  return { reportType: null, trades: [] };
}
