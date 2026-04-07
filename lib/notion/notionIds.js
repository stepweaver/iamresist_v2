/** Normalize Notion database/page UUID for API calls (with dashes). */
export function normalizeNotionDatabaseId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.replace(/-/g, '');
  if (clean.length !== 32) return null;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}
