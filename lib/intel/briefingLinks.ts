import { intelItemPermalinkPath, preferredIntelShareUrl } from '@/lib/intel/permalinks';

export type IntelBriefingLinkCandidate = {
  id?: string | null;
  canonicalUrl?: string | null;
};

export function buildIntelBriefingLinks(row: IntelBriefingLinkCandidate) {
  const sourceUrl = typeof row?.canonicalUrl === 'string' ? row.canonicalUrl.trim() : '';
  const internalUrl = row?.id ? intelItemPermalinkPath(row.id) : '';
  const shareUrl = preferredIntelShareUrl(row);
  return { sourceUrl, internalUrl, shareUrl };
}

