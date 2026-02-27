'use server';

import { redirect } from 'next/navigation';

import { clearUserIdCookie } from '@/lib/session';

export async function logoutAction() {
  await clearUserIdCookie();
  redirect('/login');
}
