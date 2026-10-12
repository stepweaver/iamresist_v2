// Protest Music DB (NOTION_PROTEST_MUSIC_DB_ID) — parity with source iamresist.
import 'server-only';

import { notion } from '@/lib/notion/client';
import { paginate } from '@/lib/notion/paginate';
import { notionEnv } from '@/lib/env/notion';
import { normalizeNotionDatabaseId } from '@/lib/notion/notionIds';
import { slugify as slugifyTitle } from '@/lib/utils/slugify';
import { unstable_cache } from 'next/cache';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import { assertUpstreamAvailable, noteUpstreamFailure } from '@/lib/feeds/sharedFailureBackoff';

function getProtestMusicDbId() {
  const id = notionEnv.NOTION_PROTEST_MUSIC_DB_ID;
  if (!id) return null;
  return normalizeNotionDatabaseId(id);
}

function textFromRichText(rt) {
  return (rt?.rich_text ?? []).map((t) => t.plain_text).join('').trim();
}

function titleFromTitleProp(tp) {
  return tp?.title?.[0]?.plain_text ?? '';
}

function mapSong(page) {
  const p = page.properties;
  const title = titleFromTitleProp(p.Title);
  const artist = textFromRichText(p.Artist) || p.Artist?.select?.name || 'Unknown';
  const url = p['Song URL']?.url ?? null;
  const artistChannelUrl = p['Artist Channel URL']?.url ?? null;

  return {
    id: page.id,
    title,
    artist: artist || 'Unknown',
    slug: slugifyTitle(artist),
    songSlug: slugifyTitle(title),
    url,
    artistChannelUrl,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

/** Latest song by created_time (for optional homepage use). */
export async function getLatestProtestSong() {
  if (!notion) return null;
  const dbId = getProtestMusicDbId();
  if (!dbId) return null;
  try {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size: 1,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });
    const page = res.results?.[0];
    if (!page) return null;
    const song = mapSong(page);
    return song.url ? song : null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[getLatestProtestSong]', e);
    return null;
  }
}

export async function getAllProtestSongs({ limit, throwOnError = false } = {}) {
  if (!notion) return [];
  const dbId = getProtestMusicDbId();
  if (!dbId) return [];

  try {
    const query = (cursor) =>
      notion.databases.query({
        database_id: dbId,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });

    const pages = limit ? await paginate(query, { limit }) : await paginate(query);
    return pages.map(mapSong).filter((s) => s.url);
  } catch (e) {
    if (throwOnError) throw e;
    if (process.env.NODE_ENV === 'development') console.error('[getAllProtestSongs]', e);
    return [];
  }
}

function artistsFromSongs(songs) {
  const bySlug = new Map();
  for (const s of songs) {
    if (!s.artist) continue;
    const slug = slugifyTitle(s.artist);
    if (!bySlug.has(slug)) bySlug.set(slug, { title: s.artist, slug });
  }
  return Array.from(bySlug.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export async function getProtestMusicArtists({ limit = 300 } = {}) {
  const songs = await getAllProtestSongs({ limit });
  return artistsFromSongs(songs);
}

/** Derived artist dropdown. Avoids re-reading the song pages on every Telescreen render. */
const protestArtistsCooldown = createFailureCooldown();

export const getProtestMusicArtistsCached = unstable_cache(
  async () => {
    await assertUpstreamAvailable(protestArtistsCooldown, 'protest-music-artists');
    try {
      const songs = await getAllProtestSongs({ limit: 400, throwOnError: true });
      protestArtistsCooldown.clear();
      return artistsFromSongs(songs);
    } catch (err) {
      if (isUpstreamFailure(err)) throw err;
      console.warn('[protest-music] artist directory failed; not caching an empty list');
      const failure = upstreamFailure('protest-music-artists');
      await noteUpstreamFailure(protestArtistsCooldown, 'protest-music-artists', { tags: ['protest-music'] });
      throw failure;
    }
  },
  ['protest-music-artists-v1'],
  { revalidate: 300, tags: ['protest-music'] },
);
