import { get } from 'svelte/store';
import JSZip from 'jszip';
import { importJournalZip, BUNDLE_NAME } from './journalBundle.js';
import { sanitizeImportedAccountCurrency } from './stores.js';
import { fxRate, tradeProfitDisplayUnits } from './fxRate.js';
import { livePrices } from './livePrices.js';
import { normalizeSymbolKey } from './constants.js';
import { getOpenFloatingPnL } from './risk.js';
import { toasts } from './toasts.js';

function importAccountKindRu(kind) {
  if (!kind) return '—';
  const x = String(kind).toLowerCase();
  if (x === 'real') return 'Реальный';
  if (x === 'demo') return 'Демо';
  if (x === 'contest') return 'Конкурсный';
  return String(kind);
}

/**
 * @param {null | { kind: 'zip'; ab: ArrayBuffer; fileName: string } | { kind: 'html'; fileName: string; parsed: any } | { kind: 'json'; fileName: string; text: string }} pending
 * @returns {Promise<{ title: string; lines: string[] }>}
 */
export async function describeImportPending(pending) {
  if (!pending) {
    return { title: 'Нет файла', lines: ['Сначала выбери файл истории.'] };
  }
  if (pending.kind === 'html') {
    const p = pending.parsed;
    const lines = [
      `Тип счёта: ${importAccountKindRu(p.importAccountKind)}`,
      `Сделок: ${p.trades?.length ?? 0}`,
      `Валюта счёта: ${p.statementCurrency || '—'}`
    ];
    if (p.accountTitle) lines.push(`Счёт в отчёте: ${p.accountTitle}`);
    if (p.reportGeneratedAt) lines.push(`Дата в отчёте: ${p.reportGeneratedAt}`);
    if (p.summary && typeof p.summary === 'object') {
      const s = p.summary;
      const funds =
        s.equityDisplay != null && String(s.equityDisplay).trim()
          ? String(s.equityDisplay).trim()
          : s.equity != null && Number.isFinite(Number(s.equity))
            ? String(s.equity)
            : null;
      if (funds != null) lines.push(`Средства (сводка): ${funds}`);
    }
    if (p.parseHint) lines.push(`Подсказка: ${p.parseHint}`);
    return { title: pending.fileName || 'MT5 HTML', lines };
  }
  if (pending.kind === 'json') {
    let n = 0;
    try {
      const arr = JSON.parse(pending.text);
      n = Array.isArray(arr) ? arr.length : 0;
    } catch {
      return { title: pending.fileName || 'JSON', lines: ['Не удалось разобрать JSON'] };
    }
    return {
      title: pending.fileName || 'JSON',
      lines: [`Сделок в файле: ${n}`, 'Глоссарий не меняется.']
    };
  }
  if (pending.kind === 'zip') {
    try {
      const zip = await JSZip.loadAsync(pending.ab);
      const f = zip.file(BUNDLE_NAME);
      if (!f) {
        return { title: pending.fileName || 'ZIP', lines: ['В архиве нет journal_bundle.json'] };
      }
      const text = await f.async('string');
      const data = JSON.parse(text);
      const nt = Array.isArray(data?.trades) ? data.trades.length : 0;
      const nk = Array.isArray(data?.glossary?.terms) ? data.glossary.terms.length : 0;
      return {
        title: pending.fileName || 'ZIP',
        lines: [
          `Сделок в бандле: ${nt}`,
          `Терминов в глоссарии: ${nk}`,
          'При импорте валюта из бандла не подставляется — задаётся в мастере (для ZIP/JSON).'
        ]
      };
    } catch (e) {
      return { title: pending.fileName || 'ZIP', lines: [`Ошибка чтения: ${String(e?.message || e)}`] };
    }
  }
  return { title: '—', lines: [] };
}

/**
 * @param {null | { kind: 'zip'; ab: ArrayBuffer; fileName: string } | { kind: 'html'; fileName: string; parsed: any } | { kind: 'json'; fileName: string; text: string }} pending
 * @param {{ trades: any; glossary: any; userProfile: any; forceCurrency?: string }} api
 */
export async function applyJournalImport(pending, api) {
  const p = pending;
  if (!p) {
    toasts.error('Нет данных для импорта', { ttl: 5000 });
    return false;
  }
  const { trades, glossary, userProfile } = api;
  const forceCurrency = api.forceCurrency ? String(api.forceCurrency).toUpperCase().trim() : '';

  try {
    if (p.kind === 'zip') {
      await importJournalZip(p.ab, {
        setTrades: (rows) => trades.importTrades(rows),
        importGlossary: (g) => glossary.importState(g)
      });
      if (forceCurrency) userProfile.updateProfile({ accountCurrency: forceCurrency });
      return true;
    }

    if (p.kind === 'html') {
      const parsed = p.parsed;
      const existingById = new Map(get(trades).map((trade) => [trade.id, trade]));
      for (const importedTrade of parsed.trades) {
        existingById.set(importedTrade.id, importedTrade);
      }
      trades.importTrades(Array.from(existingById.values()));
      if (parsed.reportType === 'history' || parsed.reportType === 'trade') {
        const ccySafe = sanitizeImportedAccountCurrency(parsed.statementCurrency);
        const eq = Number(parsed.summary?.equity);
        const patch = {};
        if (ccySafe) patch.accountCurrency = ccySafe;
        if (Number.isFinite(eq)) {
          const rs = get(fxRate);
          const merged = get(trades);
          const closedSum = merged
            .filter((t) => t.status === 'closed')
            .reduce((s, t) => s + tradeProfitDisplayUnits(t, rs), 0);
          const openTrades = merged.filter((t) => t.status === 'open');
          const floatingSum = getOpenFloatingPnL(openTrades, get(livePrices), (t) =>
            normalizeSymbolKey(t.pair), rs);
          const nextInitialCapital = eq - closedSum - floatingSum;
          if (Number.isFinite(nextInitialCapital) && nextInitialCapital >= 0) {
            patch.initialCapital = nextInitialCapital;
          }
        }
        if (Object.keys(patch).length > 0) userProfile.updateProfile(patch);
      }
      toasts.info(`Импорт MT5 (${parsed.reportType}): ${parsed.trades.length} сделок`, { ttl: 6000 });
      return true;
    }

    if (p.kind === 'json') {
      trades.importTrades(JSON.parse(p.text));
      if (forceCurrency) userProfile.updateProfile({ accountCurrency: forceCurrency });
      toasts.info('JSON сделок импортирован (глоссарий не менялся)', { ttl: 5000 });
      return true;
    }
  } catch (err) {
    console.error(err);
    toasts.error('Ошибка импорта', { ttl: 8000 });
    return false;
  }
  return false;
}
