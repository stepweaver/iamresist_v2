import { permanentRedirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Resistance Intel Desk',
  description:
    'Resistance intel hub linking live briefings, newswire, OSINT, watchdog reporting, sources, and creator commentary.',
  urlPath: '/intel',
});

/** Intel hub: default surface is Telescreen. */
export default function IntelRedirectPage() {
  permanentRedirect('/telescreen');
}
