import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Posts | I AM [RESIST]',
  description: 'Journal and reflections.',
};

export default function PostsPage() {
  redirect('/journal');
}
