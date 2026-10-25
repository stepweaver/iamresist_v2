import { describe, expect, it } from 'vitest';
import {
  selectFeaturedShelfBook,
  takeDistinctCreatorVideos,
  takeLeadingBriefingStories,
} from '@/components/home/homepagePresentation';

describe('homepage presentation limits', () => {
  it('keeps the first three briefing stories in ranked order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    expect(takeLeadingBriefingStories(items).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(takeLeadingBriefingStories(items, 3)).not.toContainEqual({ id: 'd' });
  });

  it('shows two videos from distinct creators without reordering the ranked list', () => {
    const items = [
      { id: 'first', voice: { slug: 'alpha' } },
      { id: 'same-creator', voice: { slug: 'alpha' } },
      { id: 'second', voice: { name: 'Beta' } },
      { id: 'third', voice: { slug: 'gamma' } },
    ];

    expect(takeDistinctCreatorVideos(items).map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('features a shelf book when nothing is marked Reading', () => {
    const books = [
      { slug: 'pending-title', title: 'Pending Title', status: 'Pending' },
      { slug: 'shelf-title', title: 'Shelf Title', status: 'Shelf' },
    ];

    expect(selectFeaturedShelfBook(books)?.slug).toBe('pending-title');
    expect(selectFeaturedShelfBook([])).toBeNull();
  });

  it('still prefers the in-progress book when one is present', () => {
    const books = [
      { slug: 'shelf-title', title: 'Shelf Title', status: 'Shelf' },
      { slug: 'current', title: 'Current', status: 'Reading' },
    ];

    expect(selectFeaturedShelfBook(books)?.slug).toBe('current');
  });
});
