import { redirect } from 'next/navigation';

export default function ResourcesPage() {
  redirect('/voices?source=resources');
}

