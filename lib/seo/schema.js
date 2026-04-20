import { BASE_URL, SITE_NAME, defaultOgImage } from '@/lib/metadata';

function absoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value), BASE_URL).toString();
  } catch {
    return null;
  }
}

function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === 'string') return absoluteUrl(image);
  if (typeof image === 'object' && image.url) return absoluteUrl(image.url);
  return null;
}

function normalizeImages(images) {
  const list = (Array.isArray(images) ? images : [images])
    .map(normalizeImage)
    .filter(Boolean);

  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : list;
}

function buildOrganizationIdentity({
  name = SITE_NAME,
  url = BASE_URL,
  logo = defaultOgImage,
  description,
} = {}) {
  const resolvedUrl = absoluteUrl(url);
  const resolvedLogo = normalizeImage(logo);

  return {
    '@type': 'Organization',
    name,
    ...(resolvedUrl ? { url: resolvedUrl } : {}),
    ...(resolvedLogo ? { logo: resolvedLogo } : {}),
    ...(description ? { description } : {}),
  };
}

export function buildOrganizationSchema(options = {}) {
  return {
    '@context': 'https://schema.org',
    ...buildOrganizationIdentity(options),
  };
}

export function buildWebSiteSchema({
  name = SITE_NAME,
  url = BASE_URL,
  description,
  publisher,
} = {}) {
  const resolvedUrl = absoluteUrl(url);

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    ...(resolvedUrl ? { url: resolvedUrl } : {}),
    ...(description ? { description } : {}),
    publisher: buildOrganizationIdentity(publisher),
  };
}

export function buildBreadcrumbListSchema(items = []) {
  const itemListElement = items
    .map((item, index) => {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const url = absoluteUrl(item?.url);

      if (!name || !url) return null;

      return {
        '@type': 'ListItem',
        position: index + 1,
        name,
        item: url,
      };
    })
    .filter(Boolean);

  if (itemListElement.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  };
}

export function buildArticleSchema({
  type = 'Article',
  headline,
  description,
  url,
  image,
  datePublished,
  dateModified,
  publisher,
} = {}) {
  const resolvedUrl = absoluteUrl(url);
  const resolvedImage = normalizeImages(image);

  return {
    '@context': 'https://schema.org',
    '@type': type,
    headline,
    ...(description ? { description } : {}),
    ...(resolvedUrl
      ? {
          url: resolvedUrl,
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': resolvedUrl,
          },
        }
      : {}),
    ...(resolvedImage ? { image: resolvedImage } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    publisher: buildOrganizationIdentity(publisher),
  };
}

export function buildNewsArticleSchema(options = {}) {
  return buildArticleSchema({ ...options, type: 'NewsArticle' });
}

export function buildBookSchema({
  name,
  description,
  url,
  image,
  author,
} = {}) {
  const resolvedUrl = absoluteUrl(url);
  const resolvedImage = normalizeImages(image);

  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name,
    ...(description ? { description } : {}),
    ...(resolvedUrl ? { url: resolvedUrl } : {}),
    ...(resolvedImage ? { image: resolvedImage } : {}),
    ...(author
      ? {
          author: {
            '@type': 'Person',
            name: author,
          },
        }
      : {}),
  };
}

export function buildProductSchema({
  name,
  description,
  url,
  image,
  brandName = SITE_NAME,
  offers,
} = {}) {
  const resolvedUrl = absoluteUrl(url);
  const resolvedImage = normalizeImages(image);
  const hasCompleteOffer =
    offers &&
    typeof offers.price === 'number' &&
    offers.priceCurrency &&
    offers.availability;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    ...(description ? { description } : {}),
    ...(resolvedUrl ? { url: resolvedUrl } : {}),
    ...(resolvedImage ? { image: resolvedImage } : {}),
    ...(brandName
      ? {
          brand: {
            '@type': 'Brand',
            name: brandName,
          },
        }
      : {}),
    ...(hasCompleteOffer
      ? {
          offers: {
            '@type': 'Offer',
            price: offers.price,
            priceCurrency: offers.priceCurrency,
            availability: offers.availability,
            ...(resolvedUrl ? { url: resolvedUrl } : {}),
          },
        }
      : {}),
  };
}
