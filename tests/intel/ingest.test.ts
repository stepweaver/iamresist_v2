import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeOverallIngestStatus, ingestOneSource } from '@/lib/intel/ingest';
import type { IngestSummary } from '@/lib/intel/ingest';
import type { SignalSourceConfig } from '@/lib/intel/types';
import * as fetchText from '@/lib/intel/fetchText';

vi.mock('@/lib/intel/fetchText', () => ({
  fetchTextNoStore: vi.fn(),
}));

function rssCfg(over: Partial<SignalSourceConfig> = {}): SignalSourceConfig {
  return {
    slug: 'wh-news',
    name: 'Test WH',
    provenanceClass: 'PRIMARY',
    fetchKind: 'rss',
    deskLane: 'osint',
    contentUseMode: 'feed_summary',
    endpointUrl: 'https://example.com/feed',
    isEnabled: true,
    purpose: 'p',
    trustedFor: 't',
    notTrustedFor: 'n',
    isCoreSource: true,
    ...over,
  };
}

describe('ingestOneSource', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('marks RSS with 0 items as partial on HTTP 200', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>',
      finalUrl: 'https://example.com/feed',
    });
    const out = await ingestOneSource(rssCfg());
    expect(out.status).toBe('partial');
    expect(out.items).toHaveLength(0);
    expect(out.error).toMatch(/0 items/i);
  });

  it('short non-feed body is partial, not success', async () => {
    vi.mocked(fetchText.fetchTextNoStore).mockResolvedValue({
      ok: true,
      status: 200,
      text: 'nope',
      finalUrl: 'https://example.com/x',
    });
    const out = await ingestOneSource(rssCfg({ endpointUrl: 'https://example.com/x' }));
    expect(out.status).toBe('partial');
    expect(out.items).toHaveLength(0);
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
    });
    const out = await ingestOneSource(rssCfg({ contentUseMode: 'preview_and_link' }));
    expect(out.status).toBe('success');
    expect(out.items[0]!.summary).toBeTruthy();
    expect(out.items[0]!.summary!.length).toBeLessThanOrEqual(322);
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

  it('returns failed when any attempted source failed', () => {
    const rows: IngestSummary[] = [
      { sourceSlug: 'a', status: 'success', itemsUpserted: 5 },
      { sourceSlug: 'b', status: 'failed', itemsUpserted: 0, error: 'x' },
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
