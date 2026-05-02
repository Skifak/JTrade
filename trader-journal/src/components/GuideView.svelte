<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { trades, userProfile } from '../lib/stores';
  import { livePrices, pingInfo } from '../lib/livePrices';
  import { cooldown } from '../lib/cooldown';
  import {
    computeMaxRiskAmount,
    computeMaxDailyLossAmount,
    computeGoalAmount,
    getCurrentStreak,
    getDisciplineScore,
    getCurrentRiskScale,
    parseNotesChecklist,
    checkDailyStop
  } from '../lib/risk';
  import { formatNumber } from '../lib/utils';

  const dispatch = createEventDispatcher();

  const sections = [
    { id: 'about',         icon: '✦',  title: 'О приложении' },
    { id: 'quickstart',    icon: '▶',  title: 'Быстрый старт' },
    { id: 'profile',       icon: '◉',  title: 'Профиль и риск' },
    { id: 'trades',        icon: '⇆',  title: 'Сделки' },
    { id: 'journal-day',   icon: '📓', title: 'Журнал дня' },
    { id: 'glossary-media', icon: '📚', title: 'Глоссарий и фото' },
    { id: 'playbooks',     icon: '♚',  title: 'Плейбуки и ICT' },
    { id: 'killzones',     icon: '⏰', title: 'Killzones' },
    { id: 'bias',          icon: '⇡',  title: 'HTF Bias' },
    { id: 'risk-hud',      icon: '▤',  title: 'Risk HUD' },
    { id: 'pre-trade',     icon: '⚖',  title: 'Pre-trade gate' },
    { id: 'anti-revenge',  icon: '⏸',  title: 'Anti-revenge' },
    { id: 'kill-switch',   icon: '⛔', title: 'Kill-switch' },
    { id: 'daily-review',  icon: '🎯', title: 'Daily review' },
    { id: 'notes',         icon: '☑',  title: 'Notes-чек-лист' },
    { id: 'live-prices',   icon: '⚡', title: 'Live-цены' },
    { id: 'statistics',    icon: '∑',  title: 'Статистика' },
    { id: 'data',          icon: '⇲',  title: 'Данные и темы' },
    { id: 'faq',           icon: '?',  title: 'FAQ' }
  ];

  let activeId = sections[0].id;
  let observer;

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) activeId = visible.target.id;
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
  });
  onDestroy(() => observer?.disconnect());

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    activeId = id;
  }

  function openProfile() { dispatch('openProfile'); }

  // ----- LIVE данные для гайда -----
  $: closedTrades = $trades.filter((t) => t.status === 'closed');
  $: openTrades   = $trades.filter((t) => t.status === 'open');
  $: ccy = $userProfile?.accountCurrency || 'USD';
  $: maxRiskAmount      = computeMaxRiskAmount($userProfile);
  $: maxDailyLossAmount = computeMaxDailyLossAmount($userProfile);
  $: goalDayAmount      = computeGoalAmount($userProfile, 'Day');
  $: goalWeekAmount     = computeGoalAmount($userProfile, 'Week');
  $: streak     = getCurrentStreak(closedTrades);
  $: discipline = getDisciplineScore($trades);
  $: riskScale  = getCurrentRiskScale(closedTrades, $userProfile);
  $: dailyStop  = checkDailyStop(closedTrades, $userProfile);
  $: notesItems = parseNotesChecklist($userProfile?.notes);
  $: cooldownActive = !!($cooldown?.until && $cooldown.until > Date.now());
  $: livePairsCount = Object.keys($livePrices || {}).length;
  $: pingMs = $pingInfo?.ms ?? null;

  // прогресс «онбординга»: какие настройки уже заполнены
  $: profileChecks = [
    { ok: Number($userProfile?.initialCapital) > 0, label: 'Стартовый капитал' },
    { ok: maxRiskAmount > 0,                         label: 'Риск на сделку' },
    { ok: maxDailyLossAmount > 0,                    label: 'Дневной лимит убытка' },
    { ok: goalDayAmount > 0,                         label: 'Цель дня' },
    { ok: Number($userProfile?.maxOpenTrades) > 0,   label: 'Лимит открытых позиций' },
    { ok: notesItems.length > 0,                     label: 'Чек-лист в заметках' }
  ];
  $: profileScore = Math.round((profileChecks.filter((c) => c.ok).length / profileChecks.length) * 100);
</script>

