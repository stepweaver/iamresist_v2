import { NextResponse } from 'next/server';
import { getVoiceBySlug } from '@/lib/notion/voices.repo';
import { fetchFeedItems } from '@/lib/feeds/rss';
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
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim().toLowerCase();
  const bucket = (searchParams.get('bucket') || '').trim().toLowerCase();

  if (bucket === 'curated') {
    try {
      const videos = await getVideos({ limit: 24 });
      const items = (videos || []).map(curatedVideoToFeedItem).filter(Boolean);
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
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const items = await fetchFeedItems(voice.feedUrl, {
      limit: 15,
      tags: ['voices-more', `voice-more:${slug}`],
    });

    return NextResponse.json(
      {
        items: (items || []).map((it) => toFeedItem(it, voice)),
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
