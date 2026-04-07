import 'server-only';

import { unstable_cache } from 'next/cache';
import { notion } from '@/lib/notion/client';

function extractTextFromBlock(block) {
  if (!block || !block.type) return '';

  const type = block.type;
  const content = block[type];

  if (content?.rich_text && Array.isArray(content.rich_text)) {
    return content.rich_text.map((t) => t.plain_text || '').join('').trim();
  }

  switch (type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'quote':
    case 'callout':
    case 'code':
      if (content?.rich_text) {
        return content.rich_text.map((t) => t.plain_text || '').join('').trim();
      }
      break;
    default:
      if (content?.text) return content.text;
      if (content?.title) return content.title;
      break;
  }
  return '';
}

export async function getPageEditorialBody(pageId) {
  if (!notion) return '';
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    const textParts = [];
    for (const block of response.results || []) {
      const text = extractTextFromBlock(block);
      if (text) textParts.push(text);
    }

    return textParts.join('\n\n').trim();
  } catch {
    return '';
  }
}

export function getCachedDescription(pageId) {
  return unstable_cache(
    () => getPageEditorialBody(pageId),
    ['notion-page-description', pageId],
    { revalidate: 60 * 60 * 24 }
  )();
}

export const EDITORIAL_SIGNATURE = '- [RESIST]';

export async function enrichProtestMusicWithDescriptions(songs) {
  if (!songs?.length) return songs;

  try {
    const out = await Promise.all(
      songs.map(async (song) => {
        const body = await getCachedDescription(song.id);
        const description = body ? `${body}\n\n${EDITORIAL_SIGNATURE}` : '';
        return { ...song, description };
      })
    );

    return out;
  } catch {
    return songs;
  }
}

export async function enrichVideosWithDescriptions(videos) {
  if (!videos?.length) return videos;

  try {
    const out = await Promise.all(
      videos.map(async (video) => {
        const body = await getCachedDescription(video.id);
        const description = body ? `${body}\n\n${EDITORIAL_SIGNATURE}` : '';
        return { ...video, description };
      })
    );

    return out;
  } catch {
    return videos;
  }
}
