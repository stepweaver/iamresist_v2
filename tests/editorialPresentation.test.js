import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitVisibleDeskStack } from '@/components/intel/deskPresentation';
import {
  composeJournalLanding,
  listJournalArchive,
  selectRelatedJournalEssays,
} from '@/components/journal/journalFormat';
import {
  selectFeaturedShelfBook,
  takeDistinctCreatorVideos,
  takeLeadingBriefingStories,
} from '@/components/home/homepagePresentation';
import { journalSubscriptionUrl } from '@/lib/journalSubscribe';
import {
  appendArchiveItems,
  TELESCREEN_ARCHIVE_BATCH,
  TELESCREEN_MODE_CHOICES,
  TELESCREEN_MODES,
} from '@/lib/telescreen';
import {
  filterNewswireStories,
  NEWSWIRE_HEADLINE_BATCH,
  visibleNewswireStories,
} from '@/components/newswire/newswirePresentation';

function essay(id, date, tags = []) {
  return { id, slug: id, title: id, date, tags };
}

describe('editorial presentation', () => {
  it('limits the journal landing to one feature and two recent essays', () => {
    const landing = composeJournalLanding([
      essay('a', '2026-01-01'),
      essay('b', '2026-02-01'),
      essay('c', '2026-03-01'),
      essay('d', '2026-04-01'),
      essay('e', '2026-05-01'),
    ]);

    expect(landing.featured.slug).toBe('e');
    expect(landing.recent.map((entry) => entry.slug)).toEqual(['d', 'c']);
    expect(landing.ordered).toHaveLength(5);
  });

  it('hides featured and recent essays until the reader searches or filters', () => {
    const records = [
      { id: 'feature', title: 'Feature', tags: ['Courts'] },
      { id: 'recent', title: 'Recent', tags: ['Courts'] },
      { id: 'older', title: 'Older courts essay', tags: ['Courts'] },
    ];

    expect(listJournalArchive(records, { pinnedIds: ['feature', 'recent'] }).listed.map((record) => record.id)).toEqual([
      'older',
    ]);
    expect(
      listJournalArchive(records, { query: 'feature', pinnedIds: ['feature', 'recent'] }).listed.map(
        (record) => record.id,
      ),
    ).toEqual(['feature']);
    expect(
      listJournalArchive(records, { tag: 'Courts', pinnedIds: ['feature', 'recent'] }).listed.map(
        (record) => record.id,
      ),
    ).toEqual(['feature', 'recent', 'older']);
  });

  it('recommends tagged essays without the current essay or duplicates', () => {
    const current = essay('current', '2026-06-01', ['Courts', 'Democracy']);
    const related = selectRelatedJournalEssays(
      [
        current,
        { ...essay('same-id', '2026-07-01', ['Courts']), id: 'current' },
        { ...essay('same-slug', '2026-07-02', ['Courts']), slug: 'current' },
        essay('both', '2026-01-01', ['Courts', 'Democracy']),
        essay('newer-court', '2026-05-01', ['Courts']),
        essay('older-court', '2026-02-01', ['Courts']),
        essay('sports', '2026-08-01', ['Sports']),
      ],
      current,
    );

    expect(related.map((entry) => entry.slug)).toEqual(['both', 'newer-court']);
  });

  it('omits journal recommendations and the subscribe link when there is nothing to show', () => {
    expect(selectRelatedJournalEssays([essay('only', '2026-01-01', ['Courts'])], essay('only', '2026-01-01'))).toEqual(
      [],
    );
    expect(selectRelatedJournalEssays([essay('other', '2026-01-01')], essay('only', '2026-01-01', ['Courts']))).toEqual(
      [],
    );
    expect(journalSubscriptionUrl({ NEXT_PUBLIC_JOURNAL_SUBSCRIBE_URL: '' })).toBe('');
    expect(journalSubscriptionUrl({ NEXT_PUBLIC_JOURNAL_SUBSCRIBE_URL: 'http://example.com' })).toBe('');
    expect(journalSubscriptionUrl({ NEXT_PUBLIC_JOURNAL_SUBSCRIBE_URL: 'https://example.com/journal' })).toBe(
      'https://example.com/journal',
    );
  });

  it('returns empty homepage selections instead of placeholder items', () => {
    expect(takeLeadingBriefingStories([])).toEqual([]);
    expect(takeLeadingBriefingStories(null)).toEqual([]);
    expect(takeDistinctCreatorVideos([])).toEqual([]);
    expect(selectFeaturedShelfBook(undefined)).toBeNull();
  });

  it('switches telescreen modes explicitly and pages the archive without duplicates', () => {
    expect(TELESCREEN_ARCHIVE_BATCH).toBe(9);
    expect(TELESCREEN_MODE_CHOICES.map((choice) => choice.label)).toEqual(['Voices', 'Curated', 'Music']);
    expect(TELESCREEN_MODE_CHOICES.map((choice) => choice.value)).toEqual([
      TELESCREEN_MODES.voices,
      TELESCREEN_MODES.curated,
      TELESCREEN_MODES.music,
    ]);

    const first = [{ id: 'a' }, { id: 'b' }];
    const next = [{ id: 'b' }, { id: 'c' }, { url: 'https://example.com/d' }];
    expect(appendArchiveItems(first, next).map((item) => item.id || item.url)).toEqual([
      'a',
      'b',
      'c',
      'https://example.com/d',
    ]);

    const client = readFileSync(
      path.join(process.cwd(), 'app/(site)/telescreen/VoicesArchiveClient.jsx'),
      'utf8',
    );
    expect(client).toContain('Show More');
    expect(client).toContain('TELESCREEN_MODE_CHOICES');
    expect(client).not.toContain('IntersectionObserver');
    expect(client).not.toContain('autoplay');
  });

  it('filters the full newswire collection before limiting what is visible', () => {
    const stories = Array.from({ length: 20 }, (_, index) => ({
      id: `story-${index + 1}`,
      sourceSlug: index === 14 ? 'late-source' : 'wire',
      source: index === 14 ? 'Late Source' : 'Wire',
    }));

    const filtered = filterNewswireStories(stories, 'late-source');
    expect(filtered.map((story) => story.id)).toEqual(['story-15']);
    expect(visibleNewswireStories(stories, NEWSWIRE_HEADLINE_BATCH).visible).toHaveLength(12);
    expect(visibleNewswireStories(stories, NEWSWIRE_HEADLINE_BATCH).hasMore).toBe(true);
    expect(visibleNewswireStories(filtered, NEWSWIRE_HEADLINE_BATCH).visible).toEqual(filtered);
    expect(visibleNewswireStories(stories, 24).hasMore).toBe(false);
  });

  it('keeps the strongest desk records visible and holds the rest', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ id: index + 1 }));
    const split = splitVisibleDeskStack(entries);

    expect(split.visible.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(split.more.map((entry) => entry.id)).toEqual([7, 8]);
    expect(splitVisibleDeskStack(entries.slice(0, 2)).more).toEqual([]);
  });
});
