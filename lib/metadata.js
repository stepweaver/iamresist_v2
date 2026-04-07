/**
 * Build standardized page metadata.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} [options.urlPath]
 * @returns {Object} metadata object for Next.js
 */
export function buildPageMetadata({ title, description, urlPath = '' }) {
  const fullUrl = `https://iamresist.org${urlPath}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: fullUrl,
      siteName: 'I AM [RESIST]',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
