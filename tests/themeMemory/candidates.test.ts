import { describe, expect, it } from 'vitest';

import { isDeterministicThemeMatch, isPlausibleThemeCandidate, scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';
import type { ThemeRecord } from '@/lib/themeMemory/themeTypes';

function theme(label: string, title: string): ThemeRecord {
  const now = '2026-09-10T12:00:00.000Z';
  return {
    id: `theme-${label}`,
    slug: label,
    canonical_label: label,
    display_headline: title,
    summary: title,
    first_seen_at: now,
    last_seen_at: now,
    lifecycle_status: 'new',
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

function match(itemTitle: string, themeTitle: string, label = 't') {
  return scoreThemeCandidate({
    item: extractThemeFingerprint({ title: itemTitle, summary: itemTitle }),
    theme: extractThemeFingerprint({ title: themeTitle, summary: themeTitle }),
    themeRecord: theme(label, themeTitle),
    itemObservedAt: '2026-09-11T12:00:00.000Z',
  });
}

describe('Theme Memory deterministic candidates', () => {
  it('treats federal deployment coverage as a plausible and often deterministic match', () => {
    const scored = match(
      'Legal limits on federal deployment authority',
      'Federal troops deployment authority explained',
    );
    expect(scored.weakEntityOnly).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(true);
    expect(scored.sharedDistinctive.length).toBeGreaterThanOrEqual(2);
    expect(isDeterministicThemeMatch(scored)).toBe(true);
  });

  it('does not merge the same politician on unrelated issues', () => {
    const scored = match(
      'Trump immigration raid in Chicago',
      'Trump tariff plan announced',
      'tariff',
    );
    expect(scored.weakEntityOnly).toBe(true);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
    expect(isDeterministicThemeMatch(scored)).toBe(false);
  });

  it('keeps tariff wording changes in the candidate set', () => {
    const scored = match(
      'Appeals court hears tariff authority case',
      'Trump tariff plan challenged',
    );
    expect(scored.weakEntityOnly).toBe(false);
    expect(scored.distinctiveAnchor).toBe(true);
    expect(isPlausibleThemeCandidate(scored)).toBe(true);
    expect(scored.sharedDistinctive).toContain('tariff');
  });

  it('A: Supreme Court overlap alone is not a strong deterministic match', () => {
    const scored = match(
      'Supreme Court hears absentee ballot dispute',
      'Supreme Court hears unrelated vaccine case',
    );
    expect(scored.distinctiveAnchor).toBe(false);
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });

  it('B: person/title overlap is insufficient for unrelated actions', () => {
    const scored = match(
      'President announces tariff policy',
      'President announces immigration enforcement action',
    );
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });

  it('C: country overlap is insufficient', () => {
    const scored = match(
      'United States updates Canada trade rule',
      'United States files unrelated environmental notice',
    );
    expect(scored.weakEntityOnly).toBe(true);
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });

  it('D: institution/party overlap is insufficient', () => {
    const scored = match(
      'Senate considers opioid legislation',
      'Senate campaign debate controversy',
    );
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });

  it('E: the same distinctive legal subject remains a plausible/strong candidate', () => {
    const scored = match(
      'Appeals court hears tariff authority case',
      'Emergency review of the tariff authority ruling',
    );
    expect(scored.distinctiveAnchor).toBe(true);
    expect(isPlausibleThemeCandidate(scored)).toBe(true);
    expect(scored.sharedDistinctive).toContain('tariff');
    expect(isDeterministicThemeMatch(scored)).toBe(true);
  });

  it('allows a shared weak institution when a distinctive object also aligns', () => {
    const scored = match(
      'Supreme Court absentee ballot order dispute',
      'Absentee ballot restrictions reach the Supreme Court',
    );
    expect(scored.distinctiveAnchor).toBe(true);
    expect(scored.sharedDistinctive).toContain('ballot');
    expect(isPlausibleThemeCandidate(scored)).toBe(true);
  });

  it('does not treat generated coverage boilerplate as a distinctive subject', () => {
    const scored = match(
      'Coverage of bankrupted kennedy center continues',
      'Coverage of republican senate candidate cheat continues',
    );
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });
});
