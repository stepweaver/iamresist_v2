import { permanentRedirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Independent Voices and Creator Commentary',
  description:
    'Archive of independent voices, commentary, curated video, and protest music from the resistance media ecosystem.',
  urlPath: '/voices',
});

/** @deprecated Use `/telescreen`. Preserves query string for bookmarks. */
export default async function VoicesLegacyRedirect({ searchParams }) {
  const params = typeof searchParams?.then === 'function' ? await searchParams : searchParams ?? {};
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) q.append(key, String(v));
    } else {
      q.set(key, String(value));
    }
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  permanentRedirect(`/telescreen${suffix}`);
}
