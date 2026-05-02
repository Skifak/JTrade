function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Число из ячейки MT5: локали с «1.234,56» / «1,234.56», валютные символы, скобки.
 * Раньше одна замена «,»→«.» давала NaN на EU-формате → прибыль 0.
 */
function parseNumber(value) {
  let s = cleanText(value);
  if (!s) return 0;

  let neg = false;
  const compact = s.replace(/\s/g, '');
  if (/^\(.*\)$/.test(compact)) {
    neg = true;
    s = s.replace(/^\s*\(\s*|\s*\)\s*$/g, '').trim();
  }

  s = s.replace(/\u2212/g, '-').trim();
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1).trim();
  }

  s = cleanText(s)
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '');
  // Типичные суффиксы в отчётах (в т.ч. нестандартная «валюта депозита» в строке)
  s = s.replace(/USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|USDT|BTC|\$|€|£|¥/gi, '');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Запятая последняя как десятичная уже попала в ветку выше.
    if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s.replace(/,/g, '');
    }
  }

  let number = Number(normalized);
  if (!Number.isFinite(number)) return 0;
  if (neg) number = -Math.abs(number);
  return number;
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

/** Нормализация заголовков секций MT5: регистр, ё→е */
function normalizeSectionHeader(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435');
}

/** Лейбл строки отчёта (Имя / Средства / …): для точного матчинга, без ложных includes. */
function normalizeReportLabel(value) {
  return normalizeSectionHeader(value).replace(/[:：]/g, '').trim();
}

/**
 * Пары label→value из таблицы шапки MT5. Учитываем `<th>…</th><td>…</td>`,
 * иначе строки «Торговый счёт», «Средства» не попадают в выборку.
 */
function collectStatementPairs(doc) {
  const pairs = [];
  for (const row of doc.querySelectorAll('tr')) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    if (cells.length < 2) continue;
    const label = normalizeReportLabel(cells[0].textContent);
    const valueText = cleanText(cells[cells.length - 1].textContent);
    if (!label || !valueText) continue;
    pairs.push({ label, valueText });
  }
  return pairs;
}

/** Совпадение лейбла: точное или «лейбл начинается с alias + пробел/скобка» (не substring внутри другого слова). */
function labelMatchesAlias(normLabel, aliasNorm) {
  if (!normLabel || !aliasNorm) return false;
  if (normLabel === aliasNorm) return true;
  if (normLabel.startsWith(`${aliasNorm} (`)) return true;
  if (normLabel.startsWith(`${aliasNorm}(`)) return true;
  if (normLabel.startsWith(`${aliasNorm}:`)) return true;
  return normLabel.startsWith(`${aliasNorm} `);
}

function pickByAliases(pairs, aliases, opts = {}) {
  const rejectRe = opts.rejectLabelRe;
  const aliasNorms = aliases.map((a) => normalizeReportLabel(a));
  for (const p of pairs) {
    const ln = normalizeReportLabel(p.label);
    if (rejectRe && rejectRe.test(ln)) continue;
    for (const al of aliasNorms) {
      if (labelMatchesAlias(ln, al)) return p.valueText;
    }
  }
  return null;
}

/**
 * Строки секции по любому из синонимов заголовка (RU/EN).
 * @param {Document} doc
 * @param {string[]} sectionAliases
 */
