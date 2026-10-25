/** Public journal subscription link. Rendered only when a URL is configured. */
export function journalSubscriptionUrl(env = process.env) {
  const raw = String(env?.NEXT_PUBLIC_JOURNAL_SUBSCRIBE_URL || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}
