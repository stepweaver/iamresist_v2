import { describe, expect, it } from 'vitest';

import { assessHomepageNewswireScope } from '@/lib/feeds/homepageNewswireScope';
import {
  dedupeStoriesByCanonicalUrl,
  filterMissionSafeNewswireStories,
  pickDiverseTopStories,
} from '@/lib/newswire';

function iso(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

describe('filterMissionSafeNewswireStories', () => {
  it('excludes sports-only raw newswire items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'sports-1',
        url: 'https://example.test/sports-1',
        title: 'NBA playoffs score stuns fans',
        excerpt: 'Star coach and quarterback drama dominates the sports cycle',
        sourceSlug: 'ap',
        publishedAt: iso(1),
      },
    ]);

    expect(out).toEqual([]);
  });

  it('excludes entertainment and lifestyle-only raw newswire items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'ent-1',
        url: 'https://example.test/ent-1',
        title: 'Celebrity fashion tour dominates red carpet chatter',
        excerpt: 'Streaming gossip and wellness trends lead the day',
        sourceSlug: 'reuters',
        publishedAt: iso(2),
      },
    ]);

    expect(out).toEqual([]);
  });

  it('preserves ambiguous breaking current-events items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'amb-1',
        url: 'https://example.test/amb-1',
        title: 'Breaking: explosion triggers emergency response downtown',
        excerpt: 'Authorities investigate damage after the blast',
        sourceSlug: 'ap',
        publishedAt: iso(1),
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].missionScope.scopeState).toBe('ambiguous');
  });

  it('preserves clear mission-aligned political items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'pol-1',
        url: 'https://example.test/pol-1',
        title: 'Senate oversight hearing targets White House deportation order',
        excerpt: 'Lawmakers demand accountability over executive action',
        sourceSlug: 'reuters',
        publishedAt: iso(3),
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].missionScope.scopeState).toBe('in_scope');
  });

  it('preserves clear war and geopolitics items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'war-1',
        url: 'https://example.test/war-1',
        title: 'Ukraine says Russian missile strike hits civilians',
        excerpt: 'Officials warn the war is widening after new airstrike reports',
        sourceSlug: 'ap',
        publishedAt: iso(4),
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].missionScope.scopeState).toBe('in_scope');
  });

  it('keeps curated mission-relevant items', () => {
    const out = filterMissionSafeNewswireStories([
      {
        id: 'cur-1',
        url: 'https://example.test/cur-1',
        title: 'Curated: court ruling expands voting rights fight',
        note: 'Democracy and accountability stakes are rising',
        sourceSlug: 'curated',
        publishedAt: iso(5),
        isCurated: true,
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].isCurated).toBe(true);
    expect(out[0].missionScope.scopeState).toBe('in_scope');
  });
});

describe('assessHomepageNewswireScope', () => {
  it('lets curated homepage briefing items keep ambiguous current-events items', () => {
    const out = assessHomepageNewswireScope({
      id: 'cur-amb-1',
      title: 'Breaking: explosion triggers emergency response downtown',
      note: 'Editors want this available for briefing review.',
      isCurated: true,
    });

    expect(out.missionScope.scopeState).toBe('ambiguous');
    expect(out.allowOnNewswire).toBe(true);
    expect(out.allowOnHomepageBriefing).toBe(true);
  });

  it('still blocks curated homepage briefing items that are clearly off-topic', () => {
    const out = assessHomepageNewswireScope({
      id: 'cur-off-1',
      title: 'Celebrity fashion tour dominates red carpet chatter',
      note: 'Streaming gossip and wellness trends lead the day',
      isCurated: true,
    });

    expect(out.missionScope.scopeState).toBe('off_topic');
    expect(out.allowOnNewswire).toBe(false);
    expect(out.allowOnHomepageBriefing).toBe(false);
  });
});

describe('newswire filtering preserves recency, dedupe, and diversity behavior', () => {
  it('filters first, then dedupes and picks a diverse top set by recency', () => {
    const filtered = filterMissionSafeNewswireStories([
      {
        id: 'sports-1',
        url: 'https://example.test/sports-1',
        title: 'NFL mock draft dominates sports talk',
        excerpt: 'Quarterback debate leads the day',
        sourceSlug: 'sportswire',
        publishedAt: iso(0.5),
      },
      {
        id: 'dup-old',
        url: 'https://example.test/live-story?utm_source=rss',
        title: 'Senate oversight hearing expands',
        excerpt: 'Older duplicate item',
        sourceSlug: 'ap',
        publishedAt: iso(6),
      },
      {
        id: 'dup-new',
        url: 'https://example.test/live-story',
        title: 'Senate oversight hearing expands again',
        excerpt: 'Newer duplicate item',
        sourceSlug: 'reuters',
        publishedAt: iso(1),
      },
      {
        id: 'second-ap',
        url: 'https://example.test/ap-second',
        title: 'Breaking: explosion prompts emergency response',
        excerpt: 'Authorities investigate downtown blast',
        sourceSlug: 'ap',
        publishedAt: iso(2),
      },
      {
        id: 'third-source',
        url: 'https://example.test/third-source',
        title: 'Ukraine reports new drone strike on Kyiv',
        excerpt: 'War update remains fluid',
        sourceSlug: 'bbc',
        publishedAt: iso(3),
      },
    ]);

    const deduped = dedupeStoriesByCanonicalUrl(filtered);
    const out = pickDiverseTopStories(deduped, 3, 1);

    expect(deduped.map((story) => story.id)).toEqual(['dup-new', 'second-ap', 'third-source']);
    expect(out.map((story) => story.id)).toEqual(['dup-new', 'second-ap', 'third-source']);
    expect(out.every((story) => story.missionScope.scopeState !== 'off_topic')).toBe(true);
  });
});