function getSectionRowsMulti(doc, sectionAliases) {
  const targets = [...new Set(sectionAliases.map((a) => normalizeSectionHeader(a)).filter(Boolean))];
  const allRows = Array.from(doc.querySelectorAll('tr'));
  const sectionRows = [];
  let inSection = false;

  for (const row of allRows) {
    const headerNorm = normalizeSectionHeader(row.querySelector('th b')?.textContent || '');
    if (headerNorm) {
      const matchesTarget = targets.some(
        (t) => headerNorm === t || headerNorm.startsWith(`${t} `) || headerNorm.includes(t)
      );
      if (inSection && !matchesTarget) {
        break;
      }
      if (matchesTarget) {
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

function getSectionRows(doc, sectionName) {
  return getSectionRowsMulti(doc, [sectionName]);
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

/**
 * Ячейка «Торговый счёт»: `112079 (USD, FundedTradingPlus-Live, real, Hedge)` → валюта, тип счёта и т.д.
 * @param {string} valueText
 */
function parseTradingAccountCell(valueText) {
  const s = cleanText(valueText);
  const m = s.match(
    /^([A-Za-z0-9]+)\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^,)]+?)\s*(?:,\s*([^)]+?))?\s*\)\s*$/i
  );
  if (!m) return null;
  const login = m[1];
  const curChunk = cleanText(m[2]).toUpperCase();
  const cm = curChunk.match(/\b(USDT|BTC|[A-Z]{3})\b/);
  const server = cleanText(m[3]);
  const accountKind = cleanText(m[4]).toLowerCase();
  const hedgeMode = m[5] ? cleanText(m[5]).toLowerCase() : null;
  const ccy = cm ? cm[1] : null;
  return { login, currency: ccy, server, accountKind, hedgeMode };
}

/**
 * Пары ключей из шапки отчёта MT5 (RU/EN) для метаданных импорта.
 */
