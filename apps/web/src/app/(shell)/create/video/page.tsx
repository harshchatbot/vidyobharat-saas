import { redirect } from 'next/navigation';

export default async function LegacyCreateVideoPage() {
  redirect('/create');
}
