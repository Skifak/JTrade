<script>
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import dayjs from 'dayjs';
  import { createNewTrade, closeTrade, calculateProfit, isBrokerImportedTrade, formatNumber, snapshotTradeTemplateFields, normalizeStoredTradeTemplate } from '../lib/utils';
  import { trades, userProfile, templates } from '../lib/stores';
  import {
    draftStorageKeyAdd,
    draftStorageKeyEdit,
    loadDraftRaw,
    saveDraftRaw,
    clearDraftRaw,
    meaningfulDraftAdd,
    meaningfulDraftEdit,
    buildDraftPayload,
    validateDraftForApply,
    tradeFormDraftFingerprint
  } from '../lib/tradeFormDraft.js';
  import { v4 as uuidv4 } from 'uuid';
  import { PAIRS, normalizeSymbolKey } from '../lib/constants';
  import { supportsFormMarketFill } from '../lib/marketData.js';
  import {
    calculateTradeRisk,
    suggestVolumeForRisk,
    evaluateTradeRules,
    evaluatePostCloseTradeRules,
    computeMaxRiskAmount,
    getCurrentRiskScale,
    normalizeProfileGateRules,
    countClosedTradesOnDay,
    tradeHasChartAttachment,
    stripPostCloseChartViolations
  } from '../lib/risk';
  import { cooldown } from '../lib/cooldown';
  import { tickClock, livePrices, formPairs } from '../lib/livePrices';
  import { fxRate, formatMoney, formatAccountMoney, convertUsd, currencySymbol } from '../lib/fxRate';
  import { strategies, findPlay } from '../lib/playbooks';
  import { primaryKillzone, killzoneLabel } from '../lib/killzones';
  import { journalSettings } from '../lib/journalSettings';
  import { ICT_GROUPS, isIctTag, prettyTag } from '../lib/ictTaxonomy';
  import { htfBias, findActiveBias, isAlignedWithBias, biasLabel } from '../lib/htfBias';
  import Modal from './Modal.svelte';
  import PairPicker from './PairPicker.svelte';
  import RiskConfirmModal from './RiskConfirmModal.svelte';
  import BiasModal from './BiasModal.svelte';
  import { toasts } from '../lib/toasts';

  const dispatch = createEventDispatcher();
  export let open = false;
  export let trade = null;
  export let mode = 'add';

  let formData = {};
  let useCurrentTime = true;
  let closePrice = 0;
  let previewProfit = null;

  let useMarketPrice = false;
  let marketLoading = false;
  let marketError = '';
  let marketSource = '';
  let marketTimestamp = null;

  // Soft-confirm для нарушений
  let pendingViolations = [];
  let showRiskConfirm = false;
  let pendingMode = null;

  // Notes checklist — какие пункты уже отметил пользователь
  let acknowledgedChecklist = [];
  // Playbook checklist — отмеченные правила выбранного play
  let acknowledgedPlayRules = [];
  // Bias modal
  let showBiasModal = false;

  /** Черновик формы */
  let draftBannerVisible = false;
  /** @type {Record<string, unknown> | null} */
  let pendingDraft = null;
  let prevOpenKey = '';
  let persistTimer = null;

  /** Сопоставляет id правил с черновиком (старые черновики могли хранить подписи строк). */
  function unifyAcknowledgedChecklistIds(rules, saved) {
    const list = Array.isArray(rules) ? rules : [];
    const arr = Array.isArray(saved) ? saved : [];
    return [
      ...new Set(
        arr
          .map((v) => {
            if (list.some((r) => r.id === v)) return v;
            const byLabel = list.find((r) => r.label === v);
            return byLabel ? byLabel.id : null;
          })
          .filter((id) => id && list.some((r) => r.id === id))
      )
    ];
  }

  $: profileGateRulesList = normalizeProfileGateRules($userProfile);
  $: profileGateChecklistOn = $userProfile?.profileNotesChecklistEnabled !== false;

  function toggleChecklistItem(ruleId) {
    if (acknowledgedChecklist.includes(ruleId)) {
      acknowledgedChecklist = acknowledgedChecklist.filter((v) => v !== ruleId);
    } else {
      acknowledgedChecklist = [...acknowledgedChecklist, ruleId];
    }
  }

  // ----- Plays / Strategies -----
  $: selectedPlay = formData.strategyId && formData.playId
    ? findPlay($strategies, formData.strategyId, formData.playId)
    : null;
  $: playRules = selectedPlay
    ? [
        ...(selectedPlay.preconditions || []).map((r) => ({ ...r, kind: 'pre' })),
        ...(selectedPlay.entryConditions || []).map((r) => ({ ...r, kind: 'entry' }))
      ]
    : [];
  $: if (open) {
    acknowledgedChecklist = unifyAcknowledgedChecklistIds(profileGateRulesList, acknowledgedChecklist);
    acknowledgedPlayRules = acknowledgedPlayRules.filter((id) => playRules.some((r) => r.id === id));
  }
  function togglePlayRule(id) {
    if (acknowledgedPlayRules.includes(id)) {
      acknowledgedPlayRules = acknowledgedPlayRules.filter((x) => x !== id);
    } else {
      acknowledgedPlayRules = [...acknowledgedPlayRules, id];
    }
  }
  function selectStrategy(stratId) {
    const strat = $strategies.find((s) => s.id === stratId);
    formData = {
      ...formData,
      strategyId: stratId,
      playId: strat?.plays?.[0]?.id || null
    };
    acknowledgedPlayRules = [];
  }
  function selectPlay(pId) {
    formData = { ...formData, playId: pId };
    acknowledgedPlayRules = [];
  }
  function clearPlay() {
    formData = { ...formData, strategyId: null, playId: null };
    acknowledgedPlayRules = [];
  }

  // ----- Killzone (auto from dateOpen) -----
  $: journalSnap = $journalSettings;
  $: kzId = (journalSnap, primaryKillzone(formData.dateOpen));
  $: kzLabel = (journalSnap, killzoneLabel(kzId));

  // ----- HTF Bias -----
  $: activeBias = findActiveBias($htfBias, formData.pair);
  $: biasAligned = isAlignedWithBias(activeBias, formData.direction);
  $: biasLabelText = biasLabel(activeBias);

  // ----- ICT tag selector -----
  function toggleIctTag(key) {
    const cur = Array.isArray(formData.tags) ? formData.tags : [];
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    formData = { ...formData, tags: next };
  }
  
  $: if (trade && open) {
    formData = { ...trade };
    useCurrentTime = !trade.dateOpenManual;
  } else if (!trade && open) {
    formData = createNewTrade();
    useCurrentTime = true;
  }

  $: if (!open) {
    useMarketPrice = false;
    marketLoading = false;
    marketError = '';
    marketSource = '';
    marketTimestamp = null;
    formPairs.set([]);
  }

  // Когда форма открыта и «По рынку» включено — подписываем WS на пару формы.
  // Только FX и крипта (индексы / металлы / сырьё — без автоподстановки).
  $: supportsMarketFill =
    open && (mode === 'add' || mode === 'edit') && supportsFormMarketFill(formData?.pair);

  $: if (supportsMarketFill === false && open && (mode === 'add' || mode === 'edit') && useMarketPrice) {
    useMarketPrice = false;
    marketLoading = false;
    marketError = '';
    marketSource = '';
    marketTimestamp = null;
  }

  $: shouldTrackForm =
    supportsMarketFill && useMarketPrice && (mode === 'add' || mode === 'edit') && !!formData?.pair;
  $: formPairs.set(shouldTrackForm ? [formData.pair] : []);

  // Реактивный pull live-цены в формовое поле priceOpen.
  $: if (shouldTrackForm) {
    const key = normalizeSymbolKey(formData.pair);
    const lp = $livePrices[key];
    if (lp?.price != null && Number.isFinite(Number(lp.price))) {
      const next = Number(lp.price);
      if (Number(formData.priceOpen) !== next) {
        formData.priceOpen = next;
      }
      marketSource = lp.source || `WS · ${formData.pair}`;
      marketTimestamp = lp.timestamp || lp.lastChangeAt || Date.now();
      marketError = '';
      marketLoading = false;
    } else if (lp?.error) {
      marketError = lp.error;
      marketLoading = false;
    } else {
      marketLoading = true;
      marketError = '';
    }
  }

  // Кнопка ↻ — форсит ре-подписку (на случай если WS был закрыт по какой-то
  // причине). Реально просто сбрасываем formPairs и ставим обратно через тик.
  function refreshMarketPrice() {
    if (!supportsFormMarketFill(formData?.pair)) return;
    if (!formData?.pair) {
      marketError = 'Сначала выбери пару';
      return;
    }
    marketError = '';
    marketLoading = true;
    formPairs.set([]);
    setTimeout(() => formPairs.set([formData.pair]), 50);
  }

  $: if (mode === 'close' && trade && closePrice) {
    const simulated = {
      ...trade,
      priceClose: Number(closePrice),
      commission: Number(formData.commission) || 0,
      swap: Number(formData.swap) || 0,
      status: 'closed'
    };
    previewProfit = calculateProfit(simulated);
  } else {
    previewProfit = null;
  }

  function tradeFieldsEdited(original, current) {
    if (!original || !current) return false;
    const num = (v) => Number(v) || 0;
    return (
      num(original.priceOpen) !== num(current.priceOpen) ||
      num(original.priceClose) !== num(current.priceClose) ||
      num(original.volume) !== num(current.volume) ||
      num(original.commission) !== num(current.commission) ||
      num(original.swap) !== num(current.swap) ||
      String(original.direction) !== String(current.direction) ||
      String(original.pair) !== String(current.pair)
    );
  }

  $: editClosedDisplayProfit =
    mode === 'edit-closed' && trade && formData
      ? isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, formData)
        ? Number(formData.profit) || 0
        : calculateProfit({ ...formData, status: 'closed' }) || 0
      : null;

  // Anti-martingale scale (если включено в профиле)
  $: closedTradesAll = $trades.filter((t) => t.status === 'closed');
  $: openTradesAll = $trades.filter((t) => t.status === 'open');
  $: riskScale = getCurrentRiskScale(closedTradesAll, $userProfile);

  // Live-риск открываемой/редактируемой сделки
  $: tradeRisk = (mode === 'add' || mode === 'edit')
    ? calculateTradeRisk(formData, $userProfile)
    : null;
  $: baseRiskAmount = computeMaxRiskAmount($userProfile);
  $: maxRiskAmount = baseRiskAmount * riskScale;
  $: suggestedVolume = (mode === 'add' || mode === 'edit')
    ? suggestVolumeForRisk(formData, $userProfile, { closedTrades: closedTradesAll })
    : null;
  $: riskOverLimit = !!(tradeRisk?.riskAmount != null && maxRiskAmount > 0 && tradeRisk.riskAmount > maxRiskAmount + 0.005);

  // ----- Мини-контекст по паре (add / edit) -----
  $: pairCtxKey =
    mode === 'add' || mode === 'edit' ? normalizeSymbolKey(formData?.pair || '') : '';
  $: openSamePairExcludingEdit =
    pairCtxKey && (mode === 'add' || mode === 'edit')
      ? openTradesAll.filter(
          (t) =>
            normalizeSymbolKey(t.pair) === pairCtxKey &&
            !(mode === 'edit' && trade && t.id === trade.id)
        ).length
      : 0;
  $: closedTodayPair =
    pairCtxKey && (mode === 'add' || mode === 'edit')
      ? closedTradesAll.filter((t) => {
          if (!t?.dateClose) return false;
          return (
            normalizeSymbolKey(t.pair) === pairCtxKey && dayjs(t.dateClose).isSame(dayjs(), 'day')
          );
        }).length
      : 0;
  $: closedTodayAll = countClosedTradesOnDay(closedTradesAll);
  $: maxDayTrades = Number($userProfile?.maxTradesPerDay) || 0;
  /** Направление vs HTF bias (для мини-контекста внизу формы) */
  $: biasVsDirectionLabel =
    pairCtxKey && activeBias && formData?.direction
      ? biasAligned === true
        ? 'по bias'
        : biasAligned === false
          ? 'против bias'
          : '—'
      : '';

  /** Одно открытие модалки → попытка показать черновик */
  $: openKey = open ? `${mode}:${trade?.id ?? 'null'}` : '';
  $: if (open && openKey !== prevOpenKey) {
    prevOpenKey = openKey;
    if (mode === 'add' || mode === 'edit') queueMicrotask(() => tryLoadDraftBanner());
  }
  $: if (!open) prevOpenKey = '';

  /** Автосохранение черновика */
  $: draftAutosaveDeps =
    open && (mode === 'add' || mode === 'edit')
      ? `${tradeFormDraftFingerprint(formData)}|${useCurrentTime}|${useMarketPrice}|${JSON.stringify(acknowledgedChecklist)}|${JSON.stringify(acknowledgedPlayRules)}`
      : '';
  $: if (draftAutosaveDeps) schedulePersistDraft();

  function draftKeyCurrent() {
    if (mode === 'add') return draftStorageKeyAdd();
    if (mode === 'edit' && trade?.id) return draftStorageKeyEdit(trade.id);
    return null;
  }

  function tryLoadDraftBanner() {
    draftBannerVisible = false;
    pendingDraft = null;
    if (!(mode === 'add' || mode === 'edit')) return;
    const key = draftKeyCurrent();
    if (!key) return;
    const raw = loadDraftRaw(key);
    if (!validateDraftForApply(raw, mode, trade)) return;
    const meaningful =
      mode === 'add'
        ? meaningfulDraftAdd(raw.formData)
        : meaningfulDraftEdit(raw.formData, trade);
    if (!meaningful) return;
    pendingDraft = raw;
    draftBannerVisible = true;
  }

  function schedulePersistDraft() {
    if (!(open && (mode === 'add' || mode === 'edit'))) return;
    if (draftBannerVisible) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistDraftNow(), 450);
  }

  function persistDraftNow() {
    if (!(open && (mode === 'add' || mode === 'edit'))) return;
    if (draftBannerVisible) return;
    const key = draftKeyCurrent();
    if (!key) return;
    const meaningful =
      mode === 'add' ? meaningfulDraftAdd(formData) : meaningfulDraftEdit(formData, trade);
    if (!meaningful) {
      clearDraftRaw(key);
      return;
    }
    saveDraftRaw(
      key,
      buildDraftPayload({
        formData,
        useCurrentTime,
        useMarketPrice,
        acknowledgedChecklist,
        acknowledgedPlayRules,
        mode,
        tradeId: trade?.id ?? null
      })
    );
  }

  function clearDraftNow() {
    const key = draftKeyCurrent();
    if (key) clearDraftRaw(key);
  }

  async function restoreDraft() {
    const raw = pendingDraft;
    if (!raw || !validateDraftForApply(raw, mode, trade)) return;
    formData = { ...(raw.formData || {}) };
    useCurrentTime = !!raw.useCurrentTime;
    useMarketPrice = !!raw.useMarketPrice && supportsFormMarketFill(formData.pair);
    acknowledgedChecklist = Array.isArray(raw.acknowledgedChecklist)
      ? [...raw.acknowledgedChecklist]
      : [];
    acknowledgedPlayRules = Array.isArray(raw.acknowledgedPlayRules)
      ? [...raw.acknowledgedPlayRules]
      : [];
    draftBannerVisible = false;
    pendingDraft = null;
    await tick();
    acknowledgedChecklist = unifyAcknowledgedChecklistIds(profileGateRulesList, acknowledgedChecklist);
    acknowledgedPlayRules = acknowledgedPlayRules.filter((id) =>
      playRules.some((r) => r.id === id)
    );
    schedulePersistDraft();
  }

  function discardDraftBanner() {
    clearDraftNow();
    draftBannerVisible = false;
    pendingDraft = null;
  }

  function resetModalUi() {
    open = false;
    formData = {};
    closePrice = 0;
    previewProfit = null;
    showRiskConfirm = false;
    pendingViolations = [];
    draftBannerVisible = false;
    pendingDraft = null;
  }

  onDestroy(() => clearTimeout(persistTimer));

  // Cooldown — ms осталось (тикает через tickClock).
  $: cooldownRemainingMs = ($tickClock, $cooldown?.until ? Math.max(0, $cooldown.until - Date.now()) : 0);

  // Реактивный preview нарушений — юзер видит проблемы ДО нажатия "Сохранить".
  $: liveViolations =
    open && (mode === 'add' || mode === 'edit')
      ? evaluateTradeRules(formData, $userProfile, {
          openTrades: openTradesAll,
          closedTrades: closedTradesAll,
          isEditing: mode === 'edit',
          cooldownRemainingMs,
          acknowledgedChecklist,
          play: selectedPlay,
          acknowledgedPlayRules,
          currentKillzone: kzId,
          bias: activeBias,
          biasAligned,
          biasLabel: biasLabelText
        })
      : open && mode === 'edit-closed'
        ? evaluatePostCloseTradeRules(formData, $userProfile)
        : [];
  $: hasBlockingViolation = liveViolations.some((v) => v.severity === 'block');

  function applySuggestedVolume() {
    if (suggestedVolume && suggestedVolume > 0) {
      formData = { ...formData, volume: suggestedVolume };
    }
  }

  function commitTrade(extra = {}) {
    if (mode === 'close') {
      const base = {
        ...trade,
        commission: Number(formData.commission) || 0,
        swap: Number(formData.swap) || 0
      };
      const closed = closeTrade(base, Number(closePrice));
      trades.updateTrade(trade.id, closed);

      if ($userProfile?.postCloseChartReminderEnabled !== false) {
        toasts.info(
          'Сделка закрыта. Пока свежий контекст — приложи скрин графика к записи: разметка до/после и таймфрейм помогут честно разобрать вход на следующей неделе.',
          { ttl: 9000 }
        );
        dispatch('postCloseChartPrompt', { tradeId: trade.id, pair: closed.pair });
      }

      // Anti-revenge: после убыточной сделки запускаем cooldown.
      const cdMin = Number($userProfile?.cooldownAfterLossMin) || 0;
      if (cdMin > 0 && Number(closed.profit) < 0) {
        cooldown.startAfterLoss(cdMin);
      }
    } else if (mode === 'edit-closed') {
      const mergedForAttach = { ...trade, ...formData, status: 'closed' };
      let rv = Array.isArray(formData.ruleViolations)
        ? [...formData.ruleViolations]
        : Array.isArray(trade.ruleViolations)
          ? [...trade.ruleViolations]
          : [];
      if (Array.isArray(extra.appendRuleViolations) && extra.appendRuleViolations.length) {
        const codes = new Set(rv.map((x) => x?.code).filter(Boolean));
        for (const x of extra.appendRuleViolations) {
          if (x?.code && codes.has(x.code)) continue;
          rv.push(x);
          if (x?.code) codes.add(x.code);
        }
      }
      if (tradeHasChartAttachment(mergedForAttach)) {
        rv = stripPostCloseChartViolations(rv);
      }
      const updatedClosed = {
        ...trade,
        ...formData,
        status: 'closed',
        priceClose: Number(formData.priceClose) || 0,
        commission: Number(formData.commission) || 0,
        swap: Number(formData.swap) || 0,
        ruleViolations: rv
      };
      updatedClosed.profit =
        isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, updatedClosed)
          ? Number(formData.profit) || 0
          : calculateProfit(updatedClosed);
      trades.updateTrade(trade.id, updatedClosed);
    } else if (mode === 'add' || mode === 'edit') {
      if (!useCurrentTime && !formData.dateOpen) {
        formData.dateOpen = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }
      formData.dateOpenManual = !useCurrentTime;

      const payload = { ...formData, ...extra };
      if (mode === 'add') {
        trades.addTrade({ ...payload, profit: null });
      } else if (mode === 'edit') {
        trades.updateTrade(trade.id, payload);
      }
    }
    if (mode === 'add' || mode === 'edit') clearDraftNow();
    resetModalUi();
  }

  function save() {
    // Pre-trade gate действует только при открытии/редактировании открытой сделки.
    if (mode === 'add' || mode === 'edit') {
      const allTrades = $trades;
      const violations = evaluateTradeRules(formData, $userProfile, {
        openTrades: allTrades.filter((t) => t.status === 'open'),
        closedTrades: allTrades.filter((t) => t.status === 'closed'),
        isEditing: mode === 'edit',
        cooldownRemainingMs,
        acknowledgedChecklist,
        play: selectedPlay,
        acknowledgedPlayRules,
        currentKillzone: kzId,
        bias: activeBias,
        biasAligned,
        biasLabel: biasLabelText
      });
      // Прикрепляем killzone к сделке всегда
      const extra = { killzone: kzId || null };
      if (violations.length > 0) {
        pendingViolations = violations;
        pendingMode = mode;
        pendingExtra = extra;
        showRiskConfirm = true;
        return;
      }
      commitTrade({ ruleViolations: [], ...extra });
      return;
    }
    if (mode === 'edit-closed') {
      const violations = evaluatePostCloseTradeRules(formData, $userProfile);
      if (violations.length > 0) {
        pendingViolations = violations;
        pendingMode = 'edit-closed';
        pendingExtra = {};
        showRiskConfirm = true;
        return;
      }
      commitTrade();
      return;
    }
    commitTrade();
  }
  let pendingExtra = {};

  function onRiskConfirmed() {
    showRiskConfirm = false;
    if (pendingMode === 'edit-closed') {
      commitTrade({ appendRuleViolations: pendingViolations });
    } else {
      commitTrade({ ruleViolations: pendingViolations, ...pendingExtra });
    }
    pendingViolations = [];
    pendingMode = null;
    pendingExtra = {};
  }

  function onRiskCancelled() {
    showRiskConfirm = false;
    pendingViolations = [];
    pendingMode = null;
    pendingExtra = {};
  }

  function closeModal() {
    persistDraftNow();
    resetModalUi();
  }

  function applyUserTemplate(tpl) {
    const nt = normalizeStoredTradeTemplate(tpl);
    if (!nt) return;
    formData = {
      ...formData,
      pair: nt.pair,
      direction: nt.direction,
      volume: nt.volume,
      comment: nt.comment,
      tags: [...nt.tags],
      strategyId: nt.strategyId,
      playId: nt.playId,
      contractSize: nt.contractSize,
      priceOpen: 0,
      sl: null,
      tp: null
    };
    acknowledgedPlayRules = [];
    useMarketPrice = false;
    marketLoading = false;
    marketError = '';
    marketSource = '';
    marketTimestamp = null;
  }

  function saveAsTemplate() {
    const strat = $strategies.find((s) => s.id === formData.strategyId);
    const playName =
      strat?.plays?.find((p) => p.id === formData.playId)?.name?.trim() || '';
    const suggested = playName || String(formData.pair || '').trim() || 'Мой шаблон';
    const name = window.prompt('Название шаблона', suggested);
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      toasts.warn('Введи непустое имя шаблона.', { ttl: 4000 });
      return;
    }
    const payload = snapshotTradeTemplateFields(formData);
    templates.addTemplate({
      id: uuidv4(),
      name: trimmed,
      ...payload
    });
    toasts.info(`Шаблон «${trimmed}» сохранён.`, { ttl: 3500 });
  }

  function removeTemplate(id, e) {
    e?.stopPropagation?.();
    if (!window.confirm('Удалить этот шаблон?')) return;
    templates.deleteTemplate(id);
  }
