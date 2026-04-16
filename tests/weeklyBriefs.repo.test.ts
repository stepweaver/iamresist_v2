import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractWeeklyBriefBody } from '@/lib/notion/weeklyBriefs.repo';

describe('extractWeeklyBriefBody', () => {
  it('flattens supported Notion blocks into deterministic body text', () => {
    const payload = extractWeeklyBriefBody([
      {
        type: 'heading_1',
        heading_1: {
          rich_text: [{ plain_text: 'Main theme', href: null }],
        },
      },
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'First line of notes.', href: null }],
        },
      },
      {
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ plain_text: 'Bullet point', href: null }],
        },
      },
      {
        type: 'unsupported',
      },
    ]);

    expect(payload.bodyText).toBe('Main theme\n\nFirst line of notes.\n\nBullet point');
  });

  it('extracts linked and raw URLs, dedupes them, and preserves stable order', () => {
    const payload = extractWeeklyBriefBody([
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { plain_text: 'Read this', href: 'https://example.com/story' },
            { plain_text: ' and also https://example.org/alpha?utm_source=x', href: null },
          ],
        },
      },
      {
        type: 'quote',
        quote: {
          rich_text: [
            { plain_text: 'Duplicate link', href: 'https://example.com/story/' },
            { plain_text: ' plus raw https://example.net/path.', href: null },
          ],
        },
      },
    ]);

    expect(payload.bodyUrls).toEqual([
      'https://example.com/story',
      'https://example.org/alpha?utm_source=x',
      'https://example.net/path',
    ]);
  });
});
