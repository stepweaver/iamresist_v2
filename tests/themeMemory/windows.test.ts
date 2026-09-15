import { describe, expect, it } from 'vitest';

import type { ThemeCandidateItem } from '@/lib/themeMemory/types';
import { filterCandidatesByWindow } from '@/lib/themeMemory/query';
import { resolveThemeMemoryWindow, windowForDays } from '@/lib/themeMemory/windows';

const NOW = '2026-09-15T16:00:00.000Z';

function candidate(id: string, publishedAt: string): ThemeCandidateItem {
  return {
    id,
    sourceSystem: 'voice',
    sourceSlug: 'david-pakman',
    sourceName: 'David Pakman',
    title: id,
    summary: null,
    canonicalUrl: `https://example.test/${id}`,
    externalId: id,
    publishedAt,
    fetchedAt: NOW,
    role: 'creator',
    contentHash: 'hash',
    identityKey: `url:https://example.test/${id}`,
    metadata: {},
  };
}

describe('Theme Memory time windows', () => {
  it('uses rolling UTC hour math rather than string comparison', () => {
    const window = windowForDays(7, NOW);
    expect(window.end.toISOString()).toBe(NOW);
    expect(window.start.toISOString()).toBe('2026-09-08T16:00:00.000Z');
    expect(window.days).toBe(7);
  });

  it('supports explicit start/end and the 1/3/7/14/30 day conveniences', () => {
    expect(windowForDays(1, NOW).start.toISOString()).toBe('2026-09-14T16:00:00.000Z');
    expect(windowForDays(3, NOW).start.toISOString()).toBe('2026-09-12T16:00:00.000Z');
    expect(windowForDays(14, NOW).start.toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(windowForDays(30, NOW).start.toISOString()).toBe('2026-08-16T16:00:00.000Z');

    const custom = resolveThemeMemoryWindow({
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-08T00:00:00.000Z',
    });
    expect(custom.days).toBeNull();
    expect(custom.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('excludes observations older than 7 days from a 7-day query', () => {
    const window = windowForDays(7, NOW);
    const items = [
      candidate('inside', '2026-09-10T16:00:00.000Z'),
      candidate('edge', '2026-09-08T16:00:00.000Z'),
      candidate('too-old', '2026-09-08T15:59:59.000Z'),
    ];
    const out = filterCandidatesByWindow(items, window.start, window.end);
    expect(out.map((item) => item.id)).toEqual(['inside', 'edge']);
  });

  it('includes older-but-still-recent observations in a 30-day query', () => {
    const seven = windowForDays(7, NOW);
    const thirty = windowForDays(30, NOW);
    const older = candidate('day-20', '2026-08-26T16:00:00.000Z');
    const recent = candidate('day-2', '2026-09-13T16:00:00.000Z');
    const ancient = candidate('day-40', '2026-08-01T16:00:00.000Z');

    expect(filterCandidatesByWindow([older, recent, ancient], seven.start, seven.end).map((i) => i.id)).toEqual([
      'day-2',
    ]);
    expect(
      filterCandidatesByWindow([older, recent, ancient], thirty.start, thirty.end).map((i) => i.id),
    ).toEqual(['day-20', 'day-2']);
  });
});
