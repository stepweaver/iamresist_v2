import { redirect } from 'next/navigation';

export default function BookClubPage() {
  redirect('/voices?source=books');
}

