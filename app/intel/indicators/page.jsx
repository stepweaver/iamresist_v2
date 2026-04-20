import { permanentRedirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Democracy Indicators and Warning Signs',
  description:
    'Reference lane for democracy indicators, warning signs, and accountability markers used to track authoritarian drift.',
  urlPath: '/intel/indicators',
});

export default function IntelIndicatorsRedirect() {
  permanentRedirect('/resources');
}
