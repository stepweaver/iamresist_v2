import { describe, expect, it } from 'vitest';
import {
  parseDemocracyDocketNewsAlertsHtml,
  parseSameHostArticleLinksHtml,
  parseKyivIndependentNewsArchiveHtml,
  parse972MagazineHomepageHtml,
} from '@/lib/intel/parseHtmlIndex';

describe('parseDemocracyDocketNewsAlertsHtml', () => {
  it('extracts article URLs and skips pagination', () => {
    const html = `
      <html><body>
        <a href="https://www.democracydocket.com/news-alerts/gop-kansas-act/">Kansas</a>
        <a href="https://www.democracydocket.com/news-alerts/page/2/">Older</a>
        <a href='https://www.democracydocket.com/news-alerts/voter-purge-case/'>VA</a>
      </body></html>
    `;
    const items = parseDemocracyDocketNewsAlertsHtml(html, {
      sourceSlug: 'democracy-docket',
      provenanceClass: 'SPECIALIST',
      contentUseMode: 'feed_summary',
      fetchKind: 'html_index',
    });
    expect(items).toHaveLength(2);
    const urls = items.map((i) => i.canonicalUrl).sort();
    expect(urls[0]).toContain('/news-alerts/gop-kansas-act/');
    expect(urls[1]).toContain('/news-alerts/voter-purge-case/');
    expect(items[0]!.title.length).toBeGreaterThan(3);
  });

  it('returns empty for short or empty HTML', () => {
    expect(
      parseDemocracyDocketNewsAlertsHtml('', {
        sourceSlug: 'democracy-docket',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'html_index',
      }),
    ).toHaveLength(0);
  });
});

describe('parseSameHostArticleLinksHtml', () => {
  it('extracts bls.gov news.release links', () => {
    const html = `
      <html><body>
        <p>${'x'.repeat(220)}</p>
        <a href="https://www.bls.gov/news.release/empsit.toc.htm">Employment</a>
        <a href="https://www.bls.gov/schedule/foo">Other</a>
      </body></html>
    `;
    const items = parseSameHostArticleLinksHtml(html, {
      sourceSlug: 'bls-release-calendar',
      provenanceClass: 'SCHEDULE',
      contentUseMode: 'metadata_only',
      fetchKind: 'html_index',
      hostname: 'www.bls.gov',
      pathIncludes: 'news.release',
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.stateChangeType).toBe('scheduled_release');
    expect(items[0]!.canonicalUrl).toContain('news.release');
  });

  it('BLS schedule hub: monthly calendar links (no news.release on same page)', () => {
    const html = `
      <html><body>
        <p>${'x'.repeat(220)}</p>
        <a href="/schedule/2026/04_sched_list.htm">April list</a>
        <a href="https://www.bls.gov/opub/foo.htm">Other</a>
      </body></html>
    `;
    const items = parseSameHostArticleLinksHtml(html, {
      sourceSlug: 'bls-release-calendar',
      provenanceClass: 'SCHEDULE',
      contentUseMode: 'metadata_only',
      fetchKind: 'html_index',
      hostname: 'www.bls.gov',
      pathIncludes: ['news.release', '_sched_list.htm', '_sched.htm'],
      baseUrl: 'https://www.bls.gov/schedule/2026/home.htm',
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.canonicalUrl).toContain('04_sched_list.htm');
  });

  it('resolves root-relative hrefs when baseUrl is set (schedule pages)', () => {
    const html = `
      <html><body>
        <p>${'x'.repeat(220)}</p>
        <a href="/news.release/empsit.htm">Employment Situation</a>
      </body></html>
    `;
    const items = parseSameHostArticleLinksHtml(html, {
      sourceSlug: 'bls-release-calendar',
      provenanceClass: 'SCHEDULE',
      contentUseMode: 'metadata_only',
      fetchKind: 'html_index',
      hostname: 'www.bls.gov',
      pathIncludes: 'news.release',
      baseUrl: 'https://www.bls.gov/schedule/2026/home.htm',
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.canonicalUrl).toContain('news.release');
    expect(items[0]!.canonicalUrl.startsWith('https://www.bls.gov/')).toBe(true);
  });
});

describe('parseKyivIndependentNewsArchiveHtml', () => {
  it('extracts kyivindependent.com article links and ignores navigation', () => {
    const html = `
      <html><body>
        <p>${'x'.repeat(320)}</p>
        <a href="https://kyivindependent.com/ukraine-war-latest-something/">Story</a>
        <a href="https://www.kyivindependent.com/some-investigation/">Story 2</a>
        <a href="https://kyivindependent.com/news-archive/">Archive</a>
        <a href="https://kyivindependent.com/tag/news-feed/">Tag</a>
      </body></html>
    `;
    const items = parseKyivIndependentNewsArchiveHtml(html, {
      sourceSlug: 'kyiv-independent',
      provenanceClass: 'SPECIALIST',
      contentUseMode: 'feed_summary',
      fetchKind: 'html_index',
      baseUrl: 'https://www.kyivindependent.com/news-archive/',
    });
    const urls = items.map((i) => i.canonicalUrl).sort();
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls.some((u) => u.includes('/news-archive'))).toBe(false);
    expect(urls.some((u) => u.includes('/tag/'))).toBe(false);
    expect(urls.every((u) => u.startsWith('https://kyivindependent.com/'))).toBe(true);
  });
});

describe('parse972MagazineHomepageHtml', () => {
  it('extracts WordPress-style /YYYY/MM/ permalinks and ignores non-article links', () => {
    const html = `
      <html><body>
        <p>${'x'.repeat(320)}</p>
        <a href="https://www.972mag.com/2026/03/some-story/">Story</a>
        <a href="https://www.972mag.com/2026/03/another-story/?utm_source=x">Story 2</a>
        <a href="https://www.972mag.com/about/">About</a>
        <a href="https://www.972mag.com/feed/">Feed</a>
      </body></html>
    `;
    const items = parse972MagazineHomepageHtml(html, {
      sourceSlug: 'mag-972',
      provenanceClass: 'SPECIALIST',
      contentUseMode: 'feed_summary',
      fetchKind: 'html_index',
      baseUrl: 'https://www.972mag.com/',
    });
    const urls = items.map((i) => i.canonicalUrl).sort();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/\/\d{4}\/\d{2}\//);
    expect(urls[1]).toMatch(/\/\d{4}\/\d{2}\//);
    expect(urls[1]!.includes('?')).toBe(false);
  });
});
