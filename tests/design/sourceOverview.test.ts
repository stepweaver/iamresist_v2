import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sourceStatusLabel, summarizeSourceAudit } from '@/lib/design/sourceOverview';

const { isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

function textOf(node: React.ReactNode, acc: string[] = []) {
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => textOf(child, acc));
    return acc;
  }
  if (!isValidElement(node)) return acc;
  const rendered =
    typeof node.type === 'function'
      ? (node.type as (props: unknown) => React.ReactNode)(node.props)
      : (node.props as { children?: React.ReactNode }).children;
  textOf(rendered, acc);
  return acc;
}

function row(partial: Record<string, unknown>) {
  return {
    id: 'id',
    slug: 'slug',
    name: 'Name',
    provenanceClass: 'independent',
    fetchKind: 'rss',
    endpointDisplay: 'https://example.test/feed',
    isEnabled: true,
    manifestEnabled: true,
    statusBucket: 'enabled_healthy',
    statusDetail: null,
    purpose: 'Purpose',
    trustedFor: 'Reporting',
    notTrustedFor: 'Unverified claims',
    editorialNotes: null,
    isCoreSource: false,
    lastRunStatus: 'success',
    lastRunFinishedAt: null,
    lastRunError: null,
    lastRunMeta: null,
    lastSuccessAt: null,
    lastSuccessfulFetchAt: null,
    lastSuccessfulParseAt: null,
    newestArticlePublishedAt: null,
    lastItemFetchedAt: null,
    items24h: 1,
    items7d: 2,
    itemTotal: 3,
    surfacedTotal: 4,
    downrankedTotal: 5,
    suppressedTotal: 6,
    surfaced7d: 7,
    downranked7d: 8,
    suppressed7d: 9,
    health: 'healthy',
    healthReason: null,
    noiseHint: null,
    relevanceNotes: null,
    noiseNotes: null,
    ...partial,
  };
}

describe('source audit summary', () => {
  it('counts the classifications already on the rows', () => {
    const summary = summarizeSourceAudit([
      row({ id: 'a', health: 'healthy', statusBucket: 'enabled_healthy' }),
      row({ id: 'b', health: 'healthy', statusBucket: 'enabled_valid_empty' }),
      row({ id: 'c', health: 'failing', statusBucket: 'enabled_failing' }),
      row({ id: 'd', health: 'stale', statusBucket: 'enabled_stale' }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.byHealth).toEqual([
      { key: 'healthy', count: 2 },
      { key: 'stale', count: 1 },
      { key: 'failing', count: 1 },
    ]);
    expect(summary.byStatus).toEqual([
      { key: 'enabled_healthy', label: 'Healthy', count: 1 },
      { key: 'enabled_stale', label: 'Ingest stale', count: 1 },
      { key: 'enabled_failing', label: 'Upstream failure', count: 1 },
      { key: 'enabled_valid_empty', label: 'Valid empty', count: 1 },
    ]);
  });

  it('keeps unknown buckets visible and treats a missing health as unproven', () => {
    const summary = summarizeSourceAudit([
      { health: 'mystery', statusBucket: 'custom_bucket' },
      { health: 'disabled' },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.byHealth).toEqual([
      { key: 'unproven', count: 1 },
      { key: 'disabled', count: 1 },
    ]);
    expect(summary.byStatus).toEqual([{ key: 'custom_bucket', label: 'custom_bucket', count: 1 }]);
    expect(sourceStatusLabel('enabled_blocked')).toBe('Access restricted');
  });

  it('returns an empty summary for missing input', () => {
    expect(summarizeSourceAudit(undefined).total).toBe(0);
    expect(summarizeSourceAudit(null).byHealth).toEqual([]);
  });
});

describe('source monitor presentation', () => {
  it('shows real counts and says intake health is not verification', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: SourcesAuditSection } = await import('@/components/intel/SourcesAuditSection');
    const view = SourcesAuditSection({
      audit: {
        configured: true,
        staleThresholdMinutes: 180,
        errorMessage: null,
        build: null,
        rows: [
          row({
            id: 'court',
            slug: 'court-watch',
            name: 'Court Watch',
            health: 'healthy',
            statusBucket: 'enabled_healthy',
            isCoreSource: true,
            lastRunError: 'parser timeout',
          }),
          row({
            id: 'wire',
            slug: 'wire',
            name: 'Wire',
            health: 'failing',
            statusBucket: 'enabled_failing',
            healthReason: 'Last run failed',
          }),
        ],
      },
    });
    const text = textOf(view).join(' ');

    expect(text).toContain('Source health describes intake status. It does not verify the claims those sources publish.');
    expect(text).toContain('180');
    expect(text).toContain('Court Watch');
    expect(text).toContain('court-watch');
    expect(text).toContain('parser timeout');
    expect(text).toContain('Last run failed');
    expect(text).toContain('Core source');
    expect(text).toContain('Upstream failure');
    expect(text).toContain('Sources');
    expect(text).not.toMatch(/threat level|confidence %/i);
  });
});
