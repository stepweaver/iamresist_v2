import 'server-only';

import { siteEnv } from '@/lib/env/site';

const BASE_URL = siteEnv.BASE_URL;
const SITE_NAME = 'I AM [RESIST]';

/** Default logo/fallback image for non-video pages */
export const defaultOgImage = {
  url: '/resist_sticker.png',
  width: 1200,
  height: 1200,
  alt: `${SITE_NAME} - The flag of resistance`,
};

/** Build full Open Graph image entries. For video pages, pass video thumbnail first. */
export function buildOgImages(videoThumbnailUrl = null) {
  const images = [];
  if (videoThumbnailUrl) {
    images.push({
      url: videoThumbnailUrl,
      width: 1280,
      height: 720,
      alt: 'Video preview',
    });
  }
  images.push(defaultOgImage);
  return images;
}

/** YouTube thumbnail URL — maxresdefault; logo used as fallback */
export function youtubeOgImage(videoId) {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/** Build metadata for curated video detail pages */
export function buildVideoMetadata({ title, description, videoId, urlPath }) {
  const ogImages = buildOgImages(youtubeOgImage(videoId));
  const pageTitle = `${title || 'Video'} | Curated | ${SITE_NAME}`;
  const desc = description?.slice(0, 160) || title || 'Curated video from I AM [RESIST]';
  const canonicalUrl = `${BASE_URL}${urlPath}`;

  return {
    title: pageTitle,
    description: desc,
    openGraph: {
      title: pageTitle,
      description: desc,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: ogImages.map((img) =>
        img.url.startsWith('http') ? img.url : `${BASE_URL}${img.url}`
      ),
    },
  };
}

/** Build metadata for protest song detail pages */
export function buildSongMetadata({ title, artist, description, videoId, urlPath }) {
  const ogImages = buildOgImages(youtubeOgImage(videoId));
  const displayTitle = artist ? `${title} — ${artist}` : title || 'Protest Song';
  const pageTitle = `${displayTitle} | Protest Music | ${SITE_NAME}`;
  const desc = description?.slice(0, 160) || displayTitle || 'Protest music from I AM [RESIST]';
  const canonicalUrl = `${BASE_URL}${urlPath}`;

  return {
    title: pageTitle,
    description: desc,
    openGraph: {
      title: pageTitle,
      description: desc,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: ogImages.map((img) =>
        img.url.startsWith('http') ? img.url : `${BASE_URL}${img.url}`
      ),
    },
  };
}

/**
 * Build standardized page metadata.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} [options.urlPath]
 * @param {Array} [options.images] — optional OG images (defaults to sticker)
 */
export function buildPageMetadata({ title, description, urlPath = '', images = null }) {
  const ogImages = images || [defaultOgImage];
  const pageTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${BASE_URL}${urlPath}`;
  const desc = description || (typeof title === 'string' ? title.split('|')[0].trim() : '');

  return {
    title: pageTitle,
    description: desc,
    openGraph: {
      title: pageTitle,
      description: desc,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: ogImages.map((img) =>
        typeof img === 'string'
          ? img
          : img.url.startsWith('http')
            ? img.url
            : `${BASE_URL}${img.url}`
      ),
    },
  };
}

export { BASE_URL, SITE_NAME };
