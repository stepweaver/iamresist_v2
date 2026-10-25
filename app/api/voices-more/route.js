import { NextResponse } from 'next/server';
import { getVoiceBySlug } from '@/lib/notion/voices.repo';
import { rateLimitedResponse } from '@/lib/server/rateLimit';
import { isInvalidFeedFetchReason, isVerifiedArchiveVideo } from '@/lib/feeds/archiveMedia';
import { fetchFeedItemsWithMeta } from '@/lib/feeds/rss';
import { TELESCREEN_FEED_STATUS } from '@/lib/telescreen';
import { getVideos } from '@/lib/notion/videos.repo';
import { slugify } from '@/lib/utils/slugify';

export const revalidate = 300;

const CURATED_VOICE = {
  id: 'curated-videos',
  title: 'Curated Videos',
  slug: 'curated-videos',
  homeUrl: null,
  platform: 'YouTube',
};

function curatedVideoToFeedItem(video) {
  if (!video?.url) return null;
  return {
    id: `curated-${video.id}`,
    sourceId: video.id,
    title: video.title,
    url: video.url,
    publishedAt: video.dateAdded || video.createdTime || null,
    createdTime: video.createdTime ?? null,
    sourceType: 'curated-videos',
    voice: { ...CURATED_VOICE, platform: video.platform || 'YouTube' },
    description: '',
    slug: slugify(video.title),
    isCurated: true,
  };
}

function toFeedItem(raw, voice) {
  return {
    ...raw,
    sourceType: 'voices',
    voice: {
      id: voice.id,
      title: voice.title,
      slug: voice.slug,
      homeUrl: voice.homeUrl,
      platform: voice.platform,
    },
  };
}

export async function GET(request) {
  const limited = rateLimitedResponse('voices-more', request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim().toLowerCase();
  const bucket = (searchParams.get('bucket') || '').trim().toLowerCase();

  if (bucket === 'curated') {
    try {
      const videos = await getVideos({ limit: 24 });
      const items = (videos || [])
        .map(curatedVideoToFeedItem)
        .filter((item) => item && isVerifiedArchiveVideo(item));
      return NextResponse.json(
        { items },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
      );
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('[api/voices-more curated]', err);
      return NextResponse.json({ items: [] }, { status: 200 });
    }
  }

  if (!slug) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  try {
    // Full Notion pagination (same as production) — do not use getAllVoices({ limit: N });
    // a capped query only returns the first page and misses voices like later alphabetically.
    const voice = await getVoiceBySlug(slug);
    if (!voice?.feedUrl) {
      return NextResponse.json({ items: [], feedStatus: TELESCREEN_FEED_STATUS.invalid }, { status: 200 });
    }

    const result = await fetchFeedItemsWithMeta(voice.feedUrl, {
      limit: 15,
      tags: ['voices-more', `voice-more:${slug}`],
    });
    const items = (result.items || []).map((it) => toFeedItem(it, voice)).filter(isVerifiedArchiveVideo);
    if (!result.ok && items.length === 0) {
      const feedStatus = isInvalidFeedFetchReason(result.reason)
        ? TELESCREEN_FEED_STATUS.invalid
        : TELESCREEN_FEED_STATUS.unavailable;
      return NextResponse.json(
        { items: [], feedStatus },
        { status: feedStatus === TELESCREEN_FEED_STATUS.invalid ? 200 : 503 }
      );
    }

    return NextResponse.json(
      {
        items,
        feedStatus: items.length ? TELESCREEN_FEED_STATUS.ok : TELESCREEN_FEED_STATUS.empty,
      },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/voices-more]', err);
    }
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
