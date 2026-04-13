import { redirect } from 'next/navigation';

export default function BookClubPage() {
  redirect('/telescreen?source=books');
}

