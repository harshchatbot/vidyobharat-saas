'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/lib/api';
import type { AppNotification } from '@/types/api';

type NotificationBellProps = {
  userId: string | null;
};

const POLL_INTERVAL_MS = 15_000;

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatStableTimestamp(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firstLoadRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3');
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const loadNotifications = async () => {
      try {
        const nextItems = await api.listNotifications(userId, 20);
        if (cancelled) return;

        const previousIds = seenIdsRef.current;
        const newUnread = nextItems.some((item) => !item.read && !previousIds.has(item.id));
        setItems(nextItems);
        seenIdsRef.current = new Set(nextItems.map((item) => item.id));

        if (!firstLoadRef.current && newUnread) {
          audioRef.current?.play().catch(() => {});
          window.dispatchEvent(new CustomEvent('rangmanch:video-completed'));
        }
        firstLoadRef.current = false;
      } catch {
        // keep bell silent on transient notification fetch failures
      }
    };

    void loadNotifications();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadNotifications();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void loadNotifications();
    };

    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen && unreadCount > 0) {
            void api.markNotificationsRead(userId)
              .then(() => {
                setItems((prev) => prev.map((item) => ({ ...item, read: true })));
              })
              .catch(() => {
                // keep UI usable even if read sync fails
              });
          }
        }}
        className={`relative rounded-full border border-border bg-bg px-3 py-2 shadow-sm transition hover:bg-muted ${
          unreadCount > 0 ? 'animate-pulse' : ''
        }`}
        aria-label="Notifications"
      >
        <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-border bg-bg p-3 shadow-xl">
          <div className="mb-2 font-semibold">Notifications</div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.message}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {hasMounted ? relativeTime(item.created_at) : formatStableTimestamp(item.created_at)}
                    </span>
                  </div>
                  {item.video_id ? (
                    <div className="mt-2">
                      <Link
                        href={`/videos/${item.video_id}`}
                        className="text-xs font-medium text-[hsl(var(--color-accent))] hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        Open video
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
