'use server';

import { redirect } from 'next/navigation';

import { api } from '@/lib/api';
import { setUserIdCookie } from '@/lib/session';

export async function signupAction(formData: FormData) {
  const emailValue = formData.get('email');
  const email = typeof emailValue === 'string' ? emailValue.trim() : '';

  if (!email) {
    redirect('/signup?error=Please%20enter%20your%20email');
  }

  try {
    const { user_id } = await api.mockSignup(email);
    await setUserIdCookie(user_id);
    redirect('/projects');
  } catch {
    redirect('/signup?error=Account%20already%20exists.%20Please%20login');
  }
}

export async function signupWithGoogleAction() {
  const googleEmail = 'google.user@vidyobharat.dev';

  try {
    const { user_id } = await api.mockSignup(googleEmail);
    await setUserIdCookie(user_id);
    redirect('/projects');
  } catch {
    try {
      const { user_id } = await api.mockLogin(googleEmail);
      await setUserIdCookie(user_id);
      redirect('/projects');
    } catch {
      redirect('/signup?error=Google%20sign-up%20failed.%20Please%20try%20again');
    }
  }
}
