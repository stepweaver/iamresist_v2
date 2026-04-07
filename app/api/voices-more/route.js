import { NextResponse } from 'next/server';
import { getAllVoices } from '@/lib/notion/voices.repo';
import { fetchFeedItems } from '@/lib/feeds/rss';

export const revalidate = 300;

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

  // Curated/protest-music buckets are intentionally inert in rebuild until their data sources exist.
  if (bucket) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  if (!slug) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  try {
    const voices = await getAllVoices({ limit: 120 });
    const voice = (voices || []).find((v) => v.slug === slug);
    if (!voice?.feedUrl) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const items = await fetchFeedItems(voice.feedUrl, {
      limit: 15,
      tags: ['voices-more', `voice-more:${slug}`],
    });

    return NextResponse.json(
      { items: (items || []).map((it) => toFeedItem(it, voice)) },
      { status: 200 },
    );
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/voices-more]', err);
    }
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
