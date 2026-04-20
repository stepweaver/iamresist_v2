import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllBooks: vi.fn(),
  getJournalEntries: vi.fn(),
  getBookEntries: vi.fn(),
  getVideos: vi.fn(),
  getAllProtestSongs: vi.fn(),
}));

vi.mock('@/lib/metadata', () => ({
  BASE_URL: 'https://iamresist.test',
}));

vi.mock('@/lib/shopProducts', () => ({
  PRODUCT_SLUGS: ['signal-pack'],
}));

vi.mock('@/lib/utils/slugify', () => ({
  slugify: (value: string) => value.toLowerCase().replace(/\s+/g, '-'),
}));

vi.mock('@/lib/notion/books.repo', () => ({
  getAllBooks: mocks.getAllBooks,
}));

vi.mock('@/lib/notion/journal.repo', () => ({
  getJournalEntries: mocks.getJournalEntries,
}));

vi.mock('@/lib/notion/readingJournal.repo', () => ({
  getBookEntries: mocks.getBookEntries,
}));

vi.mock('@/lib/notion/videos.repo', () => ({
  getVideos: mocks.getVideos,
}));

vi.mock('@/lib/notion/protestMusic.repo', () => ({
  getAllProtestSongs: mocks.getAllProtestSongs,
}));

describe('sitemap', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getJournalEntries.mockResolvedValue([
      {
        id: 'entry-1',
        slug: 'journal-entry',
        lastEditedTime: '2026-04-20T00:00:00.000Z',
      },
    ]);
    mocks.getAllBooks.mockResolvedValue([]);
    mocks.getBookEntries.mockResolvedValue([]);
    mocks.getVideos.mockResolvedValue([]);
    mocks.getAllProtestSongs.mockResolvedValue([]);
  });

  it('emits canonical URLs and omits redirect aliases', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://iamresist.test/journal/journal-entry');
    expect(urls).toContain('https://iamresist.test/telescreen');
    expect(urls).toContain('https://iamresist.test/resources');
    expect(urls).toContain('https://iamresist.test/shop/signal-pack');

    expect(urls).not.toContain('https://iamresist.test/posts');
    expect(urls).not.toContain('https://iamresist.test/posts/journal-entry');
    expect(urls).not.toContain('https://iamresist.test/voices');
    expect(urls).not.toContain('https://iamresist.test/intel');
    expect(urls).not.toContain('https://iamresist.test/intel/live');
    expect(urls).not.toContain('https://iamresist.test/intel/indicators');
    expect(urls).not.toContain('https://iamresist.test/intel/statements');
  });
});
