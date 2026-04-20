import 'server-only';

import { siteEnv } from '@/lib/env/site';
import { joinSeoDescriptionParts, pickSeoDescription } from '@/lib/seo/text';

const BASE_URL = siteEnv.BASE_URL;
const SITE_NAME = 'I AM [RESIST]';

function normalizeUrlPath(urlPath) {
  if (typeof urlPath !== 'string') return null;
  const trimmed = urlPath.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildCanonicalData(urlPath) {
  const canonicalPath = normalizeUrlPath(urlPath);
  if (!canonicalPath) {
    return { canonicalPath: null, canonicalUrl: null };
  }

  return {
    canonicalPath,
    canonicalUrl: `${BASE_URL}${canonicalPath}`,
  };
}

function buildPageTitle(title) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedTitle) return SITE_NAME;
  return normalizedTitle.includes(SITE_NAME)
    ? normalizedTitle
    : `${normalizedTitle} | ${SITE_NAME}`;
}

function buildTwitterImages(images) {
  return images.map((img) => {
    if (typeof img === 'string') {
      return img.startsWith('http') ? img : `${BASE_URL}${img}`;
    }

    return img.url.startsWith('http') ? img.url : `${BASE_URL}${img.url}`;
  });
}

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

/** YouTube thumbnail URL - maxresdefault; logo used as fallback */
export function youtubeOgImage(videoId) {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/** Build metadata for curated video detail pages */
export function buildVideoMetadata({ title, description, videoId, urlPath }) {
  const ogImages = buildOgImages(youtubeOgImage(videoId));
  const pageTitle = `${title || 'Video'} | Curated | ${SITE_NAME}`;
  const desc = pickSeoDescription(
    [
      description,
      title ? `${title} with editorial context from I AM [RESIST].` : '',
    ],
    'Curated video with editorial context from I AM [RESIST].',
    180,
  );
  const { canonicalPath, canonicalUrl } = buildCanonicalData(urlPath);

  return {
    title: pageTitle,
    description: desc,
    alternates: canonicalPath
      ? {
          canonical: canonicalPath,
        }
      : undefined,
    openGraph: {
      title: pageTitle,
      description: desc,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: buildTwitterImages(ogImages),
    },
  };
}

/** Build metadata for protest song detail pages */
export function buildSongMetadata({ title, artist, description, videoId, urlPath }) {
  const ogImages = buildOgImages(youtubeOgImage(videoId));
  const displayTitle = artist ? `${title} - ${artist}` : title || 'Protest Song';
  const pageTitle = `${displayTitle} | Protest Music | ${SITE_NAME}`;
  const desc = pickSeoDescription(
    [
      description,
      displayTitle ? `${displayTitle} with editorial context from I AM [RESIST].` : '',
    ],
    'Protest music with editorial context from I AM [RESIST].',
    180,
  );
  const { canonicalPath, canonicalUrl } = buildCanonicalData(urlPath);

  return {
    title: pageTitle,
    description: desc,
    alternates: canonicalPath
      ? {
          canonical: canonicalPath,
        }
      : undefined,
    openGraph: {
      title: pageTitle,
      description: desc,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: buildTwitterImages(ogImages),
    },
  };
}

/**
 * Build standardized page metadata.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} [options.urlPath]
 * @param {Array} [options.images] - optional OG images (defaults to sticker)
 */
export function buildPageMetadata({ title, description, urlPath, images = null }) {
  const ogImages = images || [defaultOgImage];
  const pageTitle = buildPageTitle(title);
  const desc = description || (typeof title === 'string' ? title.split('|')[0].trim() : '');
  const { canonicalPath, canonicalUrl } = buildCanonicalData(urlPath);

  return {
    title: pageTitle,
    description: desc,
    alternates: canonicalPath
      ? {
          canonical: canonicalPath,
        }
      : undefined,
    openGraph: {
      title: pageTitle,
      description: desc,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      siteName: SITE_NAME,
      images: ogImages,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
      images: buildTwitterImages(ogImages),
    },
  };
}

/**
 * Build product detail metadata for shop pages.
 * Uses the product image instead of the site fallback image.
 */
export function buildProductMetadata({
  name,
  tagline,
  description,
  urlPath,
  image,
  imageAlt,
  price,
  keywords = [],
}) {
  const metaDescription = joinSeoDescriptionParts(
    [
      tagline,
      description,
      typeof price === 'number' ? `Starting at $${price.toFixed(2)}.` : null,
    ],
    220,
  );

  const images = [
    image
      ? {
          url: image,
          width: 1200,
          height: 1200,
          alt: imageAlt || name || 'Product image',
        }
      : defaultOgImage,
  ];

  return {
    ...buildPageMetadata({
      title: `${name} | Shop`,
      description: metaDescription,
      urlPath,
      images,
    }),
    keywords: [
      name,
      tagline,
      'vinyl sticker',
      'political sticker',
      'resistance sticker',
      'I AM [RESIST]',
      ...keywords,
    ].filter(Boolean),
    other:
      typeof price === 'number'
        ? {
            'product:price:amount': price.toFixed(2),
            'product:price:currency': 'USD',
          }
        : undefined,
  };
}

export { BASE_URL, SITE_NAME };
