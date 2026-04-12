import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeOverallIngestStatus, ingestOneSource } from '@/lib/intel/ingest';
import type { IngestSummary } from '@/lib/intel/ingest';
import * as fetchText from '@/lib/intel/fetchText';

vi.mock('@/lib/intel/fetchText', () => ({
  fetchTextNoStore: vi.fn(),
}));

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
    const out = await ingestOneSource({
      slug: 'wh-news',
      fetchKind: 'rss',
      endpointUrl: 'https://example.com/feed',
      provenanceClass: 'PRIMARY',
    });
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
    const out = await ingestOneSource({
      slug: 'wh-news',
      fetchKind: 'rss',
      endpointUrl: 'https://example.com/x',
      provenanceClass: 'PRIMARY',
    });
    expect(out.status).toBe('partial');
    expect(out.items).toHaveLength(0);
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
