import { permanentRedirect } from 'next/navigation';

/** Retired Intel Voices desk. Preserves query string for bookmarks that pointed at Telescreen filters. */
export default async function IntelVoicesRedirectPage({ searchParams }) {
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
