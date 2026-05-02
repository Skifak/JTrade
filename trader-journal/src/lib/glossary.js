/**
 * Глоссарий / энциклопедия трейдера: категории и карточки понятий.
 */
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { toasts } from './toasts';
import { removeScopeDir } from './attachmentApi';
import { loadAccountData, saveAccountData } from './accountStorage.js';
import { activeJournalAccountId } from './accounts.js';

const KEY = 'traderGlossary_v1';

const UNCATEGORIZED_ID = 'cat-uncat';

function getDefaultState() {
  return {
    categories: [
      { id: 'cat-structure', name: 'Структура и ликвидность' },
      { id: 'cat-zones', name: 'Зоны и POI' },
      { id: 'cat-time', name: 'Время и сессии' },
      { id: 'cat-psych', name: 'Психология и риск' },
      { id: UNCATEGORIZED_ID, name: 'Без категории' }
    ],
    terms: [
      {
        id: 'term-bias',
        title: 'Bias (смещение)',
        definition:
          'Устойчивое ожидание направления цены со стороны «умных денег» на старших ТФ: куда вероятнее развитие импульса до ближайшей цели (ликвидности). Торговать в сторону bias и не против него — базовый фильтр для входов.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-fvg',
        title: 'FVG (Fair Value Gap)',
        definition:
          'Имбаланс / разрыв между свечами: зона, которую цена «перепрыгнула» с сильным дисплейсментом. Часто притягивает ретест как POI; в контексте ICT используется для дискаунта/премиума и целей.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-ifvg',
        title: 'iFVG (Inverted FVG)',
        definition:
          'FVG, который цена закрыла и использовала как поддержку/сопротивление; инвертированный разрыв может стать зоной реакции при возврате.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-ob',
        title: 'Order Block (OB)',
        definition:
          'Зона последней противоположной свечи перед импульсом: предполагаемый блок лимитных ордеров крупного игрока. Используется как POI для входа в сторону дисплейсмента.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-ote',
        title: 'OTE (Optimal Trade Entry)',
        definition:
          'Зона «оптимального» входа в ретрейсе Фибо, классически 62–79% от импульса. В связке с FVG/OB и контекстом ликвидности.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-liquidity',
        title: 'Ликвидность (BSL / SSL)',
        definition:
          'Скопление стопов за экстремумами: BSL — выше максимумов, SSL — ниже минимумов. Цена часто идёт «за ликвидность» перед разворотом или продолжением.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-sweep',
        title: 'Sweep (снятие ликвидности)',
        definition:
          'Ложный пробой уровня с быстрым возвратом: охота за стопами перед истинным движением. Частый триггер входа после подтверждения структурой.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-mss',
        title: 'MSS (Market Structure Shift)',
        definition:
          'Смена структуры на младшем ТФ: первый сигнал, что краткосрочный тренд может развернуться в сторону HTF bias или сетапа.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-bos',
        title: 'BOS (Break of Structure)',
        definition:
          'Пробой значимого свинга по структуре: подтверждение продолжения тренда на данном ТФ.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-choch',
        title: 'CHoCH (Change of Character)',
        definition:
          'Смена характера рынка: признаки того, что доминирующее направление ослабло и контекст сместился (часто после sweep и новой структуры).',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-kz',
        title: 'Killzone',
        definition:
          'Окно времени повышенной волатильности и активности крупных игроков (London, NY и т.д.). Многие сетапы ICT привязаны к конкретным KZ.',
        categoryId: 'cat-time',
        favorite: false
      },
      {
        id: 'term-displacement',
        title: 'Displacement',
        definition:
          'Сильная импульсная свеча с малым возвратом тела — «вынос» цены; маркирует намерение и часто оставляет FVG/IOB для последующих входов.',
        categoryId: 'cat-structure',
        favorite: false
      },
      {
        id: 'term-premium',
        title: 'Premium / Discount',
        definition:
          'Премиум — верхняя часть диапазона (дорого для покупок в лонг-контексте); дискаунт — нижняя (дешевле). Входы в лонг чаще из дискаунта диапазона.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-poi',
        title: 'POI (Point of Interest)',
        definition:
          'Любая значимая зона для потенциального входа: FVG, OB, breaker, OTE и т.п., совпадающая с контекстом bias и ликвидности.',
        categoryId: 'cat-zones',
        favorite: false
      },
      {
        id: 'term-judas',
        title: 'Judas Swing',
        definition:
          'Ложный ход в Азии/ранней сессии перед истинным направлением в основной KZ; используется как фильтр ликвидности перед импульсом.',
        categoryId: 'cat-time',
        favorite: false
      },
      {
        id: 'term-silver',
        title: 'Silver Bullet',
        definition:
          'Концепт узкого окна (часто 10:00–11:00 NY) для импульсного движения из ключевой зоны; один из типовых ICT-сетапов.',
        categoryId: 'cat-time',
        favorite: false
      },
      {
        id: 'term-rr',
        title: 'R:R (Risk / Reward)',
        definition:
          'Соотношение потенциальной прибыли к риску по сделке. Минимум 1:1 — базовый ориентир; выше — при том же винрейте лучше мат. ожидание.',
        categoryId: 'cat-psych',
        favorite: false
      }
    ]
  };
}

function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  if (!id || !name) return null;
  return { id, name };
}

function normalizeTerm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const title = String(raw.title || '').trim();
  if (!id || !title) return null;
  const att = Array.isArray(raw.attachments)
    ? raw.attachments.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    id,
    title,
    definition: String(raw.definition ?? ''),
    categoryId: String(raw.categoryId || UNCATEGORIZED_ID).trim() || UNCATEGORIZED_ID,
    favorite: !!raw.favorite,
    attachments: att
  };
}