</script>

<Modal {open} showAside={mode === 'add' || mode === 'edit'} modalClass="trade-form-modal" on:close={closeModal}>
  <div slot="aside" class="trade-modal-templates-rail">
    <div class="trade-modal-templates-rail-inner">
      <div class="trade-section-kicker">Шаблоны</div>
      <p class="trade-templates-hint">Пара, направление, объём, теги, стратегия/setup, комментарий. Цена входа, SL и TP — заново.</p>
      <ul class="trade-templates-list">
        {#each $templates as tpl (tpl.id)}
          <li class="trade-templates-item">
            <button type="button" class="trade-templates-apply btn btn-sm" on:click={() => applyUserTemplate(tpl)}>
              {tpl.name}
            </button>
            <button
              type="button"
              class="trade-templates-remove"
              title="Удалить шаблон"
              aria-label="Удалить шаблон"
              on:click={(e) => removeTemplate(tpl.id, e)}
            >×</button>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div slot="header">
    <h2>
      {mode === 'add' ? 'Новая сделка' : 
       mode === 'close' ? 'Закрыть сделку' :
       mode === 'edit-closed' ? 'Редактировать закрытую сделку' :
       'Редактировать сделку'}
    </h2>
  </div>
  
  <div slot="body">
    {#if (mode === 'add' || mode === 'edit') && draftBannerVisible && pendingDraft}
      <div class="trade-draft-banner" role="status">
        <div class="trade-draft-banner-text">
          Есть черновик · сохранён{' '}
          {pendingDraft.savedAt != null
            ? new Date(Number(pendingDraft.savedAt)).toLocaleString()
            : ''}
        </div>
        <div class="trade-draft-banner-actions">
          <button type="button" class="btn btn-sm btn-primary" on:click={restoreDraft}>Восстановить</button>
          <button type="button" class="btn btn-sm trade-modal-cancel" on:click={discardDraftBanner}>
            Удалить черновик
          </button>
        </div>
      </div>
    {/if}
    {#if mode === 'close'}
      <div class="info-box">
        <p><strong>{trade?.pair}</strong> {trade?.direction === 'long' ? '📈 Long' : '📉 Short'}</p>
        <p>Объем: {trade?.volume} лот</p>
        <p>Цена открытия: {trade?.priceOpen}</p>
        {#if trade?.sl}
          <p>SL: {trade.sl}</p>
        {/if}
        {#if trade?.tp}
          <p>TP: {trade.tp}</p>
        {/if}
      </div>

      <div class="form-group">
        <label for="close-price">Цена закрытия</label>
        <input 
          id="close-price"
          type="number" 
          step="0.00001" 
          bind:value={closePrice} 
          placeholder="1.09250" 
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="commission-close">Комиссия</label>
          <input
            id="commission-close"
            type="number"
            step="0.01"
            bind:value={formData.commission}
            placeholder="0.00"
          />
        </div>
        <div class="form-group">
          <label for="swap-close">Своп</label>
          <input
            id="swap-close"
            type="number"
            step="0.01"
            bind:value={formData.swap}
            placeholder="0.00"
          />
        </div>
      </div>

      {#if previewProfit !== null}
        <div class="info-box">
          <p>
            Предварительный результат:&nbsp;
            <span class={previewProfit >= 0 ? 'profit' : 'loss'}>
              {formatMoney(previewProfit, $fxRate)}
            </span>
          </p>
        </div>
      {/if}
    {:else if mode === 'edit-closed'}
      <div class="info-box">
        <p><strong>{trade?.pair}</strong> {trade?.direction === 'long' ? '📈 Long' : '📉 Short'}</p>
        <p>Объем: {trade?.volume} лот</p>
        <p>Цена открытия: {trade?.priceOpen}</p>
        <p>Дата открытия: {trade?.dateOpen || '-'}</p>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="edit-close-price">Цена закрытия</label>
          <input
            id="edit-close-price"
            type="number"
            step="0.00001"
            bind:value={formData.priceClose}
            placeholder="1.09250"
          />
        </div>
        <div class="form-group">
          <label for="edit-close-date">Дата закрытия</label>
          <input id="edit-close-date" type="text" bind:value={formData.dateClose} placeholder="YYYY-MM-DD HH:mm:ss" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="edit-close-commission">Комиссия</label>
          <input id="edit-close-commission" type="number" step="0.01" bind:value={formData.commission} />
        </div>
        <div class="form-group">
          <label for="edit-close-swap">Своп</label>
          <input id="edit-close-swap" type="number" step="0.01" bind:value={formData.swap} />
        </div>
      </div>

      <div class="info-box">
        <p>
          {#if isBrokerImportedTrade(trade) && !tradeFieldsEdited(trade, formData)}
            P&amp;L из отчёта MT5 (без пересчёта):&nbsp;
          {:else}
            Обновленный результат (по формуле):&nbsp;
          {/if}
          <span class={(editClosedDisplayProfit || 0) >= 0 ? 'profit' : 'loss'}>
            {formatMoney(editClosedDisplayProfit || 0, $fxRate)}
          </span>
        </p>
      </div>

      {#if liveViolations.length > 0}
        <div class="violations-preview">
          <div class="trade-section-kicker violations-preview-kicker">
            {hasBlockingViolation ? '⛔ Нарушения правил' : '⚠️ Предупреждения'}
          </div>
          <ul class="violations-preview-list">
            {#each liveViolations as v}
              <li class="violation severity-{v.severity}">
                <span class="violation-badge">{v.severity === 'block' ? 'BLOCK' : 'WARN'}</span>
                <span class="violation-text">{v.message}</span>
              </li>
            {/each}
          </ul>
          <div class="violations-preview-hint">
            {hasBlockingViolation
              ? 'При сохранении потребуется явное подтверждение.'
              : 'Можно сохранить с предупреждением — оно попадёт в ruleViolations и учтётся в метрике дисциплины (warn легче block).'}
          </div>
        </div>
      {/if}

      {#if $userProfile?.postCloseChartReminderEnabled !== false && !tradeHasChartAttachment(formData)}
        <p class="edit-closed-photo-hint">
          Без скрина графика разбор позже опирается на память. Включи напоминание в профиле или прикрепи изображение через таблицу закрытых (📎) / здесь после сохранения.
        </p>
      {/if}
    {:else}
      <div class="form-group">
        <label for="pair">Инструмент</label>
        <PairPicker bind:value={formData.pair} />
      </div>
      
      <div class="form-group">
        <span class="label-text">Направление</span>
        <div class="direction-buttons">
          <button 
            class="direction-btn {formData.direction === 'long' ? 'active' : ''}" 
            on:click={() => formData.direction = 'long'}
            type="button"
          >📈 Long</button>
          <button 
            class="direction-btn {formData.direction === 'short' ? 'active' : ''}" 
            on:click={() => formData.direction = 'short'}
            type="button"
          >📉 Short</button>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="volume">Объем (лоты)</label>
          <div class="value-mode-row">
            <input id="volume" type="number" step="0.01" bind:value={formData.volume} />
            <button
              type="button"
              class="btn btn-sm"
              on:click={applySuggestedVolume}
              disabled={!suggestedVolume}
              title={suggestedVolume
                ? `Подобрать объём под лимит риска (${formatAccountMoney(maxRiskAmount, $fxRate)}): ${suggestedVolume} лот`
                : 'Заполни цену открытия и SL — кнопка подберёт объём под лимит риска из профиля'}
            >🎯</button>
          </div>
          {#if suggestedVolume && Math.abs(suggestedVolume - Number(formData.volume || 0)) > 0.001}
            <div class="market-msg">
              Под лимит риска: <strong>{suggestedVolume}</strong> лот
            </div>
          {/if}
        </div>
        <div class="form-group">
          <label for="price-open">Цена открытия</label>
          <div class="value-mode-row">
            <input
              id="price-open"
              type="number"
              step="0.00001"
              bind:value={formData.priceOpen}
              disabled={supportsMarketFill && useMarketPrice && marketLoading}
            />
            {#if supportsMarketFill}
              <button
                type="button"
                class="btn btn-sm"
                on:click={refreshMarketPrice}
                disabled={marketLoading || !formData.pair}
                title="Обновить рыночную цену"
              >
                {marketLoading ? '⏳' : '↻'}
              </button>
            {/if}
          </div>
          {#if supportsMarketFill}
            <label class="checkbox-label" style="margin-top: 6px;">
              <input type="checkbox" bind:checked={useMarketPrice} />
              📡 По рынку (live-цена)
            </label>
            {#if marketError}
              <div class="market-msg loss">{marketError}</div>
            {:else if useMarketPrice && marketSource && !marketLoading}
              <div class="market-msg">
                Источник: {marketSource}{marketTimestamp ? ` · ${new Date(marketTimestamp).toLocaleTimeString()}` : ''}
              </div>
            {/if}
          {/if}
        </div>
      </div>
      
      <div class="form-group">
        <span class="label-text">Дата и время открытия</span>
        <div class="datetime-control">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={useCurrentTime} />
            Текущее время
          </label>
          {#if !useCurrentTime}
            <input type="datetime-local" bind:value={formData.dateOpen} />
          {/if}
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="sl">Stop Loss</label>
          <input id="sl" type="number" step="0.00001" bind:value={formData.sl} placeholder="1.08200" />
        </div>
        <div class="form-group">
          <label for="tp">Take Profit</label>
          <input id="tp" type="number" step="0.00001" bind:value={formData.tp} placeholder="1.09100" />
        </div>
      </div>

      {#if tradeRisk}
        <div class="risk-card {riskOverLimit ? 'over' : ''}">
          <div class="risk-card-row">
            <span class="risk-card-label">Риск сделки</span>
            <span class="risk-card-value {riskOverLimit ? 'loss' : ''}">
              {tradeRisk.hasSl && tradeRisk.riskAmount != null
                ? `${formatMoney(tradeRisk.riskAmount, $fxRate)}` +
                  (tradeRisk.riskPercentOfCapital != null
                    ? ` (${formatNumber(tradeRisk.riskPercentOfCapital, 2)}% капитала)`
                    : '')
                : 'SL не задан — риск ∞'}
            </span>
          </div>
          {#if maxRiskAmount > 0}
            <div class="risk-card-row">
              <span class="risk-card-label">Лимит из профиля</span>
              <span class="risk-card-value">
                {formatAccountMoney(maxRiskAmount, $fxRate)}
                {#if riskScale < 1}
                  <span class="warn-text">
                    (×{riskScale} из {formatAccountMoney(baseRiskAmount, $fxRate)} — anti-martingale)
                  </span>
                {/if}
                {#if riskOverLimit}<span class="loss"> · превышен</span>{/if}
              </span>
            </div>
          {:else}
            <div class="risk-card-row">
              <span class="risk-card-label">Лимит из профиля</span>
              <span class="risk-card-value warn-text">
                не задан — открой профиль и заполни «Риск на сделку»
              </span>
            </div>
          {/if}
          <div class="risk-card-row">
            <span class="risk-card-label">R:R</span>
            <span class="risk-card-value">
              {tradeRisk.rrRatio != null
                ? `1 : ${formatNumber(tradeRisk.rrRatio, 2)}` +
                  (tradeRisk.rrRatio < 1 ? ' (хуже 1:1)' : '')
                : 'TP не задан'}
            </span>
          </div>
        </div>
      {/if}

      <!-- Killzone + Bias индикаторы -->
      <div class="ctx-row">
        <div class="ctx-card">
          <div class="ctx-label">Killzone (NY-time)</div>
          <div class="ctx-value">
            {#if kzId}
              <span class="kz-pill on">{kzLabel}</span>
            {:else}
              <span class="kz-pill">Вне KZ</span>
            {/if}
          </div>
        </div>
        <div class="ctx-card">
          <div class="ctx-label">
            HTF Bias
            <button type="button" class="ctx-mini-btn" on:click={() => (showBiasModal = true)}>
              {activeBias ? '✎' : '+'}
            </button>
          </div>
          <div class="ctx-value">
            {#if activeBias}
              <span class="bias-pill {biasAligned === true ? 'on' : biasAligned === false ? 'against' : ''}">
                {biasLabelText}
              </span>
              {#if biasAligned === true}<span class="ctx-flag profit">aligned</span>
              {:else if biasAligned === false}<span class="ctx-flag loss">против bias</span>
              {/if}
            {:else}
              <span class="bias-pill">не задан</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Strategy / Play selector -->
      {#if $strategies.length > 0}
        <div class="play-selector">
          <div class="play-selector-row">
            <div class="form-group">
              <label for="strategy-sel">Стратегия</label>
              <select id="strategy-sel" value={formData.strategyId || ''} on:change={(e) => selectStrategy(e.target.value)}>
                <option value="">— без плейбука —</option>
                {#each $strategies as s}
                  <option value={s.id}>{s.name}</option>
                {/each}
              </select>
            </div>
            {#if formData.strategyId}
              {@const strat = $strategies.find((s) => s.id === formData.strategyId)}
              {#if strat?.plays?.length}
                <div class="form-group">
                  <label for="play-sel">Setup</label>
                  <select id="play-sel" value={formData.playId || ''} on:change={(e) => selectPlay(e.target.value)}>
                    {#each strat.plays as p}
                      <option value={p.id}>{p.name}</option>
                    {/each}
                  </select>
                </div>
              {/if}
              <button type="button" class="btn btn-sm" on:click={clearPlay}>×</button>
            {/if}
          </div>
          {#if selectedPlay && playRules.length > 0}
            <div class="play-rules">
              <div class="trade-section-kicker play-rules-title-row">
                Чек-лист сетапа · «{selectedPlay.name}»
                {#if selectedPlay.htfRequirement && selectedPlay.htfRequirement !== 'any'}
                  <span class="play-htf-req">HTF: {selectedPlay.htfRequirement === 'aligned' ? 'по bias' : 'против bias'}</span>
                {/if}
              </div>
              {#each playRules as r}
                <label class="play-rule">
                  <input
                    type="checkbox"
                    checked={acknowledgedPlayRules.includes(r.id)}
                    on:change={() => togglePlayRule(r.id)}
                  />
                  <span class={acknowledgedPlayRules.includes(r.id) ? 'done' : ''}>
                    {r.label}
                    {#if r.required}<em class="req-tag">required</em>{/if}
                    <em class="rule-kind">{r.kind === 'pre' ? 'precond' : 'entry'}</em>
                  </span>
                </label>
              {/each}
              {#if selectedPlay.killzones?.length > 0}
                <div class="play-killzones">
                  Допустимые KZ: {selectedPlay.killzones.map(killzoneLabel).join(', ')}
                  · сейчас: <strong>{kzId ? kzLabel : 'вне KZ'}</strong>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- ICT taxonomy tags -->
      <div class="ict-tags">
        <div class="trade-section-kicker">Теги ICT (по 4 осям)</div>
        {#each ICT_GROUPS as group}
          <div class="ict-group">
            <div class="ict-group-label" title={group.hint}>{group.label}</div>
            <div class="ict-group-items">
              {#each group.items as it}
                {@const key = `${group.id}:${it.id}`}
                {@const on = Array.isArray(formData.tags) && formData.tags.includes(key)}
                <button
                  type="button"
                  class="ict-chip {on ? 'on' : ''}"
                  on:click={() => toggleIctTag(key)}
                >{it.label}</button>
              {/each}
            </div>
          </div>
        {/each}
        {#if Array.isArray(formData.tags) && formData.tags.some((t) => !isIctTag(t))}
          <div class="ict-tags-extra">
            Прочие теги: {formData.tags.filter((t) => !isIctTag(t)).join(', ')}
          </div>
        {/if}
      </div>

      {#if profileGateChecklistOn && profileGateRulesList.length > 0}
        <div class="play-rules">
          <div class="trade-section-kicker play-rules-title-row">
            📋 Чек-лист «Свои правила»
          </div>
          {#each profileGateRulesList as r}
            <label class="play-rule">
              <input
                type="checkbox"
                checked={acknowledgedChecklist.includes(r.id)}
                on:change={() => toggleChecklistItem(r.id)}
              />
              <span class={acknowledgedChecklist.includes(r.id) ? 'done' : ''}>
                {r.label}
                {#if r.required}<em class="req-tag">required</em>{/if}
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if liveViolations.length > 0}
        <div class="violations-preview">
          <div class="trade-section-kicker violations-preview-kicker">
            {hasBlockingViolation ? '⛔ Нарушения правил' : '⚠️ Предупреждения'}
          </div>
          <ul class="violations-preview-list">
            {#each liveViolations as v}
              <li class="violation severity-{v.severity}">
                <span class="violation-badge">{v.severity === 'block' ? 'BLOCK' : 'WARN'}</span>
                <span class="violation-text">{v.message}</span>
              </li>
            {/each}
          </ul>
          <div class="violations-preview-hint">
            {hasBlockingViolation
              ? 'При сохранении потребуется явное подтверждение, и сделка будет помечена как «нарушение».'
              : 'Можно сохранить как есть — нарушение будет залоггировано в истории сделки.'}
          </div>
        </div>
      {/if}

      <div class="form-group">
        <label for="comment">Комментарий</label>
        <textarea id="comment" bind:value={formData.comment} rows="3"></textarea>
      </div>

      {#if pairCtxKey}
        <div class="trade-pair-context">
          <div class="trade-section-kicker trade-pair-context-kicker">Контекст по паре · {formData.pair}</div>
          <div class="trade-pair-context-grid">
            <div class="trade-pair-context-cell">
              <span class="trade-pair-context-label">Открытых по паре</span>
              <span class="trade-pair-context-value">{openSamePairExcludingEdit}</span>
            </div>
            <div class="trade-pair-context-cell">
              <span class="trade-pair-context-label">Закрыто сегодня (эта пара)</span>
              <span class="trade-pair-context-value">{closedTodayPair}</span>
            </div>
            <div class="trade-pair-context-cell">
              <span class="trade-pair-context-label">Направление vs HTF</span>
              <span class="trade-pair-context-value">
                {#if activeBias && biasVsDirectionLabel}
                  <span class:bias-align-on={biasAligned === true} class:bias-align-off={biasAligned === false}>
                    {biasVsDirectionLabel}
                  </span>
                  <span class="trade-pair-context-muted"> · {biasLabelText}</span>
                {:else}
                  <span class="trade-pair-context-muted">{biasLabelText || 'bias не задан'}</span>
                {/if}
              </span>
            </div>
            <div class="trade-pair-context-cell">
              <span class="trade-pair-context-label">Закрыто сегодня (все)</span>
              <span class="trade-pair-context-value">
                {closedTodayAll}
                {#if maxDayTrades > 0}
                  <span class="trade-pair-context-muted"> / лимит {maxDayTrades}</span>
                {/if}
              </span>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
  
  <div slot="footer" class="trade-modal-footer">
    <button type="button" class="btn trade-modal-cancel" on:click={closeModal}>Отмена</button>
    <div class="trade-modal-footer-actions">
      {#if mode === 'add' || mode === 'edit'}
        <button type="button" class="btn" on:click={saveAsTemplate}>
          Сохранить как шаблон
        </button>
      {/if}
      <button
        type="button"
        class="btn {hasBlockingViolation ? 'btn-danger' : liveViolations.length > 0 ? 'btn-warn' : 'btn-primary'}"
        on:click={save}
      >
        {hasBlockingViolation ? 'Сохранить (нарушает правила)' : liveViolations.length > 0 ? 'Сохранить (с предупреждением)' : 'Сохранить'}
      </button>
    </div>
  </div>
</Modal>

<RiskConfirmModal
  open={showRiskConfirm}
  violations={pendingViolations}
  on:confirm={onRiskConfirmed}
  on:close={onRiskCancelled}
/>

<BiasModal bind:open={showBiasModal} symbol={formData.pair || ''} />

<style>
  .trade-modal-footer {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .trade-modal-footer-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .trade-modal-cancel {
    border-color: var(--border-strong);
    background: transparent;
    color: var(--text-muted);
    font-weight: 500;
  }
  .trade-modal-cancel:hover {
    background: var(--bg-3);
    color: var(--text-strong);
    border-color: var(--border);
  }

  .trade-draft-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 14px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-border);
    border-radius: 6px;
    background: var(--bg-2);
    font-size: 13px;
    line-height: 1.45;
  }
  .trade-draft-banner-text {
    color: var(--text);
    flex: 1;
    min-width: 160px;
  }
  .trade-draft-banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .trade-pair-context {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }
  .trade-pair-context-kicker.trade-section-kicker {
    text-transform: none;
    letter-spacing: 0.03em;
    font-weight: 700;
    margin-bottom: 8px;
    padding-bottom: 6px;
  }
  .trade-pair-context-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px 14px;
  }
  .trade-pair-context-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    line-height: 1.35;
  }
  .trade-pair-context-label {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .trade-pair-context-value {
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }
  .trade-pair-context-muted {
    color: var(--text-muted);
    font-weight: 500;
    font-size: 11px;
  }
  .bias-align-on {
    color: var(--profit);
  }
  .bias-align-off {
    color: var(--loss);
  }

  .trade-section-kicker {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.55px;
    color: var(--text-muted);
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
    line-height: 1.35;
  }
  .play-rules-title-row.trade-section-kicker {
    text-transform: none;
    letter-spacing: 0.02em;
    font-weight: 600;
    color: var(--text-strong);
  }
  .violations-preview-kicker.trade-section-kicker {
    text-transform: none;
    letter-spacing: 0.04em;
    font-weight: 700;
    color: var(--text-strong);
    margin-bottom: 8px;
  }

  .trade-modal-templates-rail {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-self: stretch;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--shadow);
    overflow: hidden;
    min-height: 0;
  }
  .trade-modal-templates-rail-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 14px 12px;
  }
  @media (max-width: 720px) {
    .trade-modal-templates-rail {
      width: 100%;
      max-height: min(220px, 38vh);
      align-self: auto;
    }
  }

  .trade-templates-hint {
    margin: 0 0 8px;
    color: var(--text-muted);
    line-height: 1.35;
    font-size: 11px;
  }
  .trade-templates-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .trade-templates-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .trade-templates-apply {
    flex: 1;
    min-width: 0;
    justify-content: flex-start;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trade-templates-remove {
    flex-shrink: 0;
    width: 26px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .trade-templates-remove:hover {
    background: color-mix(in srgb, var(--loss) 12%, var(--bg));
    color: var(--loss);
    border-color: var(--loss);
  }

  .market-msg {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
  .risk-card {
    margin: 8px 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-border);
    background: var(--bg-2);
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .risk-card.over {
    border-left-color: var(--loss);
    background: rgba(185, 28, 28, 0.05);
  }
  .risk-card-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .risk-card-label {
    color: var(--text-muted);
  }
  .risk-card-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text-strong);
    text-align: right;
  }
  .warn-text { color: var(--warning); }

  .violations-preview {
    margin: 0 0 12px 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--warning);
    background: var(--bg-2);
    border-radius: 3px;
  }
  .violations-preview {
    list-style: none;
    padding: 0;
    margin: 0 0 6px 0;
  }
  .violation {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    margin-bottom: 4px;
    border-radius: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 12.5px;
    line-height: 1.4;
  }
  .violation.severity-block { border-left: 3px solid var(--loss); }
  .violation.severity-warn  { border-left: 3px solid var(--warning); }
  .violation-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 1px 5px;
    border-radius: 2px;
    background: var(--bg-3);
    color: var(--text-strong);
    flex-shrink: 0;
  }
  .severity-block .violation-badge {
    background: color-mix(in srgb, var(--loss) 22%, var(--bg-2));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--loss) 55%, var(--border));
  }
  .severity-warn .violation-badge {
    background: color-mix(in srgb, var(--warning) 35%, var(--bg-2));
    color: var(--text-strong);
    border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--border));
  }
  .violation-text { flex: 1; color: var(--text); }
  .violations-preview-hint {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .edit-closed-photo-hint {
    margin: 10px 0 0;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px dashed color-mix(in srgb, var(--accent) 28%, var(--border));
    background: color-mix(in srgb, var(--bg-2) 70%, var(--bg));
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }

  /* .play-rules for «Свои правила» — те же классы, что у чек-листа play */

  /* ----- Killzone / Bias ----- */
  .ctx-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0 0 10px;
  }
  .ctx-card {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px 10px;
    background: var(--bg-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ctx-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ctx-mini-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 0 6px;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .ctx-mini-btn:hover { color: var(--text-strong); }
  .ctx-value {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .kz-pill, .bias-pill {
    display: inline-block;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 11.5px;
    color: var(--text-muted);
    background: var(--bg);
  }
  .kz-pill.on { color: var(--text-strong); border-color: var(--accent); background: var(--bg-2); }
  .bias-pill.on { color: var(--profit); border-color: var(--profit); }
  .bias-pill.against { color: var(--loss); border-color: var(--loss); }
  .ctx-flag { font-size: 11px; font-weight: 600; }

  /* ----- Strategy/Play selector ----- */
  .play-selector {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    background: var(--bg-2);
    border-radius: 3px;
  }
  .play-selector-row {
    display: flex;
    gap: 10px;
    align-items: end;
    flex-wrap: wrap;
  }
  .play-selector-row .form-group { flex: 1 1 180px; margin-bottom: 0; }

  .play-rules {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--border);
  }
  .play-htf-req {
    font-size: 10.5px;
    padding: 1px 6px;
    background: var(--bg-3);
    border-radius: 2px;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
  }
  .play-rule {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 0;
    font-size: 12.5px;
    cursor: pointer;
    color: var(--text);
  }
  .play-rule input { margin-top: 3px; }
  .play-rule .done { color: var(--text-muted); text-decoration: line-through; }
  .req-tag {
    font-size: 9.5px;
    text-transform: uppercase;
    background: var(--loss);
    color: #fff;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 4px;
    font-style: normal;
    letter-spacing: 0.4px;
  }
  .rule-kind {
    font-size: 9.5px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-left: 4px;
    font-style: normal;
    letter-spacing: 0.4px;
  }
  .play-killzones {
    margin-top: 6px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .play-killzones strong { color: var(--text-strong); }

  /* ----- ICT tags ----- */
  .ict-tags {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg-2);
  }
  .ict-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-bottom: 6px;
  }
  .ict-group-label {
    width: 76px;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
    font-weight: 700;
    cursor: help;
  }
  .ict-group-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .ict-chip {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 120ms;
  }
  .ict-chip:hover { background: var(--bg-3); color: var(--text); }
  .ict-chip.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .ict-tags-extra {
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-muted);
    border-top: 1px dashed var(--border);
    padding-top: 6px;
  }
</style>