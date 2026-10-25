import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeOverallIngestStatus, ingestOneSource } from '@/lib/intel/ingest';
import type { IngestSummary } from '@/lib/intel/ingest';
import type { SignalSourceConfig } from '@/lib/intel/types';
import * as fetchText from '@/lib/intel/fetchText';

vi.mock('@/lib/intel/fetchText', () => ({
  fetchTextNoStore: vi.fn(),
}));

function rssCfg(over: Partial<SignalSourceConfig> = {}): SignalSourceConfig & { endpointUrl: string } {
  return {
    slug: 'wh-news',
    name: 'Test WH',
    provenanceClass: 'PRIMARY',
    fetchKind: 'rss',
    deskLane: 'osint',
    sourceFamily: 'general',
    contentUseMode: 'feed_summary',
    isEnabled: true,
    purpose: 'p',
    trustedFor: 't',
    notTrustedFor: 'n',
    isCoreSource: true,
    trustWarningMode: 'source_controlled_official_claims',
    trustWarningLevel: 'caution',
    requiresIndependentVerification: true,
    heroEligibilityMode: 'demote_low_substance',
    trustWarningText: 'Test trust note',
    ...over,
    endpointUrl: over.endpointUrl || 'https://example.com/feed',
  };
}

describe('ingestOneSource', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('caps very large RSS feeds per-source per-run', async () => {
    const items = Array.from({ length: 80 }).map((_, i) => {
      const n = i + 1;
      return `
        <item>
          <title>T${n}</title>
          <link>https://example.com/p${n}</link>
          <description>Hi</description>
        </item>
      `;
    });
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>C</title>${items.join(
        '\n',
      )}</channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });

    const out = await ingestOneSource(rssCfg({ slug: 'wh-news' }));
    expect(out.status).toBe('success');
    expect(out.items.length).toBeLessThanOrEqual(60);
    expect(out.meta?.itemsCapped).toBe(true);
    expect(out.meta?.itemsCap).toBe(60);
  });

  it('records an unavailable feed as a source failure without throwing', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockRejectedValue(new Error('network down'));
    const out = await ingestOneSource(rssCfg({ slug: 'bellingcat' }));
    expect(out.status).toBe('failed');
    expect(out.items).toEqual([]);
    expect(out.error).toMatch(/network down/);
  });

  it('treats a well-formed empty RSS channel as a valid empty success', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>',
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg());
    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(0);
    expect(out.error).toBeUndefined();
    expect(out.meta?.outcome).toBe('valid_empty');
    expect(out.meta?.rawEntryCount).toBe(0);
    expect(out.meta?.itemsParsed).toBe(0);
  });

  it('marks feed entries without links as a normalization failure', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
        <item><title>No link</title><description>Body</description></item>
      </channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg());
    expect(out.status).toBe('partial');
    expect(out.items).toHaveLength(0);
    expect(out.meta?.failureCategory).toBe('parser_normalization_failure');
    expect(out.meta?.rawEntryCount).toBe(1);
    expect(out.meta?.itemsParsed).toBe(0);
  });

  it('treats a closed Public Inspection list as a valid empty success', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({
        description: 'All Public Inspection Documents',
        count: 0,
        meta: {
          pil_unavailability_message:
            'The Public Inspection list is unavailable after 12AM Eastern time and will return on Monday, October 26 at 8:45AM Eastern time.',
        },
      }),
      finalUrl: 'https://www.federalregister.gov/api/v1/public-inspection-documents.json',
      contentType: 'application/json; charset=utf-8',
      redirects: [],
    });
    const out = await ingestOneSource(
      rssCfg({
        slug: 'fr-public-inspection',
        fetchKind: 'json_api',
        provenanceClass: 'PRIMARY',
      }),
    );
    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(0);
    expect(out.meta?.outcome).toBe('valid_empty');
    expect(out.meta?.rawEntryCount).toBe(0);
    expect(out.meta?.itemsParsed).toBe(0);
    expect(String(out.meta?.piUnavailabilityMessage)).toMatch(/8:45AM/);
  });

  it('normalizes a Public Inspection document that only has a PDF url', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({
        count: 1,
        results: [
          {
            title: 'Notice of proposed rule',
            type: 'Proposed Rule',
            pdf_url: 'https://public-inspection.federalregister.gov/2026-21749.pdf',
            publication_date: '2026-10-26',
            filed_at: '2026-10-22T11:15:00.000-04:00',
          },
        ],
      }),
      finalUrl: 'https://www.federalregister.gov/api/v1/public-inspection-documents.json',
      contentType: 'application/json',
      redirects: [],
    });
    const out = await ingestOneSource(
      rssCfg({
        slug: 'fr-public-inspection',
        fetchKind: 'json_api',
        provenanceClass: 'PRIMARY',
      }),
    );
    expect(out.status).toBe('success');
    expect(out.meta?.rawEntryCount).toBe(1);
    expect(out.meta?.itemsNormalized).toBe(1);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.externalId).toBe('2026-21749');
    expect(out.items[0]?.canonicalUrl).toContain('2026-21749.pdf');
    expect(out.items[0]?.stateChangeType).toBe('pre_publication');
  });

  it('short non-feed body is partial, not success', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: 'nope',
      finalUrl: 'https://example.com/x',
      contentType: 'text/plain',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg({ endpointUrl: 'https://example.com/x' }));
    expect(out.status).toBe('partial');
    expect(out.items).toHaveLength(0);
    expect(out.meta?.failureCategory).toBe('feed_non_xml_body');
  });

  it('metadata_only yields null summary even when description exists', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>C</title><item>
        <title>T</title><link>https://example.com/p</link>
        <description><![CDATA[<p>Hello world paragraph</p>]]></description>
      </item></channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg({ contentUseMode: 'metadata_only' }));
    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.summary).toBeNull();
    expect(out.items[0]!.title).toBe('T');
  });

  it('preview_and_link caps long plain snippet', async () => {
    const long = 'word '.repeat(200).trim();
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>C</title><item>
        <title>T2</title><link>https://example.com/p2</link>
        <description>${long}</description>
      </item></channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg({ contentUseMode: 'preview_and_link' }));
    expect(out.status).toBe('success');
    expect(out.items[0]!.summary).toBeTruthy();
    expect(out.items[0]!.summary!.length).toBeLessThanOrEqual(322);
  });

  it('includes bodySample on HTTP error responses', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: false,
      status: 403,
      text: '<html><title>blocked</title><body>cf challenge</body></html>',
      finalUrl: 'https://example.com/feed',
      contentType: 'text/html; charset=UTF-8',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg());
    expect(out.status).toBe('failed');
    expect(out.error).toMatch(/HTTP 403/);
    expect(out.meta?.bodySample).toBe('<html><title>blocked</title><body>cf challenge</body></html>'.slice(0, 180));
  });

  it('sets imageUrl from RSS enclosure when type is image', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>C</title><item>
        <title>Photo story</title><link>https://example.com/article</link>
        <enclosure url="https://cdn.example.com/hero.jpg" type="image/jpeg" length="1" />
      </item></channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });
    const out = await ingestOneSource(rssCfg());
    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.imageUrl).toBe('https://cdn.example.com/hero.jpg');
  });

  it('accepts podcast_rss the same way as rss', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Podcast</title>
            <item>
              <title>Episode 1</title>
              <link>https://example.com/ep1</link>
              <description><![CDATA[Episode summary]]></description>
              <pubDate>Sun, 13 Apr 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`,
      finalUrl: 'https://example.com/podcast.xml',
      contentType: 'application/rss+xml',
      redirects: [],
    });

    const out = await ingestOneSource(
      rssCfg({
        slug: 'podcast-test',
        fetchKind: 'podcast_rss',
        provenanceClass: 'COMMENTARY',
      }),
    );

    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.title).toBe('Episode 1');
  });

  it('captures RSS item order as structured.sourcePosition', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: `<?xml version="1.0"?><rss version="2.0"><channel><title>C</title>
        <item><title>T1</title><link>https://example.com/p1</link><description>Hi</description></item>
        <item><title>T2</title><link>https://example.com/p2</link><description>Hi</description></item>
      </channel></rss>`,
      finalUrl: 'https://example.com/feed',
      contentType: 'application/rss+xml',
      redirects: [],
    });

    const out = await ingestOneSource(rssCfg({ slug: 'wh-news', trustWarningMode: 'none' }));
    expect(out.status).toBe('success');
    expect(out.items).toHaveLength(2);
    expect(out.items[0]!.structured.sourcePosition).toBe(1);
    expect(out.items[1]!.structured.sourcePosition).toBe(2);
  });
});

describe('computeOverallIngestStatus', () => {
  it('returns partial when every source is skipped', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'skipped', itemsUpserted: 0 },
      { sourceSlug: 'b', status: 'skipped', itemsUpserted: 0 },
    ];
    expect(computeOverallIngestStatus(rows)).toBe('partial');
  });

  it('stays partial when one source fails and another succeeds', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'success', itemsUpserted: 5 },
      { sourceSlug: 'b', status: 'failed', itemsUpserted: 0, error: 'x' },
    ];
    expect(computeOverallIngestStatus(rows)).toBe('partial');
  });

  it('returns failed only when every attempted source failed', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'failed', itemsUpserted: 0, error: 'x' },
      { sourceSlug: 'b', status: 'skipped', itemsUpserted: 0 },
    ];
    expect(computeOverallIngestStatus(rows)).toBe('failed');
  });

  it('returns partial when no failures but a partial exists', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'success', itemsUpserted: 5 },
      { sourceSlug: 'b', status: 'partial', itemsUpserted: 0, error: 'empty' },
    ];
    expect(computeOverallIngestStatus(rows)).toBe('partial');
  });

  it('returns success when all attempted sources succeeded', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'skipped', itemsUpserted: 0 },
      { sourceSlug: 'b', status: 'success', itemsUpserted: 3 },
    ];
    expect(computeOverallIngestStatus(rows)).toBe('success');
  });
});