function normalizeState(raw) {
  const base = getDefaultState();
  if (!raw || typeof raw !== 'object') return structuredClone(base);
  let categories = Array.isArray(raw.categories)
    ? raw.categories.map(normalizeCategory).filter(Boolean)
    : [];
  if (!categories.some((c) => c.id === UNCATEGORIZED_ID)) {
    categories.push({ id: UNCATEGORIZED_ID, name: 'Без категории' });
  }
  const catIds = new Set(categories.map((c) => c.id));
  let terms = Array.isArray(raw.terms) ? raw.terms.map(normalizeTerm).filter(Boolean) : [];
  terms = terms.map((t) => ({
    ...t,
    categoryId: catIds.has(t.categoryId) ? t.categoryId : UNCATEGORIZED_ID
  }));
  if (!categories.length) categories = base.categories;
  if (!Array.isArray(raw.terms)) {
    terms = structuredClone(base.terms).map((t) => normalizeTerm(t)).filter(Boolean);
  }
  return { categories, terms };
}

function loadState() {
  try {
    return normalizeState(loadAccountData(KEY, null));
  } catch (e) {
    console.warn('[glossary] load failed', e);
    return structuredClone(getDefaultState());
  }
}

function persist(state) {
  const ok = saveAccountData(KEY, state);
  if (!ok) {
    console.error('[glossary] save failed');
    toasts.error('Не удалось сохранить глоссарий.', { ttl: 8000 });
  }
  return ok;
}

function createGlossaryStore() {
  const initial = loadState();
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    addTerm(partial = {}) {
      const row = normalizeTerm({
        id: uuidv4(),
        title: partial.title || 'Новое понятие',
        definition: partial.definition ?? '',
        categoryId: partial.categoryId || UNCATEGORIZED_ID,
        favorite: !!partial.favorite,
        attachments: Array.isArray(partial.attachments)
          ? partial.attachments.map(String)
          : []
      });
      if (!row) return null;
      update((s) => {
        const next = { ...s, terms: [...s.terms, row] };
        persist(next);
        return next;
      });
      return row.id;
    },
    updateTerm(id, patch) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      update((s) => {
        const next = {
          ...s,
          terms: s.terms.map((t) => {
            if (t.id !== idStr) return t;
            const u = { ...t, ...patch };
            if (patch.title != null) u.title = String(patch.title).trim() || t.title;
            if (patch.definition != null) u.definition = String(patch.definition);
            if (patch.categoryId != null) u.categoryId = String(patch.categoryId).trim() || UNCATEGORIZED_ID;
            if (patch.favorite != null) u.favorite = !!patch.favorite;
            if (patch.attachments != null) {
              u.attachments = Array.isArray(patch.attachments)
                ? patch.attachments.map((x) => String(x).trim()).filter(Boolean)
                : [];
            }
            return normalizeTerm(u);
          })
        };
        persist(next);
        return next;
      });
    },
    deleteTerm(id) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      void removeScopeDir('glossary', idStr);
      update((s) => {
        const next = { ...s, terms: s.terms.filter((t) => t.id !== idStr) };
        persist(next);
        return next;
      });
    },
    deleteTerms(ids) {
      const drop = new Set((Array.isArray(ids) ? ids : []).map(String));
      if (!drop.size) return;
      for (const d of drop) {
        void removeScopeDir('glossary', d);
      }
      update((s) => {
        const next = { ...s, terms: s.terms.filter((t) => !drop.has(t.id)) };
        persist(next);
        return next;
      });
    },
    toggleFavorite(id) {
      const idStr = String(id || '').trim();
      if (!idStr) return;
      update((s) => {
        const next = {
          ...s,
          terms: s.terms.map((t) => (t.id === idStr ? { ...t, favorite: !t.favorite } : t))
        };
        persist(next);
        return next;
      });
    },
    addCategory(name) {
      const nm = String(name || '').trim();
      if (!nm) return null;
      const id = `cat_${uuidv4().slice(0, 10)}`;
      update((s) => {
        const next = { ...s, categories: [...s.categories, { id, name: nm }] };
        persist(next);
        return next;
      });
      return id;
    },
    updateCategory(id, name) {
      const idStr = String(id || '').trim();
      const nm = String(name || '').trim();
      if (!idStr || !nm) return;
      if (idStr === UNCATEGORIZED_ID) {
        toasts.error('Категорию «Без категории» переименовать нельзя.', { ttl: 4000 });
        return;
      }
      update((s) => {
        const next = {
          ...s,
          categories: s.categories.map((c) => (c.id === idStr ? { ...c, name: nm } : c))
        };
        persist(next);
        return next;
      });
    },
    deleteCategory(id) {
      const idStr = String(id || '').trim();
      if (!idStr || idStr === UNCATEGORIZED_ID) {
        toasts.error('Эту категорию удалить нельзя.', { ttl: 4000 });
        return;
      }
      update((s) => {
        const next = {
          categories: s.categories.filter((c) => c.id !== idStr),
          terms: s.terms.map((t) =>
            t.categoryId === idStr ? { ...t, categoryId: UNCATEGORIZED_ID } : t
          )
        };
        persist(next);
        return next;
      });
    },
    importState(raw) {
      const next = normalizeState(raw);
      set(next);
      persist(next);
    },
    rehydrate() {
      set(loadState());
    }
  };
}

export const glossary = createGlossaryStore();

activeJournalAccountId.subscribe(() => {
  glossary.rehydrate();
});
export { UNCATEGORIZED_ID, getDefaultState };
