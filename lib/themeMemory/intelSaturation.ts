/**
 * Inspectable Intel adapter saturation. Does not raise the candidate cap.
 * Theme Memory still processes a bounded newest-first window.
 */

import { THEME_MEMORY_INTEL_CANDIDATE_LIMIT } from '@/lib/themeMemory/types';
import { timestampMs, toUtcIso } from '@/lib/themeMemory/windows';

export type ThemeIntelCandidateSaturation = {
  windowStart: string;
  windowEnd: string;
  availableInWindow: number;
  selectedForProcessing: number;
  fetchedRaw: number;
  candidateLimit: number;
  candidateLimitHit: boolean;
  newestSelectedAt: string | null;
  oldestSelectedAt: string | null;
  selectedIdentityKeys: string[];
};

export type ThemeIntelSaturationInputItem = {
  identityKey?: string | null;
  sourceSlug?: string | null;
  sourceSystem?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string | null;
};

function itemTimestamp(item: ThemeIntelSaturationInputItem): number | null {
  return timestampMs(item.publishedAt) ?? timestampMs(item.fetchedAt);
}

export function measureIntelCandidateSaturation(input: {
  availableInWindow: number;
  selected: ThemeIntelSaturationInputItem[];
  fetchedRaw?: number;
  candidateLimit?: number;
  windowStart: Date | string;
  windowEnd: Date | string;
}): ThemeIntelCandidateSaturation {
  const candidateLimit = Math.max(
    1,
    Number(input.candidateLimit) || THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
  );
  const selected = Array.isArray(input.selected) ? input.selected : [];
  const fetchedRaw = Number.isFinite(Number(input.fetchedRaw))
    ? Math.max(0, Number(input.fetchedRaw))
    : selected.length;
  const timestamps = selected
    .map((item) => itemTimestamp(item))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  const selectedIdentityKeys = [
    ...new Set(
      selected
        .map((item) => {
          const identityKey = String(item.identityKey || '').trim();
          if (!identityKey) return '';
          const sourceSystem = String(item.sourceSystem || 'intel').trim() || 'intel';
          const sourceSlug = String(item.sourceSlug || '').trim().toLowerCase() || 'unknown';
          return `${sourceSystem}:${sourceSlug}:${identityKey}`;
        })
        .filter(Boolean),
    ),
  ].sort();

  return {
    windowStart: toUtcIso(input.windowStart) || String(input.windowStart),
    windowEnd: toUtcIso(input.windowEnd) || String(input.windowEnd),
    availableInWindow: Math.max(0, Number(input.availableInWindow) || 0),
    selectedForProcessing: selected.length,
    fetchedRaw,
    candidateLimit,
    candidateLimitHit: fetchedRaw >= candidateLimit || selected.length >= candidateLimit,
    newestSelectedAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]!).toISOString() : null,
    oldestSelectedAt: timestamps.length ? new Date(timestamps[0]!).toISOString() : null,
    selectedIdentityKeys,
  };
}

export function emptyIntelCandidateSaturation(input: {
  windowStart?: Date | string | null;
  windowEnd?: Date | string | null;
  candidateLimit?: number;
} = {}): ThemeIntelCandidateSaturation {
  return {
    windowStart: input.windowStart ? toUtcIso(input.windowStart) || String(input.windowStart) : '',
    windowEnd: input.windowEnd ? toUtcIso(input.windowEnd) || String(input.windowEnd) : '',
    availableInWindow: 0,
    selectedForProcessing: 0,
    fetchedRaw: 0,
    candidateLimit: input.candidateLimit || THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
    candidateLimitHit: false,
    newestSelectedAt: null,
    oldestSelectedAt: null,
    selectedIdentityKeys: [],
  };
}

export function isInsideProcessWindow(
  timestamp: Date | string | number | null | undefined,
  windowStart: Date | string | null | undefined,
  windowEnd: Date | string | null | undefined,
): boolean {
  const t = timestampMs(timestamp);
  const start = timestampMs(windowStart);
  const end = timestampMs(windowEnd);
  if (t == null || start == null || end == null) return false;
  return t >= start && t <= end;
}

export function excludedByIntelCandidateCap(input: {
  insideProcessWindow: boolean;
  presentInSelectedSet: boolean;
  candidateLimitHit: boolean;
  itemTimestamp?: Date | string | number | null;
  oldestSelectedAt?: Date | string | null;
}): boolean | null {
  if (!input.insideProcessWindow) return false;
  if (input.presentInSelectedSet) return false;
  if (!input.candidateLimitHit) return false;
  const itemMs = timestampMs(input.itemTimestamp);
  const oldestMs = timestampMs(input.oldestSelectedAt);
  if (itemMs == null || oldestMs == null) return null;
  return itemMs < oldestMs;
}
