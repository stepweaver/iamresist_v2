import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitShelfBooks } from '@/components/home/homepagePresentation';
import { curatedResources, selectStartingResources } from '@/lib/data/resources';
import { summarizeTimeline, timelineEvents } from '@/lib/data/timeline';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('supporting pages', () => {
  it('features one shelf book and keeps the rest of the collection', () => {
    const books = [
      { slug: 'first', title: 'First', status: 'Shelf' },
      { slug: 'current', title: 'Current', status: 'Reading' },
      { slug: 'third', title: 'Third', status: 'Shelf' },
    ];
    const shelf = splitShelfBooks(books);

    expect(shelf.featured.slug).toBe('current');
    expect(shelf.rest.map((book) => book.slug)).toEqual(['first', 'third']);
    expect(splitShelfBooks([{ slug: 'only', status: 'Shelf' }]).rest).toEqual([]);
  });

  it('starts resources with three existing entries and keeps every directory URL', () => {
    const starting = selectStartingResources();
    const directoryHrefs = new Set(curatedResources.map((item) => item.href));

    expect(starting.map((item) => item.id)).toEqual(['aort', 'brennancenter', 'aclu']);
    expect(starting.every((item) => directoryHrefs.has(item.href))).toBe(true);
    expect(curatedResources.length).toBeGreaterThanOrEqual(starting.length);
  });

  it('derives timeline coverage from the maintained events', () => {
    const summary = summarizeTimeline();
    const categories = new Set(timelineEvents.map((event) => event.category));

    expect(summary.count).toBe(timelineEvents.length);
    expect(summary.categories.every((category) => categories.has(category))).toBe(true);
    expect(timelineEvents.some((event) => event.date === summary.startLabel)).toBe(true);
    expect(timelineEvents.some((event) => event.date === summary.endLabel)).toBe(true);
    expect(summary.startLabel).not.toBe(summary.endLabel);

    const page = read('app/(site)/timeline/page.jsx');
    expect(page).toContain('Adapted from the');
    expect(page).toContain('covering');
    expect(page).not.toContain('manually maintained');
    expect(page).not.toContain('not a live record');
    expect(page).toContain('brennancenter.org');
  });

  it('keeps the manifesto sentences and points to About This Journal', () => {
    const about = read('app/(site)/about/page.jsx');
    expect(about).toContain('What is I AM [RESIST]?');
    expect(about).toContain('Who is behind it?');
    expect(about).toContain('What the project believes');
    expect(about).toContain('Full manifesto');
    expect(about).toContain('Meaning of the');
    expect(about).toContain('About the journal');
    expect(about).toContain('is a personal project - not an organization');
    expect(about).toContain('Yankee Samurai');
    expect(about).toContain('I believe silence in the face of fascism is surrender.');
    expect(about).toContain('href="/about/this-journal"');
    expect(read('app/(site)/about/this-journal/page.jsx')).toContain('Of course I use AI');
  });

  it('states that shop purchases support the independent project', () => {
    const shop = read('app/(site)/shop/page.jsx');
    expect(shop).toContain('Purchases support this independent project.');
    expect(shop).toContain('SHOP_PRODUCTS');
    expect(shop).not.toContain('independent resistance journalism');
  });
});