function extractMt5StatementMeta(doc) {
  const pairs = collectStatementPairs(doc);

  /** Строка «Торговый счёт» — точные алиасы (includes('счет') ломал бы матч «Торговый счёт» как login). */
  let tradingAccountParsed = null;
  const tradingAccountAliases = [
    'торговый счёт',
    'торговый счет',
    'trading account',
    'account'
  ];
  for (const p of pairs) {
    const ln = normalizeReportLabel(p.label);
    if (
      tradingAccountAliases.some((a) => labelMatchesAlias(ln, normalizeReportLabel(a)))
    ) {
      tradingAccountParsed = parseTradingAccountCell(p.valueText);
      break;
    }
  }

  const name = pickByAliases(pairs, ['имя', 'name']);

  const login =
    (tradingAccountParsed && tradingAccountParsed.login) ||
    pickByAliases(pairs, ['номер счёта', 'номер счета', 'login', 'логин']);

  const currencyRaw =
    pickByAliases(pairs, [
      'валюта депозита',
      'валюта счёта',
      'валюта счета',
      'deposit currency',
      'currency'
    ]) ||
    pickByAliases(pairs, ['валюта'], {
      rejectLabelRe: /\b(пара|pair|курс|rate)\b/i
    });

  const equityRaw =
    pickByAliases(pairs, ['средства', 'equity', 'total equity'], {
      rejectLabelRe: /\b(маржа|margin|залогов|гарантийн|уровень\s+марж|free\s+margin|свободн)\b/i
    }) || pickByAliases(pairs, ['баланс', 'balance']);

  const genDate = pickByAliases(pairs, [
    'дата формирования',
    'generation date',
    'report generated',
    'report date'
  ]);

  let accountTitle = null;
  const parts = [];
  if (name) parts.push(name);
  if (login) parts.push(login);
  if (parts.length) accountTitle = parts.join(' · ');
  else if (login) accountTitle = login;

  let equityNum = null;
  if (equityRaw) {
    const onlyNum = cleanText(equityRaw).replace(/[^\d\s,.-]/g, '').trim();
    if (onlyNum) {
      const n = parseNumber(onlyNum);
      equityNum = Number.isFinite(n) ? n : null;
    }
  }

  let ccy = (tradingAccountParsed && tradingAccountParsed.currency) || null;
  if (!ccy) {
    const curPick = currencyRaw || equityRaw || '';
    const tok = String(curPick)
      .toUpperCase()
      .match(/\b(USDT|BTC|[A-Z]{3})\b/);
    if (tok) ccy = tok[1];
  }

  const summary =
    equityNum != null
      ? {
          equity: equityNum != null && Number.isFinite(equityNum) ? equityNum : null,
          equityDisplay: equityRaw
        }
      : equityRaw
        ? {
            equity: null,
            equityDisplay: equityRaw
          }
        : null;

  return {
    accountTitle,
    equityRaw,
    statementCurrency: ccy,
    reportGeneratedAt: genDate,
    summary,
    importAccountKind: tradingAccountParsed?.accountKind || null,
    importAccountServer: tradingAccountParsed?.server || null,
    importAccountHedgeMode: tradingAccountParsed?.hedgeMode || null
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
  const raw = String(htmlContent || '');
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');
  const titleNorm = normalizeSectionHeader(doc.querySelector('title')?.textContent || '');

  const meta = extractMt5StatementMeta(doc);

  const positionSectionAliases = ['Позиции', 'Positions', 'Open Positions', 'Открытые позиции'];
  const dealsSectionAliases = ['Сделки', 'Deals', 'Orders'];

  const loadPositionRows = () => getSectionRowsMulti(doc, positionSectionAliases);
  const loadDealRows = () => getSectionRowsMulti(doc, dealsSectionAliases);

  /** @type {null | 'trade' | 'history'} */
  let reportKind = null;
  if (
    titleNorm.includes('торговый отчет') ||
    titleNorm.includes('trade report') ||
    titleNorm.includes('trading report')
  ) {
    reportKind = 'trade';
  } else if (
    titleNorm.includes('отчет торговой истории') ||
    titleNorm.includes('trade history') ||
    titleNorm.includes('account history')
  ) {
    reportKind = 'history';
  }

  if (!reportKind && /metaquotes|метакот|metatrader|\bmt5\b/i.test(raw)) {
    const rows = loadPositionRows();
    if (rows.length) {
      const vals = rows.map(getRowValues);
      const nHist = vals.map(buildClosedPositionFromHistory).filter(Boolean).length;
      const nTrade = vals.map(buildOpenTrade).filter(Boolean).length;
      if (nHist > 0 && nHist >= nTrade) reportKind = 'history';
      else if (nTrade > 0) reportKind = 'trade';
      else if (nHist > 0) reportKind = 'history';
    }
  }

  const looksLikeMt5 =
    /metaquotes|метакот|metatrader|\bmt5\b/i.test(raw) ||
    reportKind != null ||
    titleNorm.includes('торговый отчет') ||
    titleNorm.includes('отчет торговой истории') ||
    titleNorm.includes('trade report') ||
    titleNorm.includes('trade history') ||
    titleNorm.includes('account history');

  const emptyHints = () => ({
    looksLikeMt5,
    parseHint: looksLikeMt5
      ? 'Строки не извлечены: в «Отчёте торговой истории» нужна секция «Позиции» (закрашенные строки); в «Торговом отчёте» — «Позиции» с открытыми. Комментарии подтягиваются из «Сделки» (out), если блок есть.'
      : 'Не похоже на HTML-экспорт MT5. Сохраните из терминала: контекстное меню журнала → Отчёт, или отчёт по истории с блоком «Сделки».'
  });

  const baseMeta = {
    statementCurrency: meta.statementCurrency || null,
    reportGeneratedAt: meta.reportGeneratedAt || null,
    summary: meta.summary,
    accountTitle: meta.accountTitle || null,
    importAccountKind: meta.importAccountKind || null,
    importAccountServer: meta.importAccountServer || null,
    importAccountHedgeMode: meta.importAccountHedgeMode || null,
    looksLikeMt5,
    parseHint: null
  };

  if (reportKind === 'trade') {
    const rows = loadPositionRows();
    const trades = rows
      .map(getRowValues)
      .map(buildOpenTrade)
      .filter(Boolean);
    return {
      reportType: 'trade',
      trades,
      ...baseMeta,
      parseHint: trades.length ? null : emptyHints().parseHint
    };
  }

  if (reportKind === 'history') {
    const positionRows = loadPositionRows();
    const trades = positionRows
      .map(getRowValues)
      .map(buildClosedPositionFromHistory)
      .filter(Boolean);

    const dealRows = loadDealRows();
    const dealComments = new Map();
    for (const row of dealRows) {
      const v = getRowValues(row);
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

    return {
      reportType: 'history',
      trades,
      ...baseMeta,
      parseHint: trades.length ? null : emptyHints().parseHint
    };
  }

  return {
    reportType: null,
    trades: [],
    ...baseMeta,
    ...emptyHints()
  };
}
