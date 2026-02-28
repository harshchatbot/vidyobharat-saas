import { redirect } from 'next/navigation';

import { ProfileClient } from '@/components/account/ProfileClient';
import { getUserAvatarFromCookie, getUserEmailFromCookie, getUserIdFromCookie, getUserNameFromCookie } from '@/lib/session';

export default async function ProfilePage() {
  const userId = await getUserIdFromCookie();
  const userName = await getUserNameFromCookie();
  const userEmail = await getUserEmailFromCookie();
  const userAvatar = await getUserAvatarFromCookie();

  if (!userId) {
    redirect('/login');
  }

  return <ProfileClient userId={userId} initialName={userName} initialEmail={userEmail} initialAvatar={userAvatar} />;
}
