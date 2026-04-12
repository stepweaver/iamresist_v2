import { createHash } from 'node:crypto';

import type { NormalizedItem } from '@/lib/intel/types';

export function hashNormalizedPayload(parts: {
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  externalId: string | null;
  stateChangeType: string;
}): string {
  const payload = JSON.stringify(parts);
  return createHash('sha256').update(payload).digest('hex');
}

export function hashNormalizedItem(item: Omit<NormalizedItem, 'contentHash'>): string {
  return hashNormalizedPayload({
    canonicalUrl: item.canonicalUrl,
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt,
    externalId: item.externalId,
    stateChangeType: item.stateChangeType,
  });
}
