import { describe, expect, it } from 'vitest';
import { parseDemocracyDocketNewsAlertsHtml } from '@/lib/intel/parseHtmlIndex';

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
