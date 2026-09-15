import { describe, expect, it } from 'vitest';

import {
  dedupeThemeCandidates,
  hashThemeCandidatePayload,
  normalizeIntelThemeCandidate,
  normalizeNewswireThemeCandidate,
  normalizeVoiceThemeCandidate,
  roleForIntelItem,
  roleForNewswireItem,
  roleForVoiceItem,
  themeObservationIdentityKey,
} from '@/lib/themeMemory/normalize';

const FETCHED = '2026-09-15T16:00:00.000Z';

function voiceItem(over: Record<string, unknown> = {}) {
  return {
    id: 'ep-1',
    sourceId: 'guid-1',
    title: 'Court filing on surveillance',
    url: 'https://example.test/pakman/ep-1',
    publishedAt: '2026-09-14T12:00:00.000Z',
    description: 'Pakman discusses the filing.',
    voice: {
      id: 'voice-pakman',
      title: 'David Pakman',
      slug: 'david-pakman',
      homeUrl: 'https://pakman.test',
      platform: 'YouTube',
    },
    ...over,
  };
}

describe('Theme Memory role mapping', () => {
  it('maps Voice items to creator', () => {
    expect(roleForVoiceItem()).toBe('creator');
    const item = normalizeVoiceThemeCandidate(voiceItem(), FETCHED);
    expect(item?.role).toBe('creator');
    expect(item?.sourceSystem).toBe('voice');
  });

  it('maps Newswire RSS to reporting and curated Newswire to context', () => {
    expect(roleForNewswireItem({ isCurated: false })).toBe('reporting');
    expect(roleForNewswireItem({ isCurated: true })).toBe('context');

    const rss = normalizeNewswireThemeCandidate(
      {
        id: 'nw-1',
        source: 'The Intercept',
        sourceSlug: 'the-intercept',
        title: 'Surveillance bill advances',
        url: 'https://theintercept.test/story',
        excerpt: 'House panel moves a surveillance bill.',
        publishedAt: '2026-09-14T10:00:00.000Z',
        isCurated: false,
      },
      FETCHED,
    );
    const curated = normalizeNewswireThemeCandidate(
      {
        id: 'curated-1',
        source: 'Curated',
        sourceSlug: 'curated',
        title: 'Editor pick',
        url: 'https://curated.test/story',
        excerpt: 'Note',
        publishedAt: '2026-09-14T10:00:00.000Z',
        isCurated: true,
      },
      FETCHED,
    );

    expect(rss?.role).toBe('reporting');
    expect(curated?.role).toBe('context');
  });

  it('maps primary Intel to primary and specialist Intel to specialist', () => {
    expect(
      roleForIntelItem({
        desk_lane: 'osint',
        sources: { desk_lane: 'osint', provenance_class: 'PRIMARY' },
      }),
    ).toBe('primary');
    expect(
      roleForIntelItem({
        desk_lane: 'watchdogs',
        sources: { desk_lane: 'watchdogs', provenance_class: 'SPECIALIST' },
      }),
    ).toBe('specialist');

    const primary = normalizeIntelThemeCandidate({
      id: 'intel-1',
      canonical_url: 'https://federalregister.gov/d/2026-1',
      title: 'Executive order',
      published_at: '2026-09-14T09:00:00.000Z',
      fetched_at: FETCHED,
      content_hash: 'abc',
      desk_lane: 'osint',
      sources: {
        slug: 'federal-register',
        name: 'Federal Register',
        provenance_class: 'PRIMARY',
        desk_lane: 'osint',
        source_family: 'general',
      },
    });
    const specialist = normalizeIntelThemeCandidate({
      id: 'intel-2',
      canonical_url: 'https://lawfare.test/analysis',
      title: 'Legal analysis',
      published_at: '2026-09-14T09:00:00.000Z',
      fetched_at: FETCHED,
      content_hash: 'def',
      desk_lane: 'watchdogs',
      sources: {
        slug: 'lawfare',
        name: 'Lawfare',
        provenance_class: 'SPECIALIST',
        desk_lane: 'watchdogs',
        source_family: 'watchdog_global',
      },
    });

    expect(primary?.role).toBe('primary');
    expect(specialist?.role).toBe('specialist');
  });
});

