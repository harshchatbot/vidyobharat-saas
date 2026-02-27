'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api';
import { setUserIdCookie } from '@/lib/session';

export async function mockLoginAction(formData: FormData) {
  const emailValue = formData?.get('email');
  const email = typeof emailValue === 'string' ? emailValue.trim() : undefined;
  const { user_id } = await api.mockLogin(email || undefined);
  await setUserIdCookie(user_id);
  revalidatePath('/projects');
}
