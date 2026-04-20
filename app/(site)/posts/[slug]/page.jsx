import { permanentRedirect } from 'next/navigation';

export default async function PostPage({ params }) {
  const { slug } = await params;
  permanentRedirect(`/journal/${encodeURIComponent(slug)}`);
}
