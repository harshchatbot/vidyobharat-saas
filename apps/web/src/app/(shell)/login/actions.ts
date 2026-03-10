'use server';

import { redirect } from 'next/navigation';

import { api } from '@/lib/api';
import { setUserAvatarCookie, setUserEmailCookie, setUserIdCookie, setUserNameCookie } from '@/lib/session';

function displayNameFromEmail(email: string) {
  const local = email.split('@')[0] || 'User';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return 'User';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function loginAction(formData: FormData) {
  const emailValue = formData.get('email');
  const email = typeof emailValue === 'string' ? emailValue.trim() : '';

  if (!email) {
    redirect('/login?error=Please%20enter%20your%20email');
  }

  try {
    const { user_id } = await api.mockLogin(email);
    await setUserIdCookie(user_id);
    await setUserNameCookie(displayNameFromEmail(email));
    await setUserEmailCookie(email);
    await setUserAvatarCookie('');
    redirect('/dashboard');
  } catch {
    redirect('/login?error=Account%20not%20found.%20Please%20sign%20up%20first');
  }
}

export async function loginWithGoogleAction() {
  const googleEmail = 'google.user@rangmanchai.dev';

  try {
    const { user_id } = await api.mockLogin(googleEmail);
    await setUserIdCookie(user_id);
    await setUserNameCookie('Google User');
    await setUserEmailCookie(googleEmail);
    await setUserAvatarCookie('');
    redirect('/dashboard');
  } catch {
    try {
      const { user_id } = await api.mockSignup(googleEmail);
      await setUserIdCookie(user_id);
      await setUserNameCookie('Google User');
      await setUserEmailCookie(googleEmail);
      await setUserAvatarCookie('');
      redirect('/dashboard');
    } catch {
      redirect('/login?error=Google%20sign-in%20failed.%20Please%20try%20again');
    }
  }
}
