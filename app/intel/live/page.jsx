import { permanentRedirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Live Resistance Briefing',
  description:
    'Live accountability briefing tracking democratic backsliding, corruption, surveillance, courts, and related resistance-watch stories.',
  urlPath: '/intel/live',
});

/** Legacy Intel landing now forwards to the default Telescreen surface. */
export default function IntelLiveRedirectPage() {
  permanentRedirect('/telescreen');
}
