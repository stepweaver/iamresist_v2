import { permanentRedirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Official Statements and Public Messaging',
  description:
    'Official statements, speeches, and public messaging gathered for accountability context across the resistance intel lanes.',
  urlPath: '/intel/statements',
});

export default function IntelStatementsRedirect() {
  permanentRedirect('/intel');
}
