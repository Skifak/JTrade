<script>
  import { tick, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { trades, userProfile } from '../lib/stores';
  import { glossary } from '../lib/glossary';
  import { journalAccounts, activeJournalAccount, activeJournalAccountId } from '../lib/accounts';
  import { buildJournalZip } from '../lib/journalBundle';
  import { buildJournalExportBasename } from '../lib/journalExportName';
  import { validateLatinAccountName } from '../lib/accountValidation';
  import { applyJournalImport, describeImportPending } from '../lib/journalImportApply';
  import { parseMt5ReportHtml } from '../lib/mt5Parser';
  import { calculateStats, formatNumber } from '../lib/utils';
  import { fxRate, tradeProfitDisplayUnits } from '../lib/fxRate';
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

  async function showImportInfo() {
    const { title, lines } = await describeImportPending(importPending);
    infoTitle = title;
    infoLines = lines;
    infoOpen = true;
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

  async function onImportCurrentFile(e) {
    const input = /** @type {HTMLInputElement | null} */ (e.currentTarget);
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    importNameHint = '';

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const ab = await file.arrayBuffer();
        await applyJournalImport(
          { kind: 'zip', ab, fileName: file.name },
          {
            trades,
            glossary,
            userProfile,
            forceCurrency: String($userProfile?.accountCurrency || 'USD').toUpperCase()
          }
        );
        return;
      }

      const text = await file.text();
      const fn = file.name.toLowerCase();
      if (fn.endsWith('.html') || fn.endsWith('.htm')) {
        const parsed = parseMt5ReportHtml(text);
        if (!parsed.reportType || parsed.trades.length === 0) {
          importNameHint = mt5HtmlRejectHint(parsed);
          return;
        }
        await applyJournalImport({ kind: 'html', fileName: file.name, parsed }, { trades, glossary, userProfile });
        return;
      }

      try {
        JSON.parse(text);
        await applyJournalImport(
          { kind: 'json', text, fileName: file.name },
          {
            trades,
            glossary,
            userProfile,
            forceCurrency: String($userProfile?.accountCurrency || 'USD').toUpperCase()
          }
        );
      } catch {
        importNameHint = 'Некорректный JSON';
      }
    } finally {
      input.value = '';
    }
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
      const metaSnap = buildImportMetaFromPending(pendingSnap);
      const force =
        pendingSnap.kind === 'html'
          ? undefined
          : String(importForceCurrency || 'USD').toUpperCase();
      const ok = await applyJournalImport(pendingSnap, {
        trades,
        glossary,
        userProfile,
        forceCurrency: force
      });
      if (!ok) return;

      if (metaSnap) journalAccounts.setAccountImportMeta(id, metaSnap);

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
        if (s.netProfit != null) lines.push(`Чистая прибыль (отчёт): ${s.netProfit}`);
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
      {#if current.importMeta}
        <div class="import-meta-box compact">
          <div class="import-meta-heading">Последний импорт в этот счёт</div>
          <dl class="import-meta-dl">
            {#if current.importMeta.sourceAccountTitle}
              <dt>Счёт в файле</dt>
              <dd>{current.importMeta.sourceAccountTitle}</dd>
            {/if}
            {#if current.importMeta.fundsDisplay}
              <dt>Средства</dt>
              <dd>{current.importMeta.fundsDisplay}</dd>
            {/if}
            {#if current.importMeta.reportDateDisplay}
              <dt>Дата отчёта / файла</dt>
              <dd>{current.importMeta.reportDateDisplay}</dd>
            {/if}
            {#if current.importMeta.fileName}
              <dt>Файл</dt>
              <dd class="mono">{current.importMeta.fileName}</dd>
            {/if}
          </dl>
        </div>
      {/if}
    {/if}
    <div class="accounts-actions-row accounts-actions-row--stretch">
      <button type="button" class="btn btn-sm" disabled={!current} on:click={exportZip}>Экспорт ZIP</button>
      <button type="button" class="btn btn-sm" disabled={!current} on:click={exportJson}>Экспорт JSON</button>
      {#if allowImportIntoCurrent}
        <label class="btn btn-sm import-label-inline">
          Импорт в текущий
          <input
            type="file"
            accept=".json,.html,.htm,.zip"
            hidden
            on:change={onImportCurrentFile}
          />
        </label>
      {/if}
    </div>
    {#if allowImportIntoCurrent}
      <p class="hint-inline-block">
        Импорт HTML (MT5) объединяет сделки и перезаписывает капитал и валюту по сводке отчёта. ZIP заменяет
        сделки и глоссарий; для ZIP/JSON валюта как в текущем профиле.
      </p>
    {:else if current?.createdFrom === 'clean'}
      <p class="hint-inline-block">
        Счёт с чистой историей: импорт сделок в текущий отключён — пополняй баланс в настройках профиля и веди журнал
        вручную.
      </p>
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
          <button type="button" class="btn btn-sm" on:click={showImportInfo}>Посмотреть информацию импорта</button>
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
</style>
