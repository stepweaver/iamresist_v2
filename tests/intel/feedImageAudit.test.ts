import { describe, expect, it } from 'vitest';
import {
  buildFeedImageAuditRow,
  inspectImageQuality,
} from '@/lib/feeds/feedImageAudit.shared';

describe('feedImageAudit', () => {
  it('flags tiny Haaretz thumbs as low quality', () => {
    const quality = inspectImageQuality(
      'https://img.haarets.co.il/bs/00000196/sample.jpg?width=108&height=81',
      'haaretz',
    );

    expect(quality.looksLowQuality).toBe(true);
    expect(quality.reason).toBe('tiny_haaretz_rss_thumb');
  });

  it('recommends OG backfill when a tiny skipped feed image has a usable OG image', () => {
    const row = buildFeedImageAuditRow({
      kind: 'newswire',
      title: 'Test story',
      source: 'Haaretz',
      sourceSlug: 'haaretz',
      desk: 'newswire',
      canonicalUrl: 'https://www.haaretz.com/israel-news/2026-04-17/story',
      currentFinalImageUrl: null,
      feedAuditMatch: {
        imageAudit: {
          firstCandidate: {
            resolvedUrl: 'https://img.haarets.co.il/bs/00000196/sample.jpg?width=108&height=81',
          },
          acceptedCandidate: null,
          skippedByPolicy: true,
          skipReason: 'tiny_haaretz_rss_thumb',
        },
      },
      articleProbe: {
        articleUrl: 'https://www.haaretz.com/israel-news/2026-04-17/story',
        fetchOk: true,
        fetchStatus: 200,
        fetchErrorCategory: null,
        finalUrl: 'https://www.haaretz.com/israel-news/2026-04-17/story',
        ogImageUrl: 'https://img.haarets.co.il/bs/00000196/hero.jpg?width=1200',
        articleImageUrl: 'https://img.haarets.co.il/bs/00000196/hero.jpg?width=1200',
        articleImageCandidates: ['https://img.haarets.co.il/bs/00000196/hero.jpg?width=1200'],
      },
    });

    expect(row.ogImageAvailable).toBe(true);
    expect(row.recommendedAction).toBe('enable_og_backfill');
  });

  it('recommends source-specific extraction when article HTML has an image but OG is absent', () => {
    const row = buildFeedImageAuditRow({
      kind: 'newswire',
      title: 'Test story',
      source: 'Al Jazeera',
      sourceSlug: 'al-jazeera',
      desk: 'newswire',
      canonicalUrl: 'https://www.aljazeera.com/news/2026/04/17/story',
      currentFinalImageUrl: null,
      feedAuditMatch: null,
      articleProbe: {
        articleUrl: 'https://www.aljazeera.com/news/2026/04/17/story',
        fetchOk: true,
        fetchStatus: 200,
        fetchErrorCategory: null,
        finalUrl: 'https://www.aljazeera.com/news/2026/04/17/story',
        ogImageUrl: null,
        articleImageUrl: 'https://www.aljazeera.com/wp-content/uploads/2026/04/hero.jpg',
        articleImageCandidates: ['https://www.aljazeera.com/wp-content/uploads/2026/04/hero.jpg'],
      },
    });

    expect(row.articleImageAvailable).toBe(true);
    expect(row.recommendedAction).toBe('add_source_specific_rule');
  });
});