<div class="guide">
  <aside class="guide-toc">
    <div class="toc-title">📖 Содержание</div>
    <nav>
      {#each sections as s}
        <button
          class="toc-item {activeId === s.id ? 'active' : ''}"
          on:click={() => scrollTo(s.id)}
        >
          <span class="toc-icon">{s.icon}</span>
          <span>{s.title}</span>
        </button>
      {/each}
    </nav>
    <div class="toc-stats">
      <div class="toc-stats-row">
        <span>Сделок</span><strong>{$trades.length}</strong>
      </div>
      <div class="toc-stats-row">
        <span>Открыто</span><strong>{openTrades.length}</strong>
      </div>
      <div class="toc-stats-row">
        <span>Дисциплина</span><strong>{formatNumber(discipline.score, 1)}%</strong>
      </div>
    </div>
  </aside>

  <main class="guide-content">

    <!-- HERO -->
    <section id="about" class="guide-section hero">
      <div class="hero-badge">v1 · трейд-журнал · risk-officer</div>
      <h1>Trader Journal</h1>
      <p class="hero-lead">
        Локальный журнал сделок, который думает как риск-менеджер.
        Вместо «записал — посмотрел» он
        <strong>не даёт открыть мусорную сделку</strong>,
        режет объём после серии убытков и закрывает торговлю,
        когда ты уже сделал свой день.
      </p>
      <div class="hero-grid">
        <div class="hero-card">
          <div class="hero-card-h">⚖ Pre-trade gate</div>
          <p>Каждая сделка проходит проверку правил из профиля до записи в журнал.</p>
        </div>
        <div class="hero-card">
          <div class="hero-card-h">⏸ Anti-revenge</div>
          <p>Cooldown после убытка и anti-martingale на серии — против эмоциональных входов.</p>
        </div>
        <div class="hero-card">
          <div class="hero-card-h">⚡ Live-цены</div>
          <p>WebSocket Binance + OANDA — без API-ключей и без задержек.</p>
        </div>
        <div class="hero-card">
          <div class="hero-card-h">∑ Аналитика</div>
          <p>Equity «реальная vs disciplined», PnL по часам/дням, разбивка по тегам.</p>
        </div>
      </div>
    </section>

    <!-- QUICK START -->
    <section id="quickstart" class="guide-section">
      <h2><span class="num">1</span>Быстрый старт</h2>
      <p class="lead">
        Всё локально — никаких регистраций. Данные живут в <code>localStorage</code>
        твоего браузера. Чтобы переехать на другой комп — <em>Экспорт</em>.
      </p>

      <ol class="steps">
        <li>
          <div class="step-h">Открой <button class="link-btn" on:click={openProfile}>Профиль</button></div>
          <p>Заполни стартовый капитал, валюту счёта, <strong>риск на сделку</strong> и <strong>дневной лимит убытка</strong>. Это база — без неё риск-менеджер молчит.</p>
        </li>
        <li>
          <div class="step-h">Создай первую сделку</div>
          <p>Кнопка «+ Новая сделка». Заполни пару, направление, объём, цена входа и <strong>SL обязательно</strong> — без него невозможно посчитать риск.</p>
        </li>
        <li>
          <div class="step-h">Закрой сделку — посмотри HUD</div>
          <p>Полоса под header'ом покажет equity, дневной P/L, открытый риск, серию, цели и дисциплину. Это твой dashboard.</p>
        </li>
        <li>
          <div class="step-h">Включи продвинутые правила</div>
          <p>В профиле раздел «Поведенческие ограничения»: cooldown, anti-martingale, daily review. Они спасают от тильта.</p>
        </li>
      </ol>

      <div class="checklist-card">
        <div class="checklist-h">
          <span>Готовность профиля</span>
          <span class="checklist-pct">{profileScore}%</span>
        </div>
        <div class="checklist-bar"><div class="checklist-bar-fill" style="width: {profileScore}%"></div></div>
        <ul class="checklist">
          {#each profileChecks as c}
            <li class={c.ok ? 'ok' : 'todo'}>
              <span class="check-icon">{c.ok ? '✓' : '○'}</span>
              {c.label}
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <!-- PROFILE -->
    <section id="profile" class="guide-section">
      <h2><span class="num">2</span>Профиль и риск-настройки</h2>
      <p class="lead">
        Профиль — это <em>твоё торговое соглашение с самим собой</em>. Все остальные
        фичи приложения опираются на него.
      </p>

      <div class="cols-2">
        <div class="info-card">
          <h4>Капитал и валюта</h4>
          <ul>
            <li><strong>Стартовый капитал</strong> — база для расчёта % риска и целей.</li>
            <li><strong>Валюта счёта</strong> — при смене сделки конвертируются по live-курсу.</li>
            <li><strong>Комиссия за лот</strong> — если торгуешь у брокера с фикс-комиссией.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Риск и лимиты</h4>
          <ul>
            <li><strong>Риск на сделку</strong> — % или сумма. Используется в pre-trade gate и в position sizer.</li>
            <li><strong>Дневной лимит убытка</strong> — пробьёшь = торговля на сегодня закрыта (kill-switch).</li>
            <li><strong>Макс. позиций / убытков подряд</strong> — мягкие предупреждения.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Цели Prop Plan</h4>
          <ul>
            <li>День / Неделя / Месяц / Год — % или сумма.</li>
            <li>Цель дня запускает <strong>Daily Review</strong> модалку.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Поведенческие ограничения</h4>
          <ul>
            <li><strong>Cooldown</strong> — пауза после убыточной сделки.</li>
            <li><strong>Anti-martingale</strong> — режет риск ×½ после 2+ убытков.</li>
            <li><strong>Daily review</strong> — напоминание закрыть терминал при цели.</li>
          </ul>
        </div>
      </div>

      <div class="live-preview">
        <div class="live-preview-h">📡 Сейчас в твоём профиле</div>
        <div class="live-preview-grid">
          <div><span>Риск/сделка</span><strong>{maxRiskAmount > 0 ? `${formatNumber(maxRiskAmount, 2)} ${ccy}` : '— не задан'}</strong></div>
          <div><span>Дневной стоп</span><strong>{maxDailyLossAmount > 0 ? `${formatNumber(maxDailyLossAmount, 2)} ${ccy}` : '— не задан'}</strong></div>
          <div><span>Цель дня</span><strong>{goalDayAmount > 0 ? `${formatNumber(goalDayAmount, 2)} ${ccy}` : '— не задана'}</strong></div>
          <div><span>Цель недели</span><strong>{goalWeekAmount > 0 ? `${formatNumber(goalWeekAmount, 2)} ${ccy}` : '— не задана'}</strong></div>
          <div><span>Cooldown</span><strong>{Number($userProfile?.cooldownAfterLossMin) > 0 ? `${$userProfile.cooldownAfterLossMin} мин` : 'выкл'}</strong></div>
          <div><span>Anti-martingale</span><strong>{$userProfile?.streakScalingEnabled ? 'вкл' : 'выкл'}</strong></div>
        </div>
        <button class="btn btn-primary" on:click={openProfile}>Открыть профиль →</button>
      </div>
    </section>

    <!-- TRADES -->
    <section id="trades" class="guide-section">
      <h2><span class="num">3</span>Сделки: добавление / закрытие / импорт</h2>

      <div class="cols-2">
        <div class="info-card">
          <h4>Новая сделка</h4>
          <ul>
            <li>Шаблоны слева — заполняют пару/таймфрейм/комментарии.</li>
            <li>Чекбокс «По рынку» — подставит текущий live bid/ask.</li>
            <li>Кнопка <strong>🎯</strong> рядом с объёмом — посчитает лот под твой лимит риска.</li>
            <li>Поля SL и TP — желательно <em>оба</em> (для R:R и для риск-карточки).</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Закрытие</h4>
          <ul>
            <li>В колонке открытых — кнопка «Закрыть».</li>
            <li>P&amp;L пересчитается из формулы под актив (FX, металлы, индексы, крипта, акции).</li>
            <li>Если убыток — стартует cooldown (если включён в профиле).</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Редактирование</h4>
          <ul>
            <li>Любое поле можно поправить задним числом.</li>
            <li>При изменении входа/выхода/объёма P&amp;L пересчитывается автоматически.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Импорт MT5</h4>
          <ul>
            <li>В MT5: <em>Терминал → История счёта → Сохранить как HTML</em>.</li>
            <li>В профиле: «Настройка счёта» — «Импорт в текущий» или при создании счёта с импортом; JSON / ZIP / MT5 HTML. Секция «Позиции» в HTML.</li>
            <li>Пары, объём, цены, комиссии и swap подхватятся; PnL пересчитается под формулы приложения.</li>
          </ul>
        </div>
      </div>

      <div class="formula">
        <div class="formula-h">📐 Формула P&amp;L</div>
        <code>profit = (close − open) × volume × contractSize × side − commission − swap</code>
        <div class="formula-sub">
          <strong>side</strong> = +1 для long, −1 для short.&nbsp;
          <strong>contractSize</strong> зависит от инструмента: 100&nbsp;000 (FX-major), 100 (XAU), 1 (BTC/ETH/XRP), 10 (XAG), и т.д.
        </div>
      </div>
    </section>

    <!-- DAY JOURNAL -->
    <section id="journal-day" class="guide-section">
      <h2><span class="num">📓</span>Журнал дня</h2>
      <p class="lead">
        Вкладка <strong>Журнал</strong> — отдельный дневник по календарным дням: настроение, план на сессию,
        чек-лист (настраиваемый шаблон), ревью и уроки. Записи хранятся в
        <code>localStorage</code> (<code>dayJournal_v1</code>), не смешиваются с таблицей сделок.
      </p>
      <div class="cols-2">
        <div class="info-card">
          <h4>Зачем</h4>
          <ul>
            <li>Фиксировать намерение до рынка и разбор после — отдельно от цифр P&amp;L.</li>
            <li>Свой чек-лист дня (KZ, лимит сделок, правила) — в настройках блока можно добавлять строки.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Как пользоваться</h4>
          <ul>
            <li>Выбери дату — редактор справа, слева список дней, где уже что-то заполнено.</li>
            <li>Быстрые сниппеты плана — кнопки под полем «План на день».</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- GLOSSARY + PHOTOS -->
    <section id="glossary-media" class="guide-section">
      <h2><span class="num">📚</span>Глоссарий и вложения</h2>
      <p class="lead">
        Вкладка <strong>Глоссарий</strong> — карточки терминов по категориям (ICT и свои). Текст в
        <code>localStorage</code> (<code>traderGlossary_v1</code>); к каждому термину и к <strong>закрытым</strong>
        сделкам можно прикреплять скриншоты.
      </p>
      <div class="cols-2">
        <div class="info-card">
          <h4>Добавление фото</h4>
          <ul>
            <li>Вставка из буфера (Ctrl+V), выбор файла, drag&amp;drop — можно несколько за раз.</li>
            <li>У каждой миниатюры крестик; клик по миниатюре — <strong>обрезка</strong> (crop), «Сохранить» / «Откатить» шаг рамки.</li>
            <li>После «Добавить» файлы режутся до WebP и попадают в хранилище вложений.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Где лежат байты</h4>
          <ul>
            <li><strong>Tauri (десктоп):</strong> папка <code>…/AppData/.../trader-journal-assets</code> — пути в данных вида <code>glossary/…</code>, <code>trades/…</code>.</li>
            <li><strong>Браузер / vite dev:</strong> те же пути в <strong>IndexedDB</strong> (не в <code>localStorage</code> — чтобы не раздувать квоту JSON).</li>
          </ul>
        </div>
        <div class="info-card big">
          <h4>Просмотр и бэкап</h4>
          <ul>
            <li>По кнопке с иконкой картинки — полноэкранный просмотр; удаление отдельного файла из карточки.</li>
            <li><strong>Экспорт ZIP / JSON</strong> — в профиле, вкладка «Настройка счёта», блок текущего счёта; ZIP — сделки + глоссарий + файлы из бандла; импорт ZIP восстанавливает метаданные и картинки.</li>
            <li>Обычный <strong>экспорт JSON</strong> — только табличные данные; глоссарий в JSON не тащится, вложения — только через ZIP.</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- PLAYBOOKS / ICT -->
    <section id="playbooks" class="guide-section">
      <h2><span class="num">♚</span>Плейбуки и ICT-таксономия</h2>
      <p class="lead">
        Стратегия — это набор сетапов (plays). Каждый play — отдельный сценарий с правилами входа,
        отмены идеи, требованиями к killzone и HTF bias. Сделка ссылается на конкретный play, и
        в статистике ты видишь его win-rate, expectancy и Profit Factor отдельно.
      </p>

      <div class="cols-2">
        <div class="info-card">
          <h4>Зачем</h4>
          <ul>
            <li>Хаотичный «journal-стиль» (всё в кучу) не отвечает на вопрос «<em>какой именно сетап работает</em>».</li>
            <li>Плейбук режет статистику по логически разным сценариям — ICT FVG+OTE ≠ Silver Bullet ≠ Judas reverse.</li>
            <li>Pre-trade чек-лист гарантирует, что без обязательных правил сделка не пройдёт без явного «переступаю».</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Структура play</h4>
          <ul>
            <li><strong>Preconditions</strong> — что должно быть на графике <em>до</em> входа.</li>
            <li><strong>Entry conditions</strong> — что подтверждает момент входа.</li>
            <li><strong>Invalidations</strong> — что отменяет идею (закрытие за уровнем).</li>
            <li><strong>Killzones</strong> — окна, где этот play валиден.</li>
            <li><strong>HTF requirement</strong>: aligned (по bias) / against (Judas) / any.</li>
            <li><strong>R:R</strong> — минимальный и таргет.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>ICT-таксономия (теги)</h4>
          <ul>
            <li><b>Narrative</b>: Judas Swing, Power of 3, Turtle Soup, SMT, Sweep&Reverse.</li>
            <li><b>Structure</b>: MSS, CHoCH, BSL/SSL grab.</li>
            <li><b>POI</b>: FVG, iFVG, OB, Breaker, Mitigation, Rejection.</li>
            <li><b>Execution</b>: OTE 62/70.5/79, Equilibrium, Premium/Discount.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>В сделке</h4>
          <ul>
            <li>Выбираешь <em>Стратегия → Setup</em> в форме новой сделки.</li>
            <li>Появляется чек-лист правил из play. Required-пункты блокируют сохранение без явного подтверждения.</li>
            <li>В таблице открытых/закрытых сделок появляется колонка «KZ · Setup».</li>
            <li>В Статистике — фильтр «Setup» и таблица «По сетапам» с PF/expectancy на каждый play.</li>
          </ul>
        </div>
      </div>

      <p class="lead">
        Стартовый набор: <b>ICT — базовый</b> с тремя play (FVG+OTE в London KZ, Silver Bullet 10–11 NY, Judas reverse).
        Можно добавлять свои стратегии и play в табе «Плейбуки», экспортировать/импортировать как JSON.
      </p>
    </section>

    <!-- KILLZONES -->
    <section id="killzones" class="guide-section">
      <h2><span class="num">⏰</span>Killzones — окна повышенной ликвидности</h2>
      <p class="lead">
        Killzone определяется автоматически по <code>dateOpen</code> сделки в часовом поясе
        <strong>America/New_York</strong> (DST учитывается). Сохраняется в поле <code>killzone</code>
        и используется для аналитики.
      </p>

      <div class="cols-2">
        <div class="info-card">
          <h4>Окна (NY-time)</h4>
          <ul>
            <li><b>Asia</b> 20:00 → 00:00 — построение премиум/дискаунт диапазона.</li>
            <li><b>London Open</b> 02:00 → 05:00.</li>
            <li><b>NY AM</b> 08:30 → 11:00.</li>
            <li><b>Silver Bullet</b> 10:00 → 11:00 NY — самое узкое окно ICT.</li>
            <li><b>London Close</b> 10:00 → 12:00.</li>
            <li><b>NY PM</b> 13:30 → 16:00.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Где используется</h4>
          <ul>
            <li>В форме новой сделки — карточка «Killzone (NY-time)» показывает текущий KZ.</li>
            <li>В таблицах сделок — колонка «KZ · Setup».</li>
            <li>В Статистике — фильтр «Killzone» и таблица «PnL по killzone».</li>
            <li>Если play требует конкретные KZ, а сделка вне них — soft-warning при сохранении.</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- HTF BIAS -->
    <section id="bias" class="guide-section">
      <h2><span class="num">⇡</span>HTF Bias — направленческий контекст</h2>
      <p class="lead">
        Раз в день фиксируешь Daily/H4 bias по символу через кнопку <b>Bias</b> в шапке.
        Сделки против bias автоматически помечаются как нарушение, а в статистике появляется
        разрез <em>aligned vs against</em> — это валидация твоего HTF-нарратива.
      </p>

      <div class="cols-2">
        <div class="info-card">
          <h4>Что записываешь</h4>
          <ul>
            <li><b>Daily / H4</b>: Bull / Neutral / Bear.</li>
            <li><b>Нарратив</b>: HTF структура, weekly OB, sweep вчера, новости.</li>
            <li><b>Ключевые уровни</b>: одна строка = <code>price label</code> (PDH, Asia low, FVG…).</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Как используется</h4>
          <ul>
            <li>В форме сделки — карточка «HTF Bias» с пометкой aligned/против bias.</li>
            <li>В Pre-trade gate — <em>warn</em> если сделка против bias и play не «against».</li>
            <li>В Статистике — секция «Совпадение с HTF Bias» (3 карточки: aligned / против / без bias).</li>
            <li>Bias один на (символ, дата). Если на сегодня нет — берётся последний за 7 дней.</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- RISK HUD -->
    <section id="risk-hud" class="guide-section">
      <h2><span class="num">4</span>Risk HUD — приборная панель</h2>
      <p class="lead">
        Полоса карточек под header'ом обновляется в реальном времени и переживает тики live-цен.
      </p>

      <div class="hud-legend">
        <div><b>Equity</b> — стартовый капитал + закрытый PnL + плавающий PnL открытых.</div>
        <div><b>Дневной P/L</b> — закрытые сделки за сегодня; полоса = % использования дневного стопа.</div>
        <div><b>Открытый риск</b> — сумма потерь, если все открытые позиции выбьет по SL. Полоса = % от бюджета (риск × макс. позиций).</div>
        <div><b>Позиций</b> — текущее vs лимит из профиля.</div>
        <div><b>Серия</b> — подряд побед/убытков. Цвет краснеет при приближении к лимиту.</div>
        <div><b>Цель день</b> — прогресс к дневной цели; в подписи — недельная и месячная.</div>
        <div><b>Anti-revenge</b> — появляется только когда активен cooldown или сработал anti-martingale.</div>
        <div><b>Дисциплина</b> — % сделок без нарушений правил профиля.</div>
      </div>
    </section>

    <!-- PRE-TRADE -->
    <section id="pre-trade" class="guide-section">
      <h2><span class="num">5</span>Pre-trade gate — ворота перед записью</h2>
      <p class="lead">
        Когда жмёшь «Сохранить», движок прогоняет сделку через
        <code>evaluateTradeRules()</code> и возвращает массив нарушений двух типов:
      </p>

      <div class="severity-grid">
        <div class="severity-card severe">
          <div class="severity-h">🔴 BLOCK</div>
          <p>Жёсткое нарушение — нужна явная галочка «Я понимаю риск» в модалке подтверждения.</p>
          <ul>
            <li>Риск превышает лимит (с учётом anti-martingale)</li>
            <li>Дневной лимит убытка пробит</li>
            <li>Превышен лимит открытых позиций</li>
            <li>Активен cooldown после убытка</li>
          </ul>
        </div>
        <div class="severity-card warn">
          <div class="severity-h">🟠 WARN</div>
          <p>Мягкое — нужно просто подтвердить кнопкой.</p>
          <ul>
            <li>Нет SL — риск нельзя посчитать</li>
            <li>Серия убытков подходит к лимиту</li>
            <li>Уже открыта противоположная позиция (хедж)</li>
            <li>Не отмечен чек-лист из заметок</li>
          </ul>
        </div>
      </div>

      <p class="lead-sub">
        Превью нарушений виден прямо в форме —
        <strong>до</strong> нажатия «Сохранить». Кнопка меняет цвет:
        <span class="pill pill-primary">btn-primary</span> →
        <span class="pill pill-warn">btn-warn</span> →
        <span class="pill pill-danger">btn-danger</span>.
      </p>
    </section>

    <!-- ANTI REVENGE -->
    <section id="anti-revenge" class="guide-section">
      <h2><span class="num">6</span>Anti-revenge: cooldown + anti-martingale</h2>
      <p class="lead">
        Самые дорогие сделки — те, что после убытка. Две защиты работают параллельно.
      </p>

      <div class="cols-2">
        <div class="info-card big">
          <h4>⏸ Cooldown</h4>
          <p>После закрытия минусовой сделки запускается таймер на N минут. В это время:</p>
          <ul>
            <li>Кнопка «+ Новая сделка» disabled</li>
            <li>В HUD карточка <em>Anti-revenge</em> показывает обратный отсчёт MM:SS</li>
            <li>Над списком сделок — жёлтый баннер с кнопкой «Отменить cooldown»</li>
            <li>Пережит <code>localStorage</code> — даже если перезагрузишь браузер</li>
          </ul>
          <div class="status-line">
            Сейчас: {cooldownActive ? '🟠 cooldown активен' : '🟢 пауза не активна'}
          </div>
        </div>

        <div class="info-card big">
          <h4>↘ Anti-martingale (опционально)</h4>
          <p>
            Когда серия убытков ≥&nbsp;2, предлагаемый объём режется по геометрической прогрессии:
          </p>
          <table class="mini-table">
            <thead><tr><th>Серия</th><th>Множитель риска</th></tr></thead>
            <tbody>
              <tr><td>0 / 1 убыток</td><td>×1.0</td></tr>
              <tr><td>2 подряд</td><td>×0.5</td></tr>
              <tr><td>3 подряд</td><td>×0.25</td></tr>
              <tr><td>4+ подряд</td><td>×0.125 (минимум)</td></tr>
            </tbody>
          </table>
          <div class="status-line">
            Текущая серия: <strong>{streak.kind === 'none' ? '—' : (streak.kind === 'win' ? '+' : '−') + streak.length}</strong>
            &nbsp;·&nbsp;множитель: <strong>×{riskScale}</strong>
          </div>
        </div>
      </div>
    </section>

    <!-- KILL SWITCH -->
    <section id="kill-switch" class="guide-section">
      <h2><span class="num">7</span>Kill-switch — стоп торговли на день</h2>
      <p class="lead">
        Если суммарный закрытый PnL за сегодня ≤ −<em>дневного лимита</em>:
      </p>
      <ul class="bullet-list">
        <li>Над журналом появляется красный баннер «Торговля заблокирована»</li>
        <li>Кнопка «+ Новая сделка» становится disabled</li>
        <li>Состояние сбрасывается автоматически в полночь (новый день — новые сделки засчитываются заново)</li>
      </ul>
      <div class="status-line">
        Сейчас: {dailyStop.hit ? '🔴 KILL-SWITCH активен' : '🟢 свободная торговля'}
        {#if maxDailyLossAmount > 0}
          &nbsp;·&nbsp;PnL дня: <strong>{formatNumber(dailyStop.pnl, 2)} {ccy}</strong>
          &nbsp;·&nbsp;стоп: <strong>−{formatNumber(maxDailyLossAmount, 2)} {ccy}</strong>
        {/if}
      </div>
    </section>

    <!-- DAILY REVIEW -->
    <section id="daily-review" class="guide-section">
      <h2><span class="num">8</span>Daily review — закрой день при цели</h2>
      <p class="lead">
        Когда дневной PnL ≥ цели дня — выскакивает модалка с напоминанием
        закрыть терминал и разобрать сделки. Раз в сутки.
      </p>
      <div class="quote-card">
        <p>
          «Жадность чаще всего убивает дневной плюс. Закрытие в плюсе — это
          навык, а не упущенная прибыль.»
        </p>
      </div>
      <p class="lead-sub">
        Можно отключить флагом «Напоминание `закрой день при цели`» в профиле.
      </p>
    </section>

    <!-- NOTES -->
    <section id="notes" class="guide-section">
      <h2><span class="num">9</span>Notes-чек-лист</h2>
      <p class="lead">
        Свободные заметки в профиле превращаются в чек-лист в форме сделки.
        Каждая непустая строка — пункт.
      </p>

      <div class="cols-2">
        <div class="code-card">
          <div class="code-h">Пример заметок профиля:</div>
          <pre>Тренд на старшем ТФ совпадает
Уровень / структура подтверждены
Есть свечной паттерн на входе
Risk:Reward ≥ 1:2
# Это комментарий — игнорируется</pre>
        </div>
        <div class="info-card">
          <h4>Поведение</h4>
          <ul>
            <li>Строки с <code>#</code> в начале — комментарии, не попадают в чек-лист.</li>
            <li>Если не все пункты отмечены — добавляется <strong>WARN</strong>, но не блокирует.</li>
            <li>Чек-лист сбрасывается при каждом открытии формы.</li>
          </ul>
          <div class="status-line">
            Сейчас в профиле: <strong>{notesItems.length}</strong> пунктов чек-листа
          </div>
        </div>
      </div>
    </section>

    <!-- LIVE PRICES -->
    <section id="live-prices" class="guide-section">
      <h2><span class="num">10</span>Live-цены — без ключей</h2>
      <p class="lead">
        Никаких <code>API_KEY</code> в коде. Используются открытые WebSocket-каналы:
      </p>

      <div class="cols-2">
        <div class="info-card">
          <h4>Crypto → Binance</h4>
          <ul>
            <li>Streams: <code>@bookTicker</code> + <code>@aggTrade</code></li>
            <li>Тикер пересоберётся при добавлении новой пары</li>
            <li>Поддержка USDT/USDC/BTC котировок</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>FX / металлы / индексы / нефть → OANDA через TradingView</h4>
          <ul>
            <li>Маппинг символов: <code>EURUSD → OANDA:EURUSD</code></li>
            <li>Real-time для major-pairs, XAUUSD, XAGUSD, US30/SPX/NAS, WTICO/BCO</li>
            <li>Анонимная WS-сессия — пинг ~30–80 ms</li>
          </ul>
        </div>
      </div>

      <div class="status-line">
        Стримов сейчас:
        <strong>{livePairsCount}</strong>
        &nbsp;·&nbsp;ping:
        <strong>{pingMs != null ? `${pingMs} ms` : '—'}</strong>
      </div>
    </section>

    <!-- STATISTICS -->
    <section id="statistics" class="guide-section">
      <h2><span class="num">11</span>Статистика — что и зачем</h2>

      <p class="lead">
        Вкладка <strong>Статистика</strong> показывает базовые KPI + поведенческие графики.
        Отдельно вкладка <strong>Аналитика</strong> — не те же графики: маяки по данным журнала, дорожная карта
        процесса и вопрос для рефлексии (без LLM, всё локально).
        Сверху — панель фильтров: что в ней выберешь, то и применится ко всем графикам и таблице тегов.
      </p>

      <!-- Фильтры -->
      <div class="info-card big">
        <h4>🎛 Панель фильтров</h4>
        <ul>
          <li><strong>Период</strong> — Всё / День / Неделя / Месяц / 3 мес / Год. Урезает выборку по дате закрытия.</li>
          <li><strong>Направление</strong> — Long / Short / Все. Удобно проверять, на чём именно у тебя edge.</li>
          <li><strong>Тег</strong> — выбирай конкретный сетап и смотри его статистику отдельно.</li>
          <li><strong>«Только без нарушений правил»</strong> — оставляет только disciplined-сделки. Это твой «эталонный я».</li>
          <li><strong>× Сбросить</strong> — снимает все фильтры одним кликом.</li>
          <li>Справа в шапке — live-сводка: <code>N сделок · ±сумма · WR % · W/L</code>.</li>
        </ul>
      </div>

      <div class="cols-2">
        <div class="info-card">
          <h4>Базовые блоки</h4>
          <ul>
            <li><strong>Доходность</strong> — net, gross, profit factor, expectancy.</li>
            <li><strong>Сделки</strong> — win-rate, средние/максимальные.</li>
            <li><strong>Long/Short</strong> — где у тебя реально edge.</li>
            <li><strong>Серии</strong> — статистика подряд побед/убытков.</li>
            <li><strong>Риск</strong> — макс. просадка $ и %, recovery factor, упрощённый Sharpe.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Поведенческие графики</h4>
          <ul>
            <li><strong>Equity Curve</strong> — две линии: реальная и disciplined.</li>
            <li><strong>PnL by hour</strong> — два бара на каждый час: total + avg/сделка.</li>
            <li><strong>PnL by weekday</strong> — то же по дням Пн–Вс.</li>
            <li><strong>По тегам сетапов</strong> — таблица win-rate / PnL / expectancy / PF.</li>
          </ul>
        </div>
      </div>

      <!-- Equity Curve -->
      <h3 class="sub-h">Equity Curve · реальная vs disciplined</h3>
      <div class="cols-2">
        <div class="info-card">
          <h4>Что показывает</h4>
          <ul>
            <li><strong>Реальная</strong> (сплошная) — фактический баланс по факту закрытий.</li>
            <li><strong>Disciplined</strong> (пунктирная) — баланс если бы ты пропустил сделки с <code>ruleViolations</code>.</li>
            <li><strong>Gap</strong> = Disciplined − Real. Если положительный — правила бы тебя спасли.</li>
            <li>Заливка под линией реальной — для визуального якоря.</li>
            <li>Пунктирная горизонталь — стартовый капитал.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>Как читать</h4>
          <ul>
            <li><strong>Линии расходятся вверх</strong> — нарушаешь систематически и в плюсе. Опасно: «работает» по случайности.</li>
            <li><strong>Линии расходятся вниз</strong> — disciplined ниже real. Значит твои нарушения иногда дают плюс. Тоже не повод их повторять.</li>
            <li><strong>Линии совпадают</strong> — ты строго по плану. Идеально.</li>
            <li>Точки в конце — финальные значения (отдельный маркер для каждой линии).</li>
          </ul>
        </div>
      </div>

      <!-- Bars -->
      <h3 class="sub-h">PnL by hour / weekday — почему два бара</h3>
      <div class="bar-explainer">
        <div class="bar-explainer-row">
          <span class="bar-swatch sw-total"></span>
          <div>
            <strong>Левый — total PnL за час/день</strong>
            <p>Насыщенный оттенок. Сколько ты в сумме заработал/потерял в этот час. Чем выше столбик — тем больше торгуешь и/или крупнее результат.</p>
          </div>
        </div>
        <div class="bar-explainer-row">
          <span class="bar-swatch sw-avg"></span>
          <div>
            <strong>Правый — avg PnL/сделка (sum ÷ count)</strong>
            <p>Тот же цвет, но <strong>светлее</strong> — это «средний результат одной сделки в этом часе». Можно делать 50 сделок с микро-плюсом или 5 с большим — на втором баре сразу видно качество.</p>
          </div>
        </div>
        <div class="bar-explainer-row tip">
          💡
          <div>
            <p>
              <strong>Опасный паттерн</strong>: левый бар большой зелёный, правый маленький — много сделок, но edge размазан.
              Часто это признак overtrading'а в активные часы.
            </p>
            <p>
              <strong>Хороший паттерн</strong>: оба бара зелёные и сравнимы по размеру — стабильный edge.
            </p>
          </div>
        </div>
      </div>

      <div class="info-card">
        <h4>Дополнительно на барчартах</h4>
        <ul>
          <li>5 grid-линий на оси Y (±max, ±max/2, 0) — амплитуда видна сразу.</li>
          <li>Под каждой меткой часа/дня — мелкое число, это <strong>кол-во сделок</strong>.</li>
          <li>Лучший и худший час/день обведены зелёной/красной рамкой + подпись значения.</li>
          <li>В заголовке секции — <code>avg/сделка</code> и <code>avg/торговый час</code> по всей выборке.</li>
          <li>
            <strong>Tooltip</strong> — наведи курсор в <em>любую точку столбца</em> (выше, ниже или прямо на бар), всплывёт сводка по часу:
            кол-во сделок, W/L, total и avg/сделка. Не нужно целиться в узкий бар.
          </li>
        </ul>
      </div>

      <!-- Tag table -->
      <h3 class="sub-h">По тегам сетапов</h3>
      <div class="info-card">
        <h4>Метрики таблицы</h4>
        <ul>
          <li><strong>Win Rate</strong> — % прибыльных сделок в этом теге.</li>
          <li><strong>Net PnL</strong> — суммарный финансовый результат.</li>
          <li><strong>Expectancy</strong> — средний PnL на одну сделку.</li>
          <li><strong>PF (Profit Factor)</strong> — Σ прибыли ÷ Σ убытков. Ориентир: ≥ 1.5 — рабочий сетап, ≥ 2 — сильный.</li>
        </ul>
      </div>

      <div class="quote-card">
        <p>
          Включи фильтр «Только без нарушений правил» и сравни таблицу тегов до и после.
          Сетапы, у которых PF падает в disciplined-режиме — это иллюзия edge'а: PnL держится на нарушениях.
        </p>
      </div>
    </section>

    <!-- DATA -->
    <section id="data" class="guide-section">
      <h2><span class="num">12</span>Данные, темы и shortcuts</h2>

      <div class="cols-3">
        <div class="info-card">
          <h4>💾 Хранение</h4>
          <ul>
            <li>Всё в <code>localStorage</code> браузера, на твоём железе.</li>
            <li>Лимит браузера ≈ 5–10 МБ — хватит на десятки тысяч сделок.</li>
            <li>При <code>QuotaExceededError</code> покажется toast — экспортируй и почисти.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>↓↑ Экспорт / Импорт</h4>
          <ul>
            <li><strong>ZIP</strong> — полный бэкап: сделки, глоссарий, файлы картинок.</li>
            <li><strong>JSON</strong> — без бинарных вложений; глоссарий отдельным потоком не тянется.</li>
            <li><strong>HTML MT5</strong> — импорт позиций/истории, как в разделе про сделки.</li>
          </ul>
        </div>
        <div class="info-card">
          <h4>🎨 Темы</h4>
          <ul>
            <li>Светло-бежевая, тёмно-серая, белая, плюс <strong>Неон</strong> (чёрный фон + лайм).</li>
            <li>Переключатель в шапке; отдельно — окно «Параметры журнала» (killzones, TZ).</li>
            <li>Выбор сохраняется автоматически.</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="guide-section">
      <h2><span class="num">13</span>FAQ</h2>

      <details class="faq-item" open>
        <summary>Куда уходят мои сделки и P&L?</summary>
        <p>Никуда. Всё локально. Нет бекенда, нет аналитики — приложение даже не знает, что ты есть.</p>
      </details>

      <details class="faq-item">
        <summary>Я ввёл цену закрытия, но P&amp;L не меняется?</summary>
        <p>В импортированных MT5-сделках P&amp;L был сохранён от брокера. При ручном изменении ключевых полей (цена входа/выхода, объём) приложение пересчитывает PnL по своей формуле.</p>
      </details>

      <details class="faq-item">
        <summary>Можно ли отключить cooldown один раз, не убирая в профиле?</summary>
        <p>Да. Когда баннер активен — справа кнопка «Отменить cooldown» с подтверждением. Используй честно: эта кнопка для выходных, а не для тильта.</p>
      </details>

      <details class="faq-item">
        <summary>Почему рекомендуемый объём (🎯) меньше моих ожиданий?</summary>
        <p>Скорее всего активен <em>anti-martingale</em> после серии убытков (см. HUD-карточку Anti-revenge). Множ·итель ×0.5 / ×0.25 — это <strong>фича</strong>, не баг.</p>
      </details>

      <details class="faq-item">
        <summary>Как добавить тег к сделке?</summary>
        <p>В форме сделки есть поле «Теги» — пиши через запятую. Аналитика по тегам появится в Статистике.</p>
      </details>

      <details class="faq-item">
        <summary>Что значит «Disciplined PnL»?</summary>
        <p>Сумма прибыли только тех сделок, у которых нет <code>ruleViolations</code>. Это эталонная линия — куда ты бы пришёл, если бы соблюдал свой план без исключений.</p>
      </details>

      <details class="faq-item">
        <summary>Как перенести скриншоты на другой ПК?</summary>
        <p>Только через <strong>Экспорт ZIP</strong> в профиле («Настройка счёта») и импорт ZIP на новом месте. Обычный JSON не содержит файлов и не обновляет глоссарий целиком.</p>
      </details>

      <div class="cta-card">
        <div>
          <h4>Готов?</h4>
          <p>Начни с настройки профиля — это 60 секунд, и приложение сразу включится в работу.</p>
        </div>
        <button class="btn btn-primary" on:click={openProfile}>Открыть профиль</button>
      </div>
    </section>

  </main>
</div>

<style>
  .guide {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 24px;
    padding: 0 20px 40px;
    align-items: start;
  }

  /* ---------------- TOC ---------------- */
  .guide-toc {
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 14px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    font-size: 13px;
  }
  .toc-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    font-weight: 700;
    margin-bottom: 10px;
  }
  .guide-toc nav { display: flex; flex-direction: column; gap: 2px; }
  .toc-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0 3px 3px 0;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    transition: background 120ms, color 120ms, border-color 120ms;
  }
  .toc-item:hover { background: var(--bg-3, var(--bg)); }
  .toc-item.active {
    background: var(--bg-3, var(--bg));
    color: var(--text-strong);
    border-left-color: var(--accent);
    font-weight: 600;
  }
  .toc-icon {
    display: inline-flex;
    width: 18px;
    justify-content: center;
    color: var(--text-muted);
  }
  .toc-item.active .toc-icon { color: var(--accent); }

  .toc-stats {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .toc-stats-row {
    display: flex;
    justify-content: space-between;
    color: var(--text-muted);
  }
  .toc-stats-row strong { color: var(--text-strong); font-weight: 600; }

  /* --------------- CONTENT --------------- */
  .guide-content { min-width: 0; }
  .guide-section {
    scroll-margin-top: 16px;
    margin-bottom: 36px;
  }
  .guide-section h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 12px;
    font-size: 22px;
    color: var(--text-strong);
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }
  .guide-section h2 .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .lead { font-size: 14.5px; line-height: 1.6; color: var(--text); margin: 0 0 14px; }
  .lead-sub { font-size: 13px; color: var(--text-muted); margin: 14px 0 0; }
  .bullet-list { padding-left: 20px; line-height: 1.6; }

  code { background: var(--bg-3, var(--bg-2)); padding: 1px 6px; border-radius: 3px; font-size: 12.5px; }

  /* --------- HERO --------- */
  .hero {
    padding: 28px 28px 24px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: linear-gradient(135deg, var(--bg-2), var(--bg));
    margin-bottom: 36px;
  }
  .hero h1 {
    margin: 0 0 10px;
    font-size: 32px;
    line-height: 1.15;
    color: var(--text-strong);
    border: 0;
  }
  .hero-badge {
    display: inline-block;
    padding: 4px 10px;
    margin-bottom: 14px;
    background: var(--badge-hero-bg);
    color: var(--badge-hero-fg);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    border-radius: 3px;
    border: 1px solid var(--border-strong);
  }
  .hero-lead {
    font-size: 16px;
    line-height: 1.6;
    color: var(--text);
    margin: 0 0 20px;
    max-width: 760px;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  .hero-card {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
  }
  .hero-card-h {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-strong);
    margin-bottom: 6px;
  }
  .hero-card p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); }

  /* --------- STEPS --------- */
  .steps {
    counter-reset: stp;
    list-style: none;
    padding: 0;
    margin: 0 0 16px;
    display: grid;
    gap: 10px;
  }
  .steps li {
    counter-increment: stp;
    position: relative;
    padding: 10px 12px 10px 44px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .steps li::before {
    content: counter(stp);
    position: absolute;
    left: 12px;
    top: 12px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 12px;
    font-weight: 700;
  }
  .step-h { font-weight: 600; color: var(--text-strong); margin-bottom: 4px; font-size: 14px; }
  .steps p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text); }
  .link-btn {
    background: transparent;
    border: 0;
    border-bottom: 1px dashed var(--accent);
    color: var(--accent);
    padding: 0 2px;
    cursor: pointer;
    font: inherit;
  }

  /* --------- CHECKLIST --------- */
  .checklist-card {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .checklist-h {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--text-strong);
    font-size: 14px;
  }
  .checklist-pct { font-size: 18px; color: var(--accent); }
  .checklist-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-3, var(--bg));
    overflow: hidden;
    margin-bottom: 12px;
  }
  .checklist-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 320ms ease;
  }
  .checklist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 6px;
  }
  .checklist li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .checklist .check-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
  }
  .checklist .ok { color: var(--profit); }
  .checklist .ok .check-icon { background: var(--profit); color: var(--profit-fg, #fff); }
  .checklist .todo { color: var(--text-muted); }
  .checklist .todo .check-icon {
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  /* --------- INFO CARDS --------- */
  .cols-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }
  .cols-3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  .info-card {
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
  }
  .info-card.big { border-left-width: 4px; }
  .info-card h4 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--text-strong);
  }
  .info-card ul {
    margin: 0;
    padding-left: 18px;
    line-height: 1.55;
    font-size: 13px;
    color: var(--text);
  }
  .info-card li { margin-bottom: 4px; }

  /* --------- LIVE PREVIEW --------- */
  .live-preview {
    margin-top: 14px;
    padding: 14px 16px;
    border: 1px dashed var(--accent);
    border-radius: 4px;
    background: var(--bg);
  }
  .live-preview-h {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 10px;
  }
  .live-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .live-preview-grid > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 3px;
  }
  .live-preview-grid span {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-muted);
  }
  .live-preview-grid strong {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 14px;
    color: var(--text-strong);
  }

  /* --------- FORMULA --------- */
  .formula {
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 14px;
  }
  .formula-h {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .formula code {
    display: block;
    padding: 8px 10px;
    background: var(--bg);
    font-size: 13px;
    border-radius: 3px;
    border: 1px solid var(--border);
    overflow-x: auto;
  }
  .formula-sub { margin-top: 8px; font-size: 12px; color: var(--text-muted); line-height: 1.5; }

  /* --------- HUD LEGEND --------- */
  .hud-legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px;
  }
  .hud-legend > div {
    padding: 10px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 13px;
    line-height: 1.5;
  }
  .hud-legend b { color: var(--text-strong); }

  /* --------- SEVERITY --------- */
  .severity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
  }
  .severity-card {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
  }
  .severity-card.severe { border-left: 4px solid var(--loss); }
  .severity-card.warn   { border-left: 4px solid var(--warning); }
  .severity-h {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 6px;
    color: var(--text-strong);
  }
  .severity-card p { margin: 0 0 8px; font-size: 13px; line-height: 1.5; }
  .severity-card ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }

  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .pill-primary { background: var(--accent); color: var(--accent-fg); }
  .pill-warn { background: var(--warning); color: var(--warning-fg, #fff); }
  .pill-danger { background: var(--loss); color: var(--loss-fg, #fff); }

  /* --------- STATUS LINE --------- */
  .status-line {
    margin-top: 12px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .status-line strong { color: var(--text-strong); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  /* --------- MINI TABLE --------- */
  .mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin: 8px 0;
  }
  .mini-table th, .mini-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .mini-table th {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* --------- QUOTE --------- */
  .quote-card {
    padding: 14px 18px;
    background: var(--bg-2);
    border-left: 3px solid var(--accent);
    border-radius: 0 4px 4px 0;
    margin: 12px 0;
  }
  .quote-card p {
    margin: 0;
    font-style: italic;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text);
  }

  /* --------- CODE CARD --------- */
  .code-card {
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .code-h {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .code-card pre {
    margin: 0;
    padding: 10px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text);
    white-space: pre-wrap;
  }

  /* --------- FAQ --------- */
  .faq-item {
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 8px;
    background: var(--bg-2);
  }
  .faq-item summary {
    padding: 10px 14px;
    cursor: pointer;
    font-weight: 600;
    color: var(--text-strong);
    font-size: 14px;
    list-style: none;
  }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item summary::before {
    content: '▸';
    display: inline-block;
    margin-right: 8px;
    color: var(--text-muted);
    transition: transform 160ms;
  }
  .faq-item[open] summary::before { transform: rotate(90deg); }
  .faq-item p {
    margin: 0;
    padding: 0 14px 12px 30px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
  }

  .cta-card {
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: linear-gradient(135deg, var(--bg-2), var(--bg));
    flex-wrap: wrap;
  }
  .cta-card h4 { margin: 0 0 4px; color: var(--text-strong); font-size: 16px; }
  .cta-card p  { margin: 0; font-size: 13px; color: var(--text-muted); }

  /* ---- Statistics-section sub-headers ---- */
  .sub-h {
    margin: 22px 0 10px;
    font-size: 14px;
    color: var(--text-strong);
    font-weight: 700;
    border-left: 3px solid var(--accent);
    padding-left: 10px;
  }

  /* ---- Bar explainer ---- */
  .bar-explainer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 12px;
  }
  .bar-explainer-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 1.5;
  }
  .bar-explainer-row.tip {
    padding: 10px 12px;
    background: var(--bg);
    border-left: 3px solid var(--warning);
    border-radius: 0 3px 3px 0;
    font-size: 13px;
  }
  .bar-explainer-row strong { color: var(--text-strong); display: block; margin-bottom: 2px; }
  .bar-explainer-row p { margin: 0; color: var(--text-muted); font-size: 12.5px; }
  .bar-explainer-row p + p { margin-top: 6px; }

  .bar-swatch {
    flex-shrink: 0;
    display: inline-block;
    width: 22px;
    height: 36px;
    border-radius: 2px;
    margin-top: 4px;
  }
  .bar-swatch.sw-total {
    background: var(--profit);
    opacity: 0.92;
  }
  .bar-swatch.sw-avg {
    background: color-mix(in srgb, var(--profit) 45%, transparent);
  }

  /* --------- RESPONSIVE --------- */
  @media (max-width: 900px) {
    .guide {
      grid-template-columns: 1fr;
    }
    .guide-toc {
      position: relative;
      max-height: none;
      top: 0;
    }
  }
</style>
