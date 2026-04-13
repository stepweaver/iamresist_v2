import Parser from 'rss-parser';

import { extractFeedImage, youtubeThumbFromUrl } from '@/lib/feeds/feedItemImage.js';
import { applyContentUseModeToSummary, stripHtmlToText } from '@/lib/intel/contentUse';
import type { ContentUseMode, FetchKind, StateChangeType } from '@/lib/intel/types';
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
    item: [
      'published',
      'updated',
      'dc:date',
      ['content:encoded', 'content:encoded'],
      ['media:thumbnail', 'media:thumbnail', { keepArray: true }],
      ['media:content', 'media:content', { keepArray: true }],
    ],
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

function mapStateChange(slug: string, provenanceClass: string): StateChangeType {
  if (slug === 'govinfo-crec') return 'congressional_record_feed_item';
  if (slug === 'govinfo-bills') return 'legislative_feed_item';
  if (slug === 'wh-news') return 'press_statement';
  if (slug === 'wh-presidential') return 'presidential_action';
  if (provenanceClass === 'SCHEDULE') return 'scheduled_release';
  if (provenanceClass === 'WIRE') return 'wire_item';
  if (provenanceClass === 'COMMENTARY') return 'commentary_item';
  if (provenanceClass === 'SPECIALIST') return 'specialist_item';
  return 'unknown';
}

function itemLink(row: Record<string, unknown> & { link?: string; links?: { href?: string }[] }): string {
  const direct = row.link;
  if (direct && typeof direct === 'string' && direct.trim()) return direct.trim();

  const enc = row.enclosure as { url?: string } | undefined;
  if (enc?.url && typeof enc.url === 'string' && enc.url.trim()) return enc.url.trim();

  const links = row.links;
  if (Array.isArray(links)) {
    for (const l of links) {
      if (l?.href && typeof l.href === 'string' && l.href.trim()) return l.href.trim();
    }
  }
  return '';
}

function pickRawSummary(
  row: Record<string, unknown>,
  contentUseMode: ContentUseMode,
): string | null {
  const snippet = row.contentSnippet as string | undefined;
  if (snippet && String(snippet).trim()) return String(snippet).trim();

  const desc = row.description as string | undefined;
  const summ = row.summary as string | undefined;
  const fromDesc = desc ? stripHtmlToText(desc) : '';
  const fromSumm = summ ? stripHtmlToText(summ) : '';
  const combined = [fromDesc, fromSumm].find((s) => s && s.trim());
  if (combined) return combined.trim();

  if (contentUseMode === 'full_text_if_feed_includes') {
    const content = row.content as string | undefined;
    if (content && String(content).trim()) return stripHtmlToText(content);
  }

  return null;
}

export async function parseRssXmlToItems(
  xml: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
  },
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
    const link = itemLink(row);
    if (!link) continue;

    const title = String(row.title ?? '').trim() || 'Untitled';
    const publishedAt = parseItemDate(row);
    const guid = (row.guid as string) || (row.id as string) || link;
    const externalId = typeof guid === 'string' && guid ? guid : null;

    const rawSummary = pickRawSummary(row, ctx.contentUseMode);
    const summary = applyContentUseModeToSummary(rawSummary, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(link),
      extractExecutiveClusterKeys(title),
    );

    const stateChangeType = mapStateChange(ctx.sourceSlug, ctx.provenanceClass);

    const fromFeed = extractFeedImage(row as Record<string, unknown>);
    const imageUrl = fromFeed || youtubeThumbFromUrl(link) || null;

    const base = {
      externalId,
      canonicalUrl: link,
      title,
      summary,
      publishedAt,
      imageUrl,
      structured: {
        feedTitle: feed.title ?? null,
        itemCategories: row.categories ?? null,
        fetchKind: ctx.fetchKind,
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
