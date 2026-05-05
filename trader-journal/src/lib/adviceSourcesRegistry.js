/**
 * База постов (полные оригиналы): Виктор @mmarket, Руфат @abilov_capital.
 * Генерация: node scripts/genAdviceChunks.mjs → adviceSourceChunksData.json
 */
import ADVICE_SOURCE_CHUNKS_JSON from './adviceSourceChunksData.json';

/**
 * @typedef {{ type: 'text'; value: string } | { type: 'link'; text: string; url: string }} AdviceChunkSegment
 * @typedef {{ authorKey: string; authorName: string; authorUrl: string; segments?: AdviceChunkSegment[]; text?: string }} AdviceChunk
 */

/** @type {Record<string, AdviceChunk>} */
export const ADVICE_SOURCE_CHUNKS = ADVICE_SOURCE_CHUNKS_JSON;

/**
 * @param {Partial<AdviceChunk> | null | undefined} chunk
 * @returns {AdviceChunkSegment[]}
 */
export function getChunkSegments(chunk) {
  if (chunk?.segments?.length) return chunk.segments;
  const t = String(chunk?.text || '').replace(/\r\n/g, '\n');
  if (!t) return [];
  return [{ type: 'text', value: t }];
}

/**
 * Плоская строка из сегментов (title, a11y, копирование)
 * @param {AdviceChunkSegment[]} segments
 */
export function chunkSegmentsToPlain(segments) {
  return segments
    .map((s) => (s.type === 'link' ? `${s.text} ${s.url}` : s.value))
    .join('');
}

/** @param {string} id */
export function getAdviceChunkById(id) {
  const k = String(id || '').trim();
  return ADVICE_SOURCE_CHUNKS[k] || null;
}

/**
 * @param {string[]} ids
 * @returns {{ id: string; chunk: NonNullable<ReturnType<typeof getAdviceChunkById>> }[]}
 */
export function resolveSourceIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id) continue;
    const chunk = getAdviceChunkById(id);
    if (chunk) out.push({ id, chunk });
  }
  return out;
}

/** В подсказке есть минимум два поста и они от разных авторов */
export function sourceIdsHaveMultipleAuthors(ids) {
  const rows = resolveSourceIds(ids);
  if (rows.length < 2) return false;
  const keys = new Set(rows.map((r) => r.chunk.authorKey).filter(Boolean));
  return keys.size >= 2;
}

/**
 * Плоский текст (a11y, тесты, fallback)
 * @param {string[]} ids
 */
export function getMergedSourceTooltipText(ids) {
  const rows = resolveSourceIds(ids);
  return rows
    .map(({ chunk }) => {
      const header = chunk.authorName ? `«${chunk.authorName}»\n\n` : '';
      return header + chunkSegmentsToPlain(getChunkSegments(chunk)).trim();
    })
    .join('\n\n────────\n\n');
}
