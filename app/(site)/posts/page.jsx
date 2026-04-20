import { redirect } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Posts',
  description: 'Resistance journal entries and reflections.',
  urlPath: '/posts',
});

export default function PostsPage() {
  redirect('/journal');
}
