const DEFAULT_BASE_URL = 'https://www.iamresist.org';

export function normalizeBaseUrl(rawUrl) {
  const fallback = new URL(DEFAULT_BASE_URL);
  try {
    const parsed = new URL(String(rawUrl || DEFAULT_BASE_URL));
    if (parsed.hostname === 'iamresist.org') {
      parsed.hostname = 'www.iamresist.org';
    }
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback.toString().replace(/\/$/, '');
  }
}

export function getCanonicalBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL);
}

export const canonicalBaseUrl = getCanonicalBaseUrl();
