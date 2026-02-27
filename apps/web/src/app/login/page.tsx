import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getUserIdFromCookie } from '@/lib/session';

import { logoutAction } from '../auth-actions';
import { loginAction } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const userId = await getUserIdFromCookie();
  if (userId) {
    return (
      <div className="mx-auto max-w-md py-6">
        <Card>
          <h1 className="text-xl font-semibold text-[hsl(var(--color-text))]">You are already logged in</h1>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
            Continue to your projects or logout to switch account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/projects"><Button>Go to Projects</Button></Link>
            <form action={logoutAction}><Button variant="secondary" type="submit">Logout</Button></form>
          </div>
        </Card>
      </div>
    );
  }

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md py-6">
      <Card>
        <h1 className="text-xl font-semibold text-[hsl(var(--color-text))]">Login</h1>
        <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">Use your registered email to continue.</p>
        {params.error && (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-danger))] px-3 py-2 text-xs text-[hsl(var(--color-danger))]">
            {params.error}
          </p>
        )}
        <form action={loginAction} className="mt-4 grid gap-3">
          <Input name="email" type="email" placeholder="you@domain.com" defaultValue={params.email ?? ''} required />
          <Button type="submit">Login</Button>
        </form>
        <p className="mt-4 text-xs text-[hsl(var(--color-muted))]">
          New here? <Link href="/signup" className="font-semibold text-[hsl(var(--color-accent))]">Create account</Link>
        </p>
      </Card>
    </div>
  );
}
