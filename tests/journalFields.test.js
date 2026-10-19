import { describe, expect, it } from 'vitest';
import { formatJournalPage } from '@/lib/notion/journalFields';

function page(properties, extra = {}) {
  return {
    id: 'page-1',
    created_time: '2026-04-02T12:00:00.000Z',
    last_edited_time: '2026-04-02T12:00:00.000Z',
    properties,
    ...extra,
  };
}

describe('formatJournalPage', () => {
  it('keeps published entries readable when Summary and Featured are absent', () => {
    const entry = formatJournalPage(
      page({
        Title: { title: [{ plain_text: 'Show Me the Proof' }] },
        Date: { type: 'date', date: { start: '2026-04-02' } },
        Tags: { type: 'multi_select', multi_select: [{ name: 'Law' }] },
        'Discord Channel Link': { type: 'url', url: 'https://discord.example/channel' },
      }),
    );

    expect(entry).toMatchObject({
      id: 'page-1',
      title: 'Show Me the Proof',
      slug: 'show-me-the-proof',
      date: '2026-04-02',
      tags: ['Law'],
      summary: '',
      featured: false,
      discordChannelLink: 'https://discord.example/channel',
    });
  });

  it('reads optional Summary text and a Featured checkbox', () => {
    const entry = formatJournalPage(
      page({
        Name: { title: [{ plain_text: 'Justice in the Open' }] },
        summary: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Power is a record. ' }, { plain_text: 'Read it in public.' }],
        },
        featured: { type: 'checkbox', checkbox: true },
      }),
    );

    expect(entry.summary).toBe('Power is a record. Read it in public.');
    expect(entry.featured).toBe(true);
    expect(entry.slug).toBe('justice-in-the-open');
  });

  it('accepts a Featured select without treating No as featured', () => {
    expect(
      formatJournalPage(page({ Featured: { type: 'select', select: { name: 'Yes' } } })).featured,
    ).toBe(true);
    expect(
      formatJournalPage(page({ Featured: { type: 'status', status: { name: 'Featured' } } })).featured,
    ).toBe(true);
    expect(
      formatJournalPage(page({ Featured: { type: 'checkbox', checkbox: false } })).featured,
    ).toBe(false);
    expect(
      formatJournalPage(page({ Featured: { type: 'select', select: { name: 'No' } } })).featured,
    ).toBe(false);
  });

  it('does not throw when a Notion page is missing properties', () => {
    expect(formatJournalPage(null)).toMatchObject({
      title: '',
      slug: '',
      summary: '',
      featured: false,
      tags: [],
    });
    expect(formatJournalPage({ id: 'bare' }).title).toBe('');
  });
});
