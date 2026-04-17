import { getFeedImageSkipReason } from '@/lib/feeds/feedItemImage.js';
import { isTinyHaaretzRssThumb } from '@/lib/feeds/newswireImage';

export type AuditAction =
  | 'keep_text_only'
  | 'allow_feed_image'
  | 'upgrade_feed_image'
  | 'enable_og_backfill'
  | 'add_source_specific_rule'
  | 'investigate_fetch_block';

export type SurfaceKind = 'newswire' | 'intel' | 'voices';

export type ArticleProbeShape = {
  articleUrl: string | null;
  fetchOk: boolean;
  fetchStatus: number | null;
  fetchErrorCategory: string | null;
  ogImageUrl: string | null;
  articleImageUrl: string | null;
};

export type FeedAuditMatchShape = {
  image?: string | null;
  imageAudit?: {
    firstCandidate?: {
      resolvedUrl?: string | null;
    } | null;
    skippedByPolicy?: boolean;
    skipReason?: string | null;
    acceptedCandidate?: {
      resolvedUrl?: string | null;
      finalUrl?: string | null;
    } | null;
    youtubeFallbackImage?: string | null;
  } | null;
};

export type FeedImageAuditRow = {
  kind: SurfaceKind;
  title: string;
  source: string;
  sourceSlug: string;
  desk: string;
  canonicalUrl: string;
  currentFinalImageUrl: string | null;
  feedNativeImageUrl: string | null;
  feedAcceptedImageUrl: string | null;
  imageSkippedByPolicy: boolean;
  skipReason: string | null;
  ogImageAvailable: boolean;
  ogImageUrl: string | null;
  ogImageSkippedByPolicy: boolean;
  ogSkipReason: string | null;
  ogLooksLowQuality: boolean;
  ogLowQualityReason: string | null;
  articleImageAvailable: boolean;
  articleImageUrl: string | null;
  articleImageSkippedByPolicy: boolean;
  articleImageSkipReason: string | null;
  articleFetchOk: boolean;
  articleFetchStatus: number | null;
  articleFetchErrorCategory: string | null;
  finalImageLooksLowQuality: boolean;
  finalImageLowQualityReason: string | null;
  recommendedAction: AuditAction;
};

export function inspectImageQuality(
  url: string | null | undefined,
  sourceSlug?: string | null,
): { looksLowQuality: boolean; reason: string | null } {
  if (!url || typeof url !== 'string') {
    return { looksLowQuality: false, reason: null };
  }

  if (isTinyHaaretzRssThumb(url, sourceSlug || undefined)) {
    return { looksLowQuality: true, reason: 'tiny_haaretz_rss_thumb' };
  }

  try {
    const parsed = new URL(url);
    const width = parseInt(
      parsed.searchParams.get('width') ||
        parsed.searchParams.get('w') ||
        parsed.searchParams.get('max_width') ||
        '0',
      10,
    );
    const height = parseInt(
      parsed.searchParams.get('height') || parsed.searchParams.get('h') || '0',
      10,
    );
    if (width > 0 && width <= 480) {
      return { looksLowQuality: true, reason: `width_${width}` };
    }
    if (height > 0 && height <= 360) {
      return { looksLowQuality: true, reason: `height_${height}` };
    }

    const pathname = parsed.pathname.toLowerCase();
    if (
      pathname.includes('/thumbnail') ||
      pathname.includes('/thumb/') ||
      pathname.includes('/small/') ||
      pathname.includes('_small.') ||
      pathname.includes('-small.')
    ) {
      return { looksLowQuality: true, reason: 'thumbnail_path' };
    }
  } catch {
    return { looksLowQuality: false, reason: null };
  }

  return { looksLowQuality: false, reason: null };
}

