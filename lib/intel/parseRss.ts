import Parser from 'rss-parser';

import type { StateChangeType } from '@/lib/intel/types';
import {
  extractBillClusterKeys,
  extractExecutiveClusterKeys,
  mergeClusterParts,
} from '@/lib/intel/clusterKeys';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { NormalizedItem } from '@/lib/intel/types';

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: ['published', 'updated', 'dc:date'],
  },
});

function parseItemDate(it: Record<string, unknown>): string | null {
  const raw =
    (it.isoDate as string | undefined) ??
    (it.pubDate as string | undefined) ??
    (it.published as string | undefined) ??
    (it.updated as string | undefined) ??
    (it['dc:date'] as string | undefined) ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function looksLikeHtml(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

function mapStateChange(
  slug: string,
  provenanceClass: string,
): StateChangeType {
  if (slug === 'govinfo-crec') return 'congressional_record_feed_item';
  if (slug === 'govinfo-bills') return 'legislative_feed_item';
  if (provenanceClass === 'WIRE') return 'wire_item';
  if (provenanceClass === 'SPECIALIST') return 'specialist_item';
  if (slug === 'wh-news') return 'press_statement';
  if (slug === 'wh-presidential') return 'published_document';
  return 'unknown';
}

export async function parseRssXmlToItems(
  xml: string,
  ctx: { sourceSlug: string; provenanceClass: string },
): Promise<NormalizedItem[]> {
  if (!xml || looksLikeHtml(xml)) return [];
  if (!xml.includes('<rss') && !xml.includes('<feed')) return [];

  const feed = await parser.parseString(xml);
  const items = feed.items ?? [];

  const out: NormalizedItem[] = [];
  for (const it of items) {
    const row = it as unknown as Record<string, unknown> & {
      link?: string;
      links?: { href?: string }[];
    };
    const link = row.link || row.links?.[0]?.href || '';
    if (!link || typeof link !== 'string') continue;

    const title = String(row.title ?? '').trim() || 'Untitled';
    const publishedAt = parseItemDate(row);
    const guid = (row.guid as string) || (row.id as string) || link;
    const externalId = typeof guid === 'string' && guid ? guid : null;
    const summary =
      (row.contentSnippet as string) ||
      (row.summary as string) ||
      (row.description as string) ||
      null;

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(link),
      extractExecutiveClusterKeys(title),
    );

    const stateChangeType = mapStateChange(ctx.sourceSlug, ctx.provenanceClass);

    const base = {
      externalId,
      canonicalUrl: link.trim(),
      title,
      summary: summary ? String(summary).slice(0, 4000) : null,
      publishedAt,
      structured: {
        feedTitle: feed.title ?? null,
        itemCategories: row.categories ?? null,
      },
      clusterKeys,
      stateChangeType,
    };
    out.push({
      ...base,
      contentHash: hashNormalizedItem(base),
    });
  }
  return out;
}
