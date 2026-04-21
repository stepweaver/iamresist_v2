export function intelItemPermalinkPath(id: string): string {
  const raw = typeof id === 'string' ? id.trim() : '';
  if (!raw) return '';
  return `/intel/item/${encodeURIComponent(raw)}`;
}

export type IntelShareCandidate = {
  id?: string | null;
  canonicalUrl?: string | null;
};

/**
 * Prefer internal permalinks for share URLs when possible.
 * Falls back to external canonical URL for legacy / incomplete items.
 */
export function preferredIntelShareUrl(candidate: IntelShareCandidate): string {
  const internal = candidate?.id ? intelItemPermalinkPath(candidate.id) : '';
  if (internal) return internal;
  const external = typeof candidate?.canonicalUrl === 'string' ? candidate.canonicalUrl.trim() : '';
  return external;
}