describe('Theme Memory identity and canonical URLs', () => {
  it('collapses tracking-query duplicates to one identity', () => {
    const clean = themeObservationIdentityKey({
      canonicalUrl: 'https://theintercept.test/story',
    });
    const tracked = themeObservationIdentityKey({
      canonicalUrl: 'https://theintercept.test/story?utm_source=twitter&fbclid=abc',
    });
    expect(clean).toBe(tracked);
    expect(clean.startsWith('url:')).toBe(true);
  });

  it('collapses YouTube URL variants for the same video', () => {
    const watch = themeObservationIdentityKey({
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
    });
    const short = themeObservationIdentityKey({
      canonicalUrl: 'https://youtu.be/dQw4w9wgGcQ',
      externalId: 'yt:video:dQw4w9wgGcQ',
    });
    expect(watch).toBe('yt:dQw4w9wgGcQ');
    expect(short).toBe(watch);
  });

  it('keeps separate creators as separate observations even with related titles', () => {
    const pakman = normalizeVoiceThemeCandidate(
      voiceItem({
        url: 'https://youtube.com/watch?v=aaaaaaaaaaa',
        title: 'The surveillance fight',
        voice: { id: 'p', title: 'David Pakman', slug: 'david-pakman' },
      }),
      FETCHED,
    );
    const meidas = normalizeVoiceThemeCandidate(
      voiceItem({
        id: 'ep-m',
        url: 'https://youtube.com/watch?v=bbbbbbbbbbb',
        title: 'The surveillance fight continues',
        voice: { id: 'm', title: 'MeidasTouch', slug: 'meidastouch' },
      }),
      FETCHED,
    );

    expect(pakman?.id).not.toBe(meidas?.id);
    expect(pakman?.sourceSlug).toBe('david-pakman');
    expect(meidas?.sourceSlug).toBe('meidastouch');
    expect(pakman?.canonicalUrl).toContain('aaaaaaaaaaa');
    expect(meidas?.canonicalUrl).toContain('bbbbbbbbbbb');
  });

  it('preserves the original creator episode URL for later linking', () => {
    const item = normalizeVoiceThemeCandidate(
      voiceItem({ url: 'https://www.youtube.com/watch?v=abcdefghijk&t=12s' }),
      FETCHED,
    );
    expect(item?.canonicalUrl).toBe('https://www.youtube.com/watch?v=abcdefghijk&t=12s');
    expect(item?.identityKey).toBe('yt:abcdefghijk');
  });

  it('dedupes same-creator syndicated duplicates but keeps distinct episodes', () => {
    const a = normalizeVoiceThemeCandidate(
      voiceItem({
        id: 'a',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'Episode A',
      }),
      FETCHED,
    );
    const aMirror = normalizeVoiceThemeCandidate(
      voiceItem({
        id: 'a-mirror',
        url: 'https://youtu.be/abcdefghijk',
        title: 'Episode A (podcast feed)',
      }),
      FETCHED,
    );
    const b = normalizeVoiceThemeCandidate(
      voiceItem({
        id: 'b',
        url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz',
        title: 'Episode B',
      }),
      FETCHED,
    );

    const deduped = dedupeThemeCandidates([a!, aMirror!, b!]);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((item) => item.identityKey).sort()).toEqual([
      'yt:abcdefghijk',
      'yt:zzzzzzzzzzz',
    ]);
  });
});

describe('Theme Memory content hashing', () => {
  it('is stable for unchanged content and changes when the title is revised', () => {
    const first = hashThemeCandidatePayload({
      canonicalUrl: 'https://example.test/story',
      title: 'Original',
      summary: 'Summary',
      publishedAt: '2026-09-14T12:00:00.000Z',
      externalId: 'guid-1',
    });
    const again = hashThemeCandidatePayload({
      canonicalUrl: 'https://example.test/story',
      title: 'Original',
      summary: 'Summary',
      publishedAt: '2026-09-14T12:00:00.000Z',
      externalId: 'guid-1',
    });
    const revised = hashThemeCandidatePayload({
      canonicalUrl: 'https://example.test/story',
      title: 'Updated headline',
      summary: 'Summary',
      publishedAt: '2026-09-14T12:00:00.000Z',
      externalId: 'guid-1',
    });

    expect(first).toBe(again);
    expect(revised).not.toBe(first);
  });
});
