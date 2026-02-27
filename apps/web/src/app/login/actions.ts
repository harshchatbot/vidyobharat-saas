'use server';

import { redirect } from 'next/navigation';

import { api } from '@/lib/api';
import { setUserIdCookie } from '@/lib/session';

export async function loginAction(formData: FormData) {
  const emailValue = formData.get('email');
  const email = typeof emailValue === 'string' ? emailValue.trim() : '';

  if (!email) {
    redirect('/login?error=Please%20enter%20your%20email');
  }

  try {
    const { user_id } = await api.mockLogin(email);
    await setUserIdCookie(user_id);
    redirect('/projects');
  } catch {
    redirect('/login?error=Account%20not%20found.%20Please%20sign%20up%20first');
  }
}

export async function loginWithGoogleAction() {
  const googleEmail = 'google.user@vidyobharat.dev';

  try {
    const { user_id } = await api.mockLogin(googleEmail);
    await setUserIdCookie(user_id);
    redirect('/projects');
  } catch {
    try {
      const { user_id } = await api.mockSignup(googleEmail);
      await setUserIdCookie(user_id);
      redirect('/projects');
    } catch {
      redirect('/login?error=Google%20sign-in%20failed.%20Please%20try%20again');
    }
  }
}