function pickRecommendedAction(input: {
  currentFinalImageUrl: string | null;
  feedNativeImageUrl: string | null;
  feedAcceptedImageUrl: string | null;
  imageSkippedByPolicy: boolean;
  skipReason: string | null;
  ogImageAvailable: boolean;
  ogLooksLowQuality: boolean;
  articleImageAvailable: boolean;
  articleFetchErrorCategory: string | null;
}): AuditAction {
  if (input.currentFinalImageUrl) {
    if (input.feedNativeImageUrl && !input.feedAcceptedImageUrl) return 'upgrade_feed_image';
    return 'keep_text_only';
  }
  if (input.articleFetchErrorCategory === 'http_403' || input.articleFetchErrorCategory === 'timeout') {
    return 'investigate_fetch_block';
  }
  if (input.feedAcceptedImageUrl) return 'allow_feed_image';
  if (input.imageSkippedByPolicy && input.skipReason?.includes('tiny')) {
    if (input.ogImageAvailable && !input.ogLooksLowQuality) return 'enable_og_backfill';
    return 'upgrade_feed_image';
  }
  if (input.ogImageAvailable && !input.ogLooksLowQuality) return 'enable_og_backfill';
  if (input.articleImageAvailable) return 'add_source_specific_rule';
  return 'keep_text_only';
}

export function buildFeedImageAuditRow(input: {
  kind: SurfaceKind;
  title: string;
  source: string;
  sourceSlug: string;
  desk: string;
  canonicalUrl: string;
  currentFinalImageUrl: string | null;
  feedAuditMatch: FeedAuditMatchShape | null;
  articleProbe: ArticleProbeShape;
}): FeedImageAuditRow {
  const feedNativeImageUrl = input.feedAuditMatch?.imageAudit?.firstCandidate?.resolvedUrl ?? null;
  const feedAcceptedImageUrl = input.feedAuditMatch?.imageAudit?.acceptedCandidate?.finalUrl ?? null;
  const imageSkippedByPolicy = Boolean(input.feedAuditMatch?.imageAudit?.skippedByPolicy);
  const skipReason = input.feedAuditMatch?.imageAudit?.skipReason ?? null;

  const ogRaw = input.articleProbe?.ogImageUrl ?? null;
  const ogSkipReason = ogRaw ? getFeedImageSkipReason(ogRaw) : null;
  const ogImageAvailable = Boolean(ogRaw && !ogSkipReason);
  const ogQuality = inspectImageQuality(ogRaw, input.sourceSlug);

  const articleRaw = input.articleProbe?.articleImageUrl ?? null;
  const articleImageSkipReason = articleRaw ? getFeedImageSkipReason(articleRaw) : null;
  const articleImageAvailable = Boolean(articleRaw && !articleImageSkipReason);

  const finalQuality = inspectImageQuality(input.currentFinalImageUrl, input.sourceSlug);

  return {
    kind: input.kind,
    title: input.title,
    source: input.source,
    sourceSlug: input.sourceSlug,
    desk: input.desk,
    canonicalUrl: input.canonicalUrl,
    currentFinalImageUrl: input.currentFinalImageUrl,
    feedNativeImageUrl,
    feedAcceptedImageUrl,
    imageSkippedByPolicy,
    skipReason,
    ogImageAvailable,
    ogImageUrl: ogRaw,
    ogImageSkippedByPolicy: Boolean(ogRaw && ogSkipReason),
    ogSkipReason,
    ogLooksLowQuality: ogQuality.looksLowQuality,
    ogLowQualityReason: ogQuality.reason,
    articleImageAvailable,
    articleImageUrl: articleRaw,
    articleImageSkippedByPolicy: Boolean(articleRaw && articleImageSkipReason),
    articleImageSkipReason,
    articleFetchOk: Boolean(input.articleProbe?.fetchOk),
    articleFetchStatus: input.articleProbe?.fetchStatus ?? null,
    articleFetchErrorCategory: input.articleProbe?.fetchErrorCategory ?? null,
    finalImageLooksLowQuality: finalQuality.looksLowQuality,
    finalImageLowQualityReason: finalQuality.reason,
    recommendedAction: pickRecommendedAction({
      currentFinalImageUrl: input.currentFinalImageUrl,
      feedNativeImageUrl,
      feedAcceptedImageUrl,
      imageSkippedByPolicy,
      skipReason,
      ogImageAvailable,
      ogLooksLowQuality: ogQuality.looksLowQuality,
      articleImageAvailable,
      articleFetchErrorCategory: input.articleProbe?.fetchErrorCategory ?? null,
    }),
  };
}
