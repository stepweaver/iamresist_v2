import { describe, expect, it } from 'vitest';
import {
  parseDemocracyDocketNewsAlertsHtml,
  parseSameHostArticleLinksHtml,
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
