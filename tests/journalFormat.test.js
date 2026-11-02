import { describe, expect, it, vi } from 'vitest';
import {
  compareJournalEntries,
  filterJournalRecords,
  filterJournalRecordsByTag,
  journalDates,
  journalDisplayExcerpt,
  journalEntryPath,
  journalLeadExcerpt,
  journalImageFit,
  journalListingImage,
  journalReadingLabel,
  journalReadingMinutes,
  journalSubjectTags,
  journalTagsMatch,
  composeJournalLanding,
  readJournalTagParam,
  resolveListingImage,
  selectFeaturedJournalEntry,
  selectHomepageEssays,
  homepageEssayLabel,
  toggleJournalTag,
  toJournalRecord,
} from '@/components/journal/journalFormat';

describe('journalDates', () => {
  it('formats the publication date and hides a same-day edit', () => {
    const dates = journalDates({
      date: '2026-10-10',
      createdTime: '2026-10-10T02:19:00.000Z',
      lastEditedTime: '2026-10-10T03:10:00.000Z',
    });

    expect(dates.displayLabel).toBe('10-OCT-2026');
    expect(dates.dateTime).toBe('2026-10-10');
    expect(dates.showUpdated).toBe(false);
  });

  it('does not treat a Notion page open as an update', () => {
    const dates = journalDates({
      date: '2026-01-05',
      lastEditedTime: '2026-10-12T15:00:00.000Z',
    });

    expect(dates.showUpdated).toBe(false);
    expect(dates.updatedLabel).toBe('');
  });

  it('shows an update only when the body was edited on a later calendar day', () => {
    const dates = journalDates({
      date: '2026-01-05',
      lastEditedTime: '2026-10-12T15:00:00.000Z',
      bodyEditedTime: '2026-10-08T12:00:00.000Z',
    });

    expect(dates.showUpdated).toBe(true);
    expect(dates.updatedLabel).toBe('08-OCT-2026');
  });
});

describe('compareJournalEntries', () => {
  it('ranks the newest publication first, even if an older page was opened later', () => {
    const opened = {
      title: 'America is Dead',
      date: '2026-01-05',
      lastEditedTime: '2026-10-12T15:00:00.000Z',
    };
    const newest = {
      title: 'Justice in the Open',
      date: '2026-10-12',
    };

    expect([opened, newest].sort(compareJournalEntries).map((entry) => entry.title)).toEqual([
      'Justice in the Open',
      'America is Dead',
    ]);
  });
});

describe('journalLeadExcerpt', () => {
  it('uses the first substantial paragraph and trims on a word boundary', () => {
    const excerpt = journalLeadExcerpt(
      [
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Short.' }] } },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                plain_text:
                  'I listen to the record carefully because the claim is large enough to need a source, a date, and a number that can be checked in public.',
              },
            ],
          },
        },
      ],
      80,
    );

    expect(excerpt.startsWith('I listen to the record')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(81);
  });
});

describe('filterJournalRecords', () => {
  const records = [
    toJournalRecord({
      id: 'a',
      slug: 'proof',
      title: 'Show Me the Proof',
      date: '2026-10-10',
      tags: ['Economy'],
    }),
    toJournalRecord({
      id: 'b',
      slug: 'yankee',
      title: 'Yankee Samurai',
      date: '2026-09-01',
    }),
  ];

  it('matches title, date, and tags without dropping other records for an empty query', () => {
    expect(filterJournalRecords(records, '   ')).toHaveLength(2);
    expect(filterJournalRecords(records, 'proof')).toHaveLength(1);
    expect(filterJournalRecords(records, 'economy')[0].href).toBe('/journal/proof');
    expect(filterJournalRecords(records, '2026-09')).toHaveLength(1);
    expect(filterJournalRecords(records, 'sports')).toHaveLength(0);
  });
});

