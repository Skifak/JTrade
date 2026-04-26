/**
 * Иерархическая таксономия ICT-сетапов.
 * Сделка тегается по 4 осям: narrative / structure / poi / execution.
 * Tag-key формат: 'group:item' (напр. 'poi:fvg', 'execution:ote-705').
 */
export const ICT_GROUPS = [
  {
    id: 'narrative',
    label: 'Narrative',
    hint: 'История дня / макро-нарратив',
    items: [
      { id: 'judas-swing',     label: 'Judas Swing' },
      { id: 'power-of-3',      label: 'Power of 3 (AMD)' },
      { id: 'turtle-soup',     label: 'Turtle Soup' },
      { id: 'smt-divergence',  label: 'SMT divergence' },
      { id: 'sweep-reverse',   label: 'Sweep & Reverse' }
    ]
  },
  {
    id: 'structure',
    label: 'Structure',
    hint: 'Состояние рыночной структуры',
    items: [
      { id: 'mss-bull',     label: 'MSS bullish' },
      { id: 'mss-bear',     label: 'MSS bearish' },
      { id: 'choch',        label: 'CHoCH' },
      { id: 'liq-sweep',    label: 'Liquidity sweep' },
      { id: 'bsl-grab',     label: 'BSL grab' },
      { id: 'ssl-grab',     label: 'SSL grab' }
    ]
  },
  {
    id: 'poi',
    label: 'POI',
    hint: 'Точка интереса (Point of Interest)',
    items: [
      { id: 'fvg',          label: 'FVG' },
      { id: 'ifvg',         label: 'iFVG' },
      { id: 'ob-bull',      label: 'OB bullish' },
      { id: 'ob-bear',      label: 'OB bearish' },
      { id: 'breaker',      label: 'Breaker' },
      { id: 'mitigation',   label: 'Mitigation' },
      { id: 'rejection',    label: 'Rejection block' }
    ]
  },
  {
    id: 'execution',
    label: 'Execution',
    hint: 'Точка входа / премиум-дискаунт',
    items: [
      { id: 'ote-62',       label: 'OTE 62%' },
      { id: 'ote-705',      label: 'OTE 70.5%' },
      { id: 'ote-79',       label: 'OTE 79%' },
      { id: 'equilibrium',  label: 'Equilibrium' },
      { id: 'premium',      label: 'Premium PD-array' },
      { id: 'discount',     label: 'Discount PD-array' }
    ]
  }
];

export const ALL_ICT_TAGS = ICT_GROUPS.flatMap((g) =>
  g.items.map((it) => ({
    key: `${g.id}:${it.id}`,
    group: g.id,
    groupLabel: g.label,
    label: it.label,
    fullLabel: `${g.label} · ${it.label}`
  }))
);

export function findIctTag(key) {
  return ALL_ICT_TAGS.find((t) => t.key === key) || null;
}

export function isIctTag(key) {
  return typeof key === 'string' && key.includes(':') && !!findIctTag(key);
}

/** Красивая подпись тега. Если не из таксономии — возвращает сам key. */
export function prettyTag(key) {
  const t = findIctTag(key);
  return t ? t.fullLabel : key;
}
