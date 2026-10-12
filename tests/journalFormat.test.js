import { describe, expect, it } from 'vitest';
import {
  filterJournalRecords,
  journalDates,
  journalLeadExcerpt,
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

  it('shows an update only when the edit falls on a later calendar day', () => {
    const dates = journalDates({
      date: '2026-10-01',
      lastEditedTime: '2026-10-08T12:00:00.000Z',
    });

    expect(dates.showUpdated).toBe(true);
    expect(dates.updatedLabel).toBe('08-OCT-2026');
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
