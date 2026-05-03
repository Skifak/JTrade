<script>
  import { tick, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { trades, userProfile } from '../lib/stores';
  import { glossary } from '../lib/glossary';
  import { journalAccounts, activeJournalAccount, activeJournalAccountId } from '../lib/accounts';
  import { buildJournalZip } from '../lib/journalBundle';
  import { buildJournalExportBasename } from '../lib/journalExportName';
  import { validateLatinAccountName } from '../lib/accountValidation';
  import {
    applyJournalImport,
    describeImportPending,
    countTradesInImportPending
  } from '../lib/journalImportApply';
  import { parseMt5ReportHtml } from '../lib/mt5Parser';
  import { calculateStats, formatNumber } from '../lib/utils';
  import { fxRate, tradeProfitDisplayUnits } from '../lib/fxRate';
  import { v4 as uuidv4 } from 'uuid';
  import Modal from './Modal.svelte';

  const dispatch = createEventDispatcher();

  /** `onboarding` — только мастер создания (для модалки первого счёта) */
  export let variant = 'full';

  /** В профиле: `account` — только текущий счёт / экспорт; `create` — только мастер создания. */
  export let profileSplit = undefined;

  /** В onboarding режим выбран родителем (шаг «чистый» / «импорт»). */
  export let forcedWizardMode = null;

  /** @type {null | 'clean' | 'import'} */
  let creationMode = null;

  $: if (variant === 'onboarding' && forcedWizardMode && !postCreateSummary) {
    creationMode = forcedWizardMode;
  }
  let cleanName = '';
  let cleanCurrency = 'USD';
  let cleanCapital = 10000;
  let cleanNameHint = '';

  let importName = '';
  let importNameHint = '';
  /** @type {null | { kind: 'zip'; ab: ArrayBuffer; fileName: string; fileLastModified?: number } | { kind: 'html'; fileName: string; parsed: any; fileLastModified?: number } | { kind: 'json'; fileName: string; text: string; fileLastModified?: number }}} */
  let importPending = null;
  let importForceCurrency = 'USD';

  let createBusy = false;
  /** @type {null | { kind: string; lines: string[]; stats?: ReturnType<typeof calculateStats> }} */
  let postCreateSummary = null;

  let infoOpen = false;
  let infoTitle = '';
  let infoLines = [];

  let deleteBusy = false;
  let wizardImportInput;
  /** input «Импорт в текущий» */
  let currentImportInput;

  /** Буфер файла перед подтверждением (отдельно от мастера нового счёта). */
  /** @type {null | { kind: 'zip'; ab: ArrayBuffer; fileName: string; fileLastModified?: number } | { kind: 'html'; fileName: string; parsed: any; fileLastModified?: number } | { kind: 'json'; fileName: string; text: string; fileLastModified?: number }}} */
  let importIntoCurrentPending = null;
  let importIntoCurrentBusy = false;
  let importIntoCurrentHint = '';
  /** @type {null | { title: string; lines: string[] }} */
  let importIntoCurrentPreview = null;

  $: current = $activeJournalAccount;
  $: canDeleteAccount = $journalAccounts.length > 0;
  $: needsForceCurrency =
    importPending && (importPending.kind === 'zip' || importPending.kind === 'json');

  /** Счёт с чистой историей — импорт в текущий запрещён (баланс задаётся вручную). */
  $: allowImportIntoCurrent =
    !!current && current.createdFrom !== 'clean';

  /** Сообщение при отказе импорта HTML MT5 (конкретнее общей фразы). */
  function mt5HtmlRejectHint(parsed) {
    if (parsed?.parseHint) return parsed.parseHint;
    if (!parsed?.looksLikeMt5) {
      return 'Не похоже на HTML-экспорт MT5. Сохраните из терминала: контекстное меню журнала → Отчёт, или отчёт по истории с блоком «Сделки».';
    }
    return 'Строки не извлечены: в «Отчёте торговой истории» нужна секция «Позиции» (закрашенные строки); в «Торговом отчёте» — «Позиции» с открытыми. Комментарии подтягиваются из «Сделки» (out), если блок есть.';
  }

  const currencyOptions = [
    ['USD', 'USD — Доллар США'],
    ['EUR', 'EUR — Евро'],
    ['GBP', 'GBP — Фунт'],
    ['JPY', 'JPY — Иена'],
    ['CHF', 'CHF — Франк'],
    ['CAD', 'CAD — Канадский $'],
    ['AUD', 'AUD — Австралийский $'],
    ['NZD', 'NZD — Новозеландский $'],
    ['USDT', 'USDT'],
    ['BTC', 'BTC — Биткоин']
  ];

  function resetWizard() {
    creationMode = null;
    cleanName = '';
    cleanNameHint = '';
    importName = '';
    importNameHint = '';
    importPending = null;
    importForceCurrency = 'USD';
    postCreateSummary = null;
    if (wizardImportInput) wizardImportInput.value = '';
  }

  function wizardBack() {
    if (variant === 'onboarding' && forcedWizardMode) {
      dispatch('back');
      return;
    }
    resetWizard();
  }

  function dismissPostCreate() {
    postCreateSummary = null;
    dispatch('postcreate-dismiss');
  }

  function formatFileInstant(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return null;
    try {
      return new Date(Number(ms)).toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } catch {
      return null;
    }
  }

  /** @param {string} entryId */
  function removeHistoryRow(entryId) {
    if (!current) return;
    const ok = confirm(
      'Удалить этот импорт из истории и все сделки, занесённые им (по метке пакета)?\n\nСделки без метки или со старыми импортами не затрагиваются.'
    );
    if (!ok) return;
    trades.removeTradesByJournalImportBatch(entryId);
    journalAccounts.removeImportHistoryEntry(current.id, entryId);
  }

  /** @param {any} parsed */
  function fundsLineFromParsed(parsed) {
    if (!parsed) return null;
    const s = parsed.summary;
    const ccy = parsed.statementCurrency ? String(parsed.statementCurrency).toUpperCase() : '';
    if (s?.equity != null && Number.isFinite(Number(s.equity))) {
      const n = Number(s.equity);
      return ccy ? `${n} ${ccy}` : String(n);
    }
    if (s?.equityDisplay) return ccy ? `${s.equityDisplay}` : String(s.equityDisplay);
    if (parsed.equityRaw) return String(parsed.equityRaw);
    return null;
  }

  /** @param {typeof importPending} pending */
  function buildImportMetaFromPending(pending) {
    if (!pending) return null;
    const fileModifiedMs =
      pending.fileLastModified != null ? Number(pending.fileLastModified) : null;
    const fileInstant = formatFileInstant(fileModifiedMs);
    if (pending.kind === 'html') {
      const p = pending.parsed;
      const funds = fundsLineFromParsed(p);
      const reportDate = p?.reportGeneratedAt || fileInstant || null;
      return {
        fileName: pending.fileName,
        fileModifiedMs: Number.isFinite(fileModifiedMs) ? fileModifiedMs : null,
        sourceAccountTitle: p?.accountTitle || null,
        fundsDisplay: funds || null,
        reportDateDisplay: reportDate
      };
    }
    return {
      fileName: pending.fileName,
      fileModifiedMs: Number.isFinite(fileModifiedMs) ? fileModifiedMs : null,
      sourceAccountTitle: null,
      fundsDisplay: null,
      reportDateDisplay: fileInstant
    };
  }

  /** Метаданные импорта + число сделок в файле (для ZIP — async чтение бандла). */
  async function buildImportMetaSnapshot(pending) {
    const base = buildImportMetaFromPending(pending);
    if (!base || !pending) return null;
    const tc = await countTradesInImportPending(pending);
    return { ...base, tradeCount: tc };
  }

  async function importMetaSnapshotOrNull(pending) {
    if (!pending) return null;
    return buildImportMetaSnapshot(pending);
  }

  function startClean() {
    resetWizard();
    postCreateSummary = null;
    creationMode = 'clean';
  }

  function startImport() {
    resetWizard();
    postCreateSummary = null;
    creationMode = 'import';
  }

  /** Мастер создания счёта: читаем файл так же, как «Импорт» в шапке (FileReader), без async Blob.text(). */
  function onWizardFile(e) {
    const input = /** @type {HTMLInputElement | null} */ (e.currentTarget);
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    importNameHint = '';
    importPending = null;

    if (fileName.endsWith('.zip')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const ab = ev.target?.result;
          if (!(ab instanceof ArrayBuffer)) return;
          importPending = {
            kind: 'zip',
            ab,
            fileName: file.name,
            fileLastModified: file.lastModified
          };
        } finally {
          input.value = '';
        }
      };
      reader.onerror = () => {
        importNameHint = 'Не удалось прочитать ZIP';
        input.value = '';
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = String(ev.target?.result || '');
        if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
          const parsed = parseMt5ReportHtml(raw);
          if (!parsed.reportType || parsed.trades.length === 0) {
            importNameHint = mt5HtmlRejectHint(parsed);
            return;
          }
          importPending = {
            kind: 'html',
            fileName: file.name,
            parsed,
            fileLastModified: file.lastModified
          };
          return;
        }

        try {
          JSON.parse(raw);
          importPending = {
            kind: 'json',
            text: raw,
            fileName: file.name,
            fileLastModified: file.lastModified
          };
        } catch {
          importNameHint = 'Некорректный JSON';
        }
      } finally {
        input.value = '';
      }
    };
    reader.onerror = () => {
      importNameHint = 'Не удалось прочитать файл';
      input.value = '';
    };
    reader.readAsText(file);
  }

  async function showImportInfoFor(pending) {
    if (!pending) return;
    const { title, lines } = await describeImportPending(pending);
    infoTitle = title;
    infoLines = lines;
    infoOpen = true;
  }

  function cancelImportIntoCurrent() {
    importIntoCurrentPending = null;
    importIntoCurrentPreview = null;
    importIntoCurrentHint = '';
    importIntoCurrentBusy = false;
    if (currentImportInput) currentImportInput.value = '';
  }

  async function applyImportIntoCurrent() {
    const pending = importIntoCurrentPending;
    const acc = current;
    if (!pending || !acc) return;
    importIntoCurrentBusy = true;
    importIntoCurrentHint = '';
    try {
      const metaSnap = await buildImportMetaSnapshot(pending);
      const historyEntryId = `imp-${uuidv4()}`;
      const force =
        pending.kind === 'html'
          ? undefined
          : String($userProfile?.accountCurrency || 'USD').toUpperCase();
      const ok = await applyJournalImport(pending, {
        trades,
        glossary,
        userProfile,
        forceCurrency: force,
        importBatchId: historyEntryId
      });
      if (!ok) return;
      if (metaSnap) journalAccounts.setAccountImportMeta(acc.id, { ...metaSnap, historyEntryId });
      cancelImportIntoCurrent();
    } finally {
      importIntoCurrentBusy = false;
    }
  }

  /** Выбор файла для «Импорт в текущий»: только буфер + метаданные, без немедленного apply. */
  function onImportIntoCurrentFile(e) {
    const input = /** @type {HTMLInputElement | null} */ (e.currentTarget);
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    importIntoCurrentHint = '';
    importIntoCurrentPending = null;
    importIntoCurrentPreview = null;

    const fileName = file.name.toLowerCase();
    importIntoCurrentBusy = true;

    if (fileName.endsWith('.zip')) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const ab = ev.target?.result;
          if (!(ab instanceof ArrayBuffer)) return;
          importIntoCurrentPending = {
            kind: 'zip',
            ab,
            fileName: file.name,
            fileLastModified: file.lastModified
          };
          importIntoCurrentPreview = await describeImportPending(importIntoCurrentPending);
        } catch {
          importIntoCurrentHint = 'Ошибка разбора ZIP';
        } finally {
          importIntoCurrentBusy = false;
          input.value = '';
        }
      };
      reader.onerror = () => {
        importIntoCurrentHint = 'Не удалось прочитать ZIP';
        importIntoCurrentBusy = false;
        input.value = '';
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = String(ev.target?.result || '');
        if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
          const parsed = parseMt5ReportHtml(raw);
          if (!parsed.reportType || parsed.trades.length === 0) {
            importIntoCurrentHint = mt5HtmlRejectHint(parsed);
            return;
          }
          importIntoCurrentPending = {
            kind: 'html',
            fileName: file.name,
            parsed,
            fileLastModified: file.lastModified
          };
          importIntoCurrentPreview = await describeImportPending(importIntoCurrentPending);
          return;
        }

        try {
          JSON.parse(raw);
          importIntoCurrentPending = {
            kind: 'json',
            text: raw,
            fileName: file.name,
            fileLastModified: file.lastModified
          };
          importIntoCurrentPreview = await describeImportPending(importIntoCurrentPending);
        } catch {
          importIntoCurrentHint = 'Некорректный JSON';
        }
      } finally {
        importIntoCurrentBusy = false;
        input.value = '';
      }
    };
    reader.onerror = () => {
      importIntoCurrentHint = 'Не удалось прочитать файл';
      importIntoCurrentBusy = false;
      input.value = '';
    };
    reader.readAsText(file);
  }

  async function exportZip() {
    const acc = current;
    if (!acc) return;
    const blob = await buildJournalZip(
      () => get(trades),
      () => get(glossary)
    );
    const base = buildJournalExportBasename(acc.name, acc.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const acc = current;
    if (!acc) return;
    const data = get(trades);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const base = buildJournalExportBasename(acc.name, acc.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitClean() {
    const v = validateLatinAccountName(cleanName);
    if (!v.ok) {
      cleanNameHint = v.message;
      return;
    }
    cleanNameHint = '';
    createBusy = true;
    try {
      if (variant === 'onboarding') dispatch('will-create-account');
      const id = journalAccounts.create(v.name, { createdFrom: 'clean' });
      if (!id) return;
      await tick();
      userProfile.updateProfile({
        accountCurrency: String(cleanCurrency || 'USD').toUpperCase(),
        initialCapital: Number(cleanCapital) || 0
      });
      await tick();
      dispatch('account-profile-seeded');
      const closed = get(trades).filter((t) => t.status === 'closed');
      const st = calculateStats(closed, {
        initialCapital: Number(cleanCapital) || 0,
        profitOf: (t) => tradeProfitDisplayUnits(t, get(fxRate))
      });
      postCreateSummary = {
        kind: 'clean',
        lines: [
          `Счёт «${v.name}» создан.`,
          `Валюта: ${String(cleanCurrency).toUpperCase()}, стартовый капитал: ${formatNumber(Number(cleanCapital) || 0, 2)}.`,
          `Закрытых сделок: ${st.totalTrades}.`
        ],
        stats: st
      };
      creationMode = null;
      cleanName = '';
    } finally {
      createBusy = false;
    }
  }

  async function submitImportWizard() {
    const v = validateLatinAccountName(importName);
    if (!v.ok) {
      importNameHint = v.message;
      return;
    }
    if (!importPending) {
      importNameHint = 'Сначала загрузи файл истории';
      return;
    }
    if (importPending.kind === 'zip' || importPending.kind === 'json') {
      if (!importForceCurrency) {
        importNameHint = 'Выбери валюту счёта';
        return;
      }
    }
    importNameHint = '';
    createBusy = true;
    try {
      if (variant === 'onboarding') dispatch('will-create-account');
      const id = journalAccounts.create(v.name, { createdFrom: 'import' });
      if (!id) return;
      await tick();
      const pendingSnap = importPending;
      const metaSnap = await buildImportMetaSnapshot(pendingSnap);
      const historyEntryId = `imp-${uuidv4()}`;
      const force =
        pendingSnap.kind === 'html'
          ? undefined
          : String(importForceCurrency || 'USD').toUpperCase();
      const ok = await applyJournalImport(pendingSnap, {
        trades,
        glossary,
        userProfile,
        forceCurrency: force,
        importBatchId: historyEntryId
      });
      if (!ok) return;

      await tick();
      dispatch('account-profile-seeded');

      if (metaSnap) journalAccounts.setAccountImportMeta(id, { ...metaSnap, historyEntryId });

      const prof = get(userProfile);
      const closed = get(trades).filter((t) => t.status === 'closed');
      const st = calculateStats(closed, {
        initialCapital: Number(prof?.initialCapital) || 0,
        profitOf: (t) => tradeProfitDisplayUnits(t, get(fxRate))
      });
      const lines = [
        `Счёт «${v.name}» создан, импорт выполнен.`,
        `Сделок в журнале: ${get(trades).length} (закрытых: ${closed.length}).`,
        `Валюта профиля: ${prof?.accountCurrency || '—'}, капитал (профиль): ${formatNumber(Number(prof?.initialCapital) || 0, 2)}.`
      ];
      if (pendingSnap.kind === 'html' && pendingSnap.parsed?.summary) {
        const s = pendingSnap.parsed.summary;
        if (s.equity != null) lines.push(`Сводка отчёта: средства ${s.equity}`);
      }
      postCreateSummary = { kind: 'import', lines, stats: st, importMeta: metaSnap };
      importPending = null;
      creationMode = null;
      importName = '';
      if (wizardImportInput) wizardImportInput.value = '';
    } finally {
      createBusy = false;
    }
  }

  async function confirmDeleteAccount() {
    if (!current || !canDeleteAccount) return;
    const ok = confirm(
      'Удалить счёт «' +
        current.name +
        '»?\n\nБудут удалены сделки, профиль, вложения, настройки этого счёта. Это необратимо.'
    );
    if (!ok) return;
    deleteBusy = true;
    try {
      await journalAccounts.removeAccountAndPurge(current.id);
      postCreateSummary = null;
    } finally {
      deleteBusy = false;
    }
  }
</script>

<div
  class="accounts-tab"
  class:onboarding-variant={variant === 'onboarding'}
  class:accounts-tab--stretch={variant === 'full'}
>
  {#if variant === 'full' && profileSplit !== 'create'}
  <div class="profile-section profile-section--full-width">
    <div class="profile-section-title">Текущий счёт</div>
    <div class="form-row">
      <div class="form-group grow">
        <label for="acc-active-sel">Активный счёт журнала</label>
        {#if $journalAccounts.length === 0}
          <p class="hint-inline-block">Нет счетов — создай первый во вкладке «Создание счёта».</p>
        {:else}
          <select
            id="acc-active-sel"
            class="account-select-full"
            value={$activeJournalAccountId}
            on:change={(e) => journalAccounts.setActive(e.currentTarget.value)}
          >
            {#each $journalAccounts as a}
              <option value={a.id}>{a.name}</option>
            {/each}
          </select>
        {/if}
      </div>
    </div>
    {#if current}
      <p class="accounts-meta-line">
        <span class="mono">id</span>: {current.id}
      </p>
    {/if}
    <div class="accounts-actions-row accounts-actions-row--stretch">
      <button type="button" class="btn btn-sm" disabled={!current} on:click={exportZip}>Экспорт ZIP</button>
      <button type="button" class="btn btn-sm" disabled={!current} on:click={exportJson}>Экспорт JSON</button>
      {#if allowImportIntoCurrent}
        <label class="btn btn-sm import-label-inline">
          Импорт в текущий
          <input
            bind:this={currentImportInput}
            type="file"
            accept=".json,.html,.htm,.zip"
            hidden
            on:change={onImportIntoCurrentFile}
          />
        </label>
      {/if}
    </div>
    {#if allowImportIntoCurrent && importIntoCurrentBusy}
      <p class="hint-inline-block import-into-current-status">Чтение и разбор файла…</p>
    {/if}
    {#if allowImportIntoCurrent && importIntoCurrentHint}
      <div class="field-warning narrow-warning">{importIntoCurrentHint}</div>
    {/if}
    {#if allowImportIntoCurrent && importIntoCurrentPending && !importIntoCurrentBusy}
      {#await importMetaSnapshotOrNull(importIntoCurrentPending)}
        <div class="import-meta-box compact import-into-current-preview">
          <div class="import-meta-heading">Импорт в текущий счёт — проверь данные и примени</div>
          <p class="hint-inline-block muted">Метаданные и число сделок в файле…</p>
        </div>
      {:then metaIc}
        <div class="import-meta-box compact import-into-current-preview">
          <div class="import-meta-heading">Импорт в текущий счёт — проверь данные и примени</div>
          {#if metaIc}
            <dl class="import-meta-dl import-meta-dl-tight">
              {#if metaIc.tradeCount != null}
                <dt>Сделок в импорте</dt>
                <dd>{metaIc.tradeCount}</dd>
              {/if}
              {#if metaIc.sourceAccountTitle}
                <dt>Счёт в отчёте</dt>
                <dd>{metaIc.sourceAccountTitle}</dd>
              {/if}
              {#if metaIc.fundsDisplay}
                <dt>Средства</dt>
                <dd>{metaIc.fundsDisplay}</dd>
              {/if}
              {#if metaIc.reportDateDisplay}
                <dt>Дата отчёта / файла</dt>
                <dd>{metaIc.reportDateDisplay}</dd>
              {/if}
              {#if metaIc.fileName}
                <dt>Файл</dt>
                <dd class="mono">{metaIc.fileName}</dd>
              {/if}
            </dl>
          {/if}
          <div class="accounts-actions-row wrap">
            <button
              type="button"
              class="btn btn-sm"
              disabled={importIntoCurrentBusy}
              on:click={() => showImportInfoFor(importIntoCurrentPending)}>Вся информация</button>
            <button type="button" class="btn btn-sm" disabled={importIntoCurrentBusy} on:click={cancelImportIntoCurrent}
              >Отмена</button>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              disabled={importIntoCurrentBusy}
              on:click={applyImportIntoCurrent}>Применить импорт</button>
          </div>
        </div>
      {/await}
    {/if}
    {#if allowImportIntoCurrent}
      <p class="hint-inline-block">
        После выбора файла показываются метаданные и кнопка «Применить импорт». HTML (MT5) объединяет сделки и
        подставляет капитал и валюту по сводке отчёта. ZIP заменяет сделки и глоссарий (валюта — как в профиле).
        JSON — только сделки (валюта как в профиле).
      </p>
    {:else if current?.createdFrom === 'clean'}
      <p class="hint-inline-block">
        Счёт с чистой историей: импорт сделок в текущий отключён — пополняй баланс в настройках профиля и веди журнал
        вручную.
      </p>
    {/if}
    {#if current?.importHistory?.length}
      <div class="import-history-block">
        <div class="import-history-head">
          <span class="import-history-title">История импортов</span>
          <span class="import-history-count" title="Записей в списке">{current.importHistory.length}</span>
        </div>
        <p class="import-history-lede muted">
          Новые сверху. Удаление строки убирает сделки с меткой этого импорта. Записи до метки пакета затрагивают только
          список; «Сделок в импорте» — число строк в файле той операции.
        </p>
        <ul class="import-history-list">
          {#each current.importHistory as entry, i (entry.id)}
            {@const fileModStr = formatFileInstant(entry.fileModifiedMs)}
            <li class="import-history-card" class:import-history-card--latest={i === 0}>
              <div class="import-history-card-row">
                <div class="import-history-labels">
                  {#if i === 0}
                    <span class="import-history-pill">Последний</span>
                  {/if}
                  <span class="import-history-stamp">{formatFileInstant(entry.importedAtMs) ?? '—'}</span>
                </div>
                <button
                  type="button"
                  class="import-history-remove"
                  title="Удалить импорт и связанные сделки"
                  aria-label="Удалить импорт и связанные сделки"
                  on:click={() => removeHistoryRow(entry.id)}>×</button>
              </div>
              {#if entry.fileName || fileModStr}
                <p class="import-history-file mono muted">
                  {#if entry.fileName}<span>{entry.fileName}</span>{/if}{#if entry.fileName && fileModStr}<span>
                      · </span>{/if}{#if fileModStr}<span>изм. {fileModStr}</span>{/if}
                </p>
              {/if}
              <dl class="import-meta-dl import-meta-dl-tight import-history-dl">
                {#if entry.sourceAccountTitle}
                  <dt>Счёт в файле</dt>
                  <dd>{entry.sourceAccountTitle}</dd>
                {/if}
                {#if entry.fundsDisplay}
                  <dt>Средства</dt>
                  <dd>{entry.fundsDisplay}</dd>
                {/if}
                {#if entry.reportDateDisplay}
                  <dt>Дата отчёта</dt>
                  <dd>{entry.reportDateDisplay}</dd>
                {/if}
                {#if entry.tradeCount != null}
                  <dt>Сделок в импорте</dt>
                  <dd>{entry.tradeCount}</dd>
                {/if}
              </dl>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <div class="profile-section profile-section--full-width">
    <div class="profile-section-title">Удаление</div>
    <button
      type="button"
      class="btn btn-sm danger-outline"
      disabled={!canDeleteAccount || deleteBusy}
      on:click={confirmDeleteAccount}
    >
      Удалить текущий счёт…
    </button>
    {#if $journalAccounts.length === 1}
      <p class="hint-inline-block">Это единственный счёт — после удаления снова откроется окно создания.</p>
    {/if}
  </div>
  {/if}

  {#if variant === 'onboarding' || (variant === 'full' && profileSplit !== 'account')}
  <div class="profile-section profile-section--full-width">
    <div class="profile-section-title">
      {variant === 'onboarding' ? 'Первый счёт журнала' : 'Новый счёт'}
    </div>
    {#if !creationMode && !(variant === 'onboarding' && forcedWizardMode)}
      <div class="wizard-type-buttons">
        <button type="button" class="btn wizard-type-btn" on:click={startClean}>Создать счёт с чистой историей</button>
        <button type="button" class="btn btn-primary wizard-type-btn" on:click={startImport}
          >Создать счёт с импортом сделок</button>
      </div>
    {:else if creationMode === 'clean'}
      <p class="wizard-hint">Задай параметры нового счёта.</p>
      <div class="form-row">
        <div class="form-group grow">
          <label for="new-clean-name">Название счёта (латиница)</label>
          <input id="new-clean-name" type="text" bind:value={cleanName} placeholder="e.g. MainProp" />
          {#if cleanNameHint}
            <div class="field-warning">{cleanNameHint}</div>
          {/if}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="new-clean-ccy">Валюта счёта</label>
          <select id="new-clean-ccy" bind:value={cleanCurrency}>
            {#each currencyOptions as [v, label]}
              <option value={v}>{label}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="new-clean-cap">Начальный баланс</label>
          <input id="new-clean-cap" type="number" min="0" step="10" bind:value={cleanCapital} />
        </div>
      </div>
      <div class="accounts-actions-row">
        <button type="button" class="btn" on:click={wizardBack}>Назад</button>
        <button type="button" class="btn btn-primary" disabled={createBusy} on:click={submitClean}
        >Создать счёт</button>
      </div>
    {:else if creationMode === 'import'}
      <p class="wizard-hint">
        Файл остаётся в буфере до нажатия «Создать счёт». Для ZIP/JSON укажи валюту счёта (поверх данных
        архива).
      </p>
      <div class="form-row">
        <div class="form-group grow">
          <label for="new-imp-name">Название счёта (латиница)</label>
          <input id="new-imp-name" type="text" bind:value={importName} placeholder="e.g. FTMO_2" />
          {#if importNameHint}
            <div class="field-warning">{importNameHint}</div>
          {/if}
        </div>
      </div>
      <div class="accounts-actions-row wrap">
        <label class="btn btn-sm import-label-inline">
          Загрузить историю сделок
          <input
            bind:this={wizardImportInput}
            type="file"
            accept=".json,.html,.htm,.zip"
            hidden
            on:change={onWizardFile}
          />
        </label>
        {#if importPending}
          <button
            type="button"
            class="btn btn-sm"
            on:click={() => importPending && showImportInfoFor(importPending)}>Посмотреть информацию импорта</button>
        {/if}
      </div>
      {#if importPending && needsForceCurrency}
        <div class="form-group narrow-top">
          <label for="new-imp-force-ccy">Валюта счёта (для ZIP/JSON)</label>
          <select id="new-imp-force-ccy" bind:value={importForceCurrency}>
            {#each currencyOptions as [v, label]}
              <option value={v}>{label}</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="accounts-actions-row">
        <button type="button" class="btn" on:click={wizardBack}>Назад</button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={createBusy || !importPending}
          on:click={submitImportWizard}
        >Создать счёт</button>
      </div>
    {/if}
  </div>
  {/if}

  {#if postCreateSummary && (variant === 'onboarding' || profileSplit === 'create')}
    <div class="profile-section post-create-card profile-section--full-width">
      <div class="profile-section-title">Результат</div>
      <ul class="post-create-list">
        {#each postCreateSummary.lines as line}
          <li>{line}</li>
        {/each}
      </ul>
      {#if postCreateSummary.stats && postCreateSummary.stats.totalTrades > 0}
        <div class="post-create-stats">
          <span>Win rate: {formatNumber(postCreateSummary.stats.winRate, 1)}%</span>
          <span
            >Net P/L: {formatNumber(postCreateSummary.stats.netProfit, 2)}
            {$userProfile?.accountCurrency || ''}</span
          >
        </div>
      {/if}
      {#if postCreateSummary.kind === 'import' && postCreateSummary.importMeta}
        <div class="import-meta-box">
          <div class="import-meta-heading">Данные из файла импорта</div>
          <dl class="import-meta-dl">
            {#if postCreateSummary.importMeta.sourceAccountTitle}
              <dt>Счёт в отчёте</dt>
              <dd>{postCreateSummary.importMeta.sourceAccountTitle}</dd>
            {/if}
            {#if postCreateSummary.importMeta.fundsDisplay}
              <dt>Средства</dt>
              <dd>{postCreateSummary.importMeta.fundsDisplay}</dd>
            {/if}
            {#if postCreateSummary.importMeta.reportDateDisplay}
              <dt>Дата отчёта / файла</dt>
              <dd>{postCreateSummary.importMeta.reportDateDisplay}</dd>
            {/if}
            {#if postCreateSummary.importMeta.tradeCount != null}
              <dt>Сделок в импорте</dt>
              <dd>{postCreateSummary.importMeta.tradeCount}</dd>
            {/if}
            {#if postCreateSummary.importMeta.fileName}
              <dt>Файл</dt>
              <dd class="mono">{postCreateSummary.importMeta.fileName}</dd>
            {/if}
          </dl>
        </div>
      {/if}
      <button type="button" class="btn btn-sm" on:click={dismissPostCreate}>Скрыть</button>
    </div>
  {/if}
</div>

<Modal open={infoOpen} modalClass="import-info-modal" on:close={() => (infoOpen = false)}>
  <div slot="header">
    <h2 class="modal-title-inline">Информация импорта</h2>
  </div>
  <div slot="body">
    <p class="mono muted">{infoTitle}</p>
    <ul class="import-info-list">
      {#each infoLines as line}
        <li>{line}</li>
      {/each}
    </ul>
  </div>
  <div slot="footer">
    <button type="button" class="btn" on:click={() => (infoOpen = false)}>Закрыть</button>
  </div>
</Modal>

<style>
  .accounts-tab {
    max-width: 720px;
  }
  .accounts-tab--stretch {
    max-width: none;
    width: 100%;
  }
  .accounts-tab.onboarding-variant {
    max-width: none;
  }
  .profile-section--full-width {
    width: 100%;
    box-sizing: border-box;
  }
  .wizard-type-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%;
  }
  @media (max-width: 640px) {
    .wizard-type-buttons {
      grid-template-columns: 1fr;
    }
  }
  .wizard-type-btn {
    width: 100%;
    justify-content: center;
    text-align: center;
    min-height: 40px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .accounts-actions-row--stretch {
    width: 100%;
    justify-content: flex-start;
  }

  .account-select-full {
    width: 100%;
    max-width: none;
    padding: 6px 10px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
  }
  .accounts-meta-line {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .accounts-actions-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .accounts-actions-row.wrap {
    margin-top: 8px;
  }
  .wizard-hint {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .field-warning {
    margin-top: 6px;
    font-size: 12px;
    color: var(--danger, #c44);
  }
  .narrow-top {
    margin-top: 12px;
  }
  .hint-inline-block {
    margin: 10px 0 0;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .danger-outline {
    border-color: color-mix(in srgb, var(--loss, #c44) 55%, var(--border));
    color: var(--loss, #c44);
    background: transparent;
  }
  .post-create-card {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .post-create-list {
    margin: 0 0 12px;
    padding-left: 18px;
    line-height: 1.5;
    font-size: 13px;
  }
  .post-create-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .modal-title-inline {
    margin: 0;
    font-size: 1.05rem;
  }
  .import-info-list {
    margin: 0;
    padding-left: 18px;
    line-height: 1.5;
  }
  .import-meta-dl-tight {
    margin-top: 8px;
  }
  .narrow-warning {
    margin-top: 8px;
  }
  .import-into-current-preview {
    margin-top: 12px;
  }
  .muted {
    color: var(--text-muted);
    font-size: 12px;
  }
  .import-meta-box {
    margin: 12px 0 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
  .import-meta-box.compact {
    margin-top: 10px;
  }
  .import-meta-heading {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: 8px;
  }
  .import-meta-dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    font-size: 12.5px;
    line-height: 1.4;
  }
  .import-meta-dl dt {
    margin: 0;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .import-meta-dl dd {
    margin: 0;
    color: var(--text);
  }
  .import-history-block {
    margin-top: 14px;
    padding: 10px 11px 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 92%, var(--accent) 8%);
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--accent) 5%, var(--bg)) 0%,
      color-mix(in srgb, var(--bg) 97%, var(--border)) 100%
    );
  }
  .import-history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .import-history-title {
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.02em;
    color: var(--text-strong);
  }
  .import-history-count {
    font-size: 10px;
    font-weight: 600;
    min-width: 1.35rem;
    text-align: center;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, var(--bg));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .import-history-lede {
    margin: 0 0 7px;
    font-size: 10px;
    line-height: 1.35;
  }
  .import-history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .import-history-card {
    position: relative;
    padding: 6px 8px 6px 11px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 94%, var(--border));
    box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 40%, transparent);
  }
  .import-history-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--border) 70%, var(--accent));
    opacity: 0.85;
  }
  .import-history-card--latest {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
    background: color-mix(in srgb, var(--accent) 7%, var(--bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .import-history-card--latest::before {
    background: var(--accent);
    opacity: 1;
  }
  .import-history-card-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 3px;
  }
  .import-history-labels {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .import-history-pill {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 22%, var(--bg));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .import-history-stamp {
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .import-history-file {
    margin: 0 0 3px;
    font-size: 10px;
    line-height: 1.25;
    word-break: break-all;
  }
  .import-history-dl {
    font-size: 10.5px;
    line-height: 1.25;
    gap: 1px 10px;
  }
  .import-history-remove {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    line-height: 1;
    font-size: 15px;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--loss, #c44) 35%, var(--border));
    background: transparent;
    color: var(--loss, #c44);
    cursor: pointer;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
  }
  .import-history-remove:hover {
    background: color-mix(in srgb, var(--loss, #c44) 12%, var(--bg));
    border-color: color-mix(in srgb, var(--loss, #c44) 55%, var(--border));
  }
</style>
