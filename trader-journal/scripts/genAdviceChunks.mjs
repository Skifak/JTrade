/**
 * Читает otchet/MM_Victor.txt и otchet/Rufat.txt.txt, пишет src/lib/adviceSourceChunksData.json
 * Разделитель постов: строка ***
 * Конструкции «слово (https://…)» превращаются в сегменты: текст + кликабельное слово (URL не дублируется в потоке).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function splitPosts(text) {
  return text
    .split(/\r?\n\*\*\*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {{ type: 'text', value: string } | { type: 'link', text: string, url: string }[]}
 */
function textToSegments(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  /** @type {{ type: 'text', value: string } | { type: 'link', text: string, url: string }[]} */
  const segments = [];
  const re = /(\S+)\s*\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(normalized)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: normalized.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'link', text: m[1], url: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < normalized.length) {
    segments.push({ type: 'text', value: normalized.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', value: normalized });
  }
  return segments;
}

const victorPosts = splitPosts(fs.readFileSync(path.join(root, 'otchet/MM_Victor.txt'), 'utf8'));
const rufatPosts = splitPosts(fs.readFileSync(path.join(root, 'otchet/Rufat.txt.txt'), 'utf8'));

const out = {};

victorPosts.forEach((text, i) => {
  const id = `mm-vic-${String(i + 1).padStart(2, '0')}`;
  out[id] = {
    authorKey: 'victor',
    authorName: 'Виктор — |MONEY & MARKET|',
    authorUrl: 'https://t.me/mmarket',
    segments: textToSegments(text)
  };
});

rufatPosts.forEach((text, i) => {
  const id = `abu-ruf-${String(i + 1).padStart(2, '0')}`;
  out[id] = {
    authorKey: 'rufat',
    authorName: 'Руфат — ABILOV CAPITAL',
    authorUrl: 'https://t.me/abilov_capital',
    segments: textToSegments(text)
  };
});

const target = path.join(root, 'src/lib/adviceSourceChunksData.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', Object.keys(out).length, 'chunks →', path.relative(root, target));
