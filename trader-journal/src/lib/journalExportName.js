/** Имя файла: journal-{slug}-{yyyy-mm-dd}-{shortId}.ext */
export function buildJournalExportBasename(accountName, accountId) {
  const raw = String(accountName || '').trim();
  let slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'account';
  slug = slug.slice(0, 40);
  const id = String(accountId || '')
    .replace(/^acc-/, '')
    .replace(/-/g, '');
  const shortId = (id.slice(0, 8) || 'account').toLowerCase();
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `journal-${slug}-${ymd}-${shortId}`;
}