describe('journal editorial selection', () => {
  const entries = [
    {
      id: 'old',
      slug: 'old-essay',
      title: 'Older Essay',
      date: '2026-01-05',
      createdTime: '2026-01-05T12:00:00.000Z',
      tags: ['Courts'],
      featured: true,
    },
    {
      id: 'mid',
      slug: 'mid-essay',
      title: 'Middle Essay',
      date: '2026-06-01',
      createdTime: '2026-06-01T12:00:00.000Z',
      tags: ['Democracy & Law'],
    },
    {
      id: 'new',
      slug: 'new-essay',
      title: 'Newest Essay',
      date: '2026-10-12',
      createdTime: '2026-10-12T18:00:00.000Z',
      tags: ['Democracy & Law', 'Sports'],
    },
    {
      id: 'new',
      slug: 'new-essay-copy',
      title: 'Duplicate Newest',
      date: '2026-10-12',
      createdTime: '2026-10-12T01:00:00.000Z',
      tags: ['Sports'],
    },
  ];

  it('keeps publication order and preserves article URLs', () => {
    const landing = composeJournalLanding(entries);
    expect(landing.ordered.map((entry) => entry.slug)).toEqual([
      'new-essay',
      'new-essay-copy',
      'mid-essay',
      'old-essay',
    ]);
    expect(landing.ordered.map((entry) => journalEntryPath(entry))).toEqual([
      '/journal/new-essay',
      '/journal/new-essay-copy',
      '/journal/mid-essay',
      '/journal/old-essay',
    ]);
    expect(toJournalRecord(landing.ordered[0]).href).toBe('/journal/new-essay');
  });

  it('keeps the newest checked essay beside the latest lead without repeating it', () => {
    const landing = composeJournalLanding([
      { id: 'a', slug: 'a', title: 'A', date: '2026-02-01', featured: true },
      { id: 'b', slug: 'b', title: 'B', date: '2026-08-01', featured: true },
      { id: 'c', slug: 'c', title: 'C', date: '2026-09-01' },
    ]);

    expect(landing.lead.slug).toBe('c');
    expect(landing.featured.slug).toBe('b');
    expect(landing.ordered.map((entry) => entry.slug)).toEqual(['c', 'b', 'a']);
    expect(landing.recent.map((entry) => entry.slug)).toEqual(['b', 'a']);
    expect(landing.recent.filter((entry) => entry.slug === 'c')).toEqual([]);
  });

  it('leads with the newest essay when none are featured', () => {
    const landing = composeJournalLanding(entries.map((entry) => ({ ...entry, featured: false })));
    expect(landing.featured).toBeNull();
    expect(landing.lead.slug).toBe('new-essay');
    expect(landing.recent.map((entry) => entry.slug)).not.toContain('new-essay');
  });

  it('keeps a featured homepage essay when a newer essay is published', () => {
    const selection = selectHomepageEssays(entries);
    expect(selection.explicitlyFeatured).toBe(true);
    expect(homepageEssayLabel(selection)).toBe('Featured Essay');
    expect(selection.featured.slug).toBe('old-essay');
    expect(selection.latest.slug).toBe('new-essay');
    expect(selection.recent.map((entry) => entry.slug)).toEqual(['mid-essay']);
    const shown = [selection.featured, selection.latest, ...selection.recent];
    const hrefs = shown.map((entry) => journalEntryPath(entry));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('promotes the newest featured essay and keeps the latest essay distinct', () => {
    const published = [
      { id: 'old', slug: 'old-essay', title: 'Old', date: '2026-01-01', featured: true },
      { id: 'mid', slug: 'mid-essay', title: 'Middle', date: '2026-06-01', featured: true },
      { id: 'new', slug: 'new-essay', title: 'Newest', date: '2026-10-01' },
      { id: 'mid', slug: 'mid-copy', title: 'Middle copy', date: '2026-06-02' },
    ];
    const selection = selectHomepageEssays(published);
    expect(selection.explicitlyFeatured).toBe(true);
    expect(homepageEssayLabel(selection)).toBe('Featured Essay');
    expect(selection.featured.slug).toBe('mid-essay');
    expect(selection.latest.slug).toBe('new-essay');
    expect(selection.recent.map((entry) => entry.slug)).toEqual(['old-essay']);
    const shown = [selection.featured, selection.latest, ...selection.recent];
    expect(new Set(shown.map((entry) => entry.id)).size).toBe(shown.length);
  });

  it('returns an empty homepage selection when there are no essays', () => {
    expect(selectHomepageEssays([])).toEqual({
      featured: null,
      latest: null,
      recent: [],
      explicitlyFeatured: false,
    });
    expect(composeJournalLanding(null)).toEqual({
      ordered: [],
      lead: null,
      featured: null,
      recent: [],
      subjects: [],
    });
    expect(selectFeaturedJournalEntry(undefined)).toBeNull();
  });

  it('prefers Summary and does not invent an excerpt', () => {
    expect(journalDisplayExcerpt({ summary: '  The argument.  ' }, 'Body paragraph.')).toBe(
      'The argument.',
    );
    expect(journalDisplayExcerpt({ summary: '' }, 'Body paragraph.')).toBe('Body paragraph.');
    expect(journalDisplayExcerpt({ title: 'No summary' })).toBe('');
  });

  it('uses suggested subjects only when those tags are published', () => {
    expect(journalSubjectTags(entries)).toEqual(['Democracy & Law']);
    expect(journalSubjectTags([{ tags: ['Courts'] }, { tags: ['Surveillance'] }, { tags: ['Courts'] }])).toEqual([
      'Courts',
      'Surveillance',
    ]);
    expect(journalSubjectTags([{ tags: [] }])).toEqual([]);
  });

  it('filters the archive by tag without dropping the full search behavior', () => {
    const records = entries.map((entry) => toJournalRecord(entry));
    const tagged = filterJournalRecordsByTag(records, 'democracy & law');
    expect(tagged.map((record) => record.href)).toEqual([
      '/journal/mid-essay',
      '/journal/new-essay',
    ]);
    expect(filterJournalRecords(tagged, 'middle')).toHaveLength(1);
    expect(filterJournalRecords(tagged, '2026-06')).toHaveLength(1);
    expect(filterJournalRecordsByTag(records, '')).toHaveLength(records.length);
    expect(journalTagsMatch('Democracy & Law', 'democracy & law')).toBe(true);
    expect(toggleJournalTag('Courts', 'courts')).toBe('');
    expect(toggleJournalTag('Courts', 'Surveillance')).toBe('Surveillance');
    expect(readJournalTagParam([' Propaganda & Truth '])).toBe('Propaganda & Truth');
  });
});

describe('journal listing artwork', () => {
  const signed =
    'https://prod-files-secure.s3.us-west-2.amazonaws.com/note/hero.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123';

  it('uses a property image and leaves essays without artwork unchanged', () => {
    const withArt = {
      id: 'essay-1',
      slug: 'field-notes',
      title: 'Field Notes',
      propertyImage: {
        source: 'property',
        url: 'https://cdn.example/hero.jpg',
        fileName: 'hero.jpg',
        caption: '',
      },
      coverImage: null,
    };
    const bare = { id: 'essay-2', slug: 'plain-essay', title: 'Plain Essay' };

    expect(journalListingImage(withArt)).toMatchObject({
      src: 'https://cdn.example/hero.jpg',
      alt: 'Editorial image for Field Notes',
    });
    expect(journalListingImage(bare)).toBeNull();
    expect(toJournalRecord(bare).image).toBeNull();
    expect(toJournalRecord(withArt).image.src).toBe('https://cdn.example/hero.jpg');
  });

  it('points a Notion file at the essay image route and reads a body image only when blocks are supplied', async () => {
    const entry = {
      id: '40abc620-4ba0-81bc-8c15-d2e03b3c9283',
      slug: 'notion-art',
      title: 'Notion Art',
      propertyImage: { source: 'property', url: signed, fileName: 'hero.png', caption: '' },
    };
    expect(journalListingImage(entry).src).toBe('/journal/notion-art/image');

    const bodyOnly = {
      id: 'body-1',
      slug: 'body-art',
      title: 'Body Art',
      propertyImage: null,
      coverImage: null,
    };
    const blocks = [
      {
        id: 'block-1',
        type: 'image',
        image: { type: 'external', external: { url: 'https://cdn.example/body.jpg' }, caption: [] },
      },
    ];
    expect(journalListingImage(bodyOnly)).toBeNull();
    expect(journalListingImage(bodyOnly, blocks).src).toBe('https://cdn.example/body.jpg');

    const loader = vi.fn(async () => blocks);
    expect(await resolveListingImage(entry, loader, { allowBody: true })).toMatchObject({
      src: '/journal/notion-art/image',
    });
    expect(loader).not.toHaveBeenCalled();
    expect(await resolveListingImage(bodyOnly, loader, { allowBody: false })).toBeNull();
    expect(loader).not.toHaveBeenCalled();
    expect((await resolveListingImage(bodyOnly, loader, { allowBody: true })).src).toBe(
      'https://cdn.example/body.jpg',
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('crops photographs only when asked and keeps charts and missing art intact', () => {
    const chart = journalListingImage({
      slug: 'chart',
      title: 'Chart',
      imageFit: 'contain',
      propertyImage: { url: 'https://cdn.example/chart.png', fileName: '', caption: '' },
    });
    const photo = journalListingImage({
      slug: 'photo',
      title: 'Photo',
      imageFit: 'crop',
      propertyImage: { url: 'https://cdn.example/photo.jpg', fileName: '', caption: '' },
    });
    const svg = journalListingImage({
      slug: 'diagram',
      title: 'Diagram',
      imageFit: 'crop',
      propertyImage: { url: 'https://cdn.example/diagram.svg', fileName: '', caption: '' },
    });

    expect(chart.fit).toBe('contain');
    expect(photo.fit).toBe('crop');
    expect(svg.fit).toBe('contain');
    expect(journalImageFit({ fit: 'crop', src: '/journal/diagram/image.svg' })).toBe('contain');
    expect(journalListingImage({ slug: 'none', title: 'None' })).toBeNull();
  });

  it('does not invent a reading time or a pull quote', () => {
    expect(journalReadingMinutes('Too short to time.')).toBe(0);
    expect(journalReadingLabel(0)).toBe('');
    expect(journalReadingLabel(undefined)).toBe('');
    const plain = toJournalRecord({ slug: 'plain', title: 'Plain Essay' });
    expect(plain.pullQuote).toBe('');
    expect(plain.readingLabel).toBe('');
    expect(plain.image).toBeNull();
    expect(toJournalRecord({ slug: 'timed', title: 'Timed', readingMinutes: 6 }).readingLabel).toBe(
      '6 min read',
    );
  });
});
