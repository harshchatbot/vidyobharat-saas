'use client';

import { useRouter } from 'next/navigation';
import { LoaderCircle, LogOut } from 'lucide-react';
import { useState } from 'react';

import { clearLocalAuthState, clearServerSession } from '@/lib/logout-client';

type LogoutButtonProps = {
  className?: string;
  label?: string;
  pendingLabel?: string;
  icon?: 'spinner-only' | 'logout' | 'none';
  onBeforeNavigate?: () => void;
};

export function LogoutButton({
  className,
  label = 'Logout',
  pendingLabel = 'Logging out...',
  icon = 'logout',
  onBeforeNavigate,
}: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    if (pending) return;

    setPending(true);
    onBeforeNavigate?.();
    clearLocalAuthState();
    void clearServerSession();
    router.replace('/login');
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={className}
      aria-busy={pending}
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : icon === 'logout' ? (
        <LogOut className="h-4 w-4" />
      ) : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
