'use client';

import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const unreadCount = items.filter((item) => !item.read).length;

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3');
  }, []);

  function addVideoReadyNotification(renderId: string) {
    const exists = items.some((item) => item.id === renderId);
    if (exists) return;

    setItems((prev) => [
      {
        id: renderId,
        title: 'Your video is ready 🎬',
        message: 'Your Chitrakala product ad has finished generating.',
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    audioRef.current?.play().catch(() => {});
  }

  // Temporary test hook. Remove after real render listener is wired.
  useEffect(() => {
    (window as any).__addVideoReadyNotification = addVideoReadyNotification;
  }, [items]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setItems((prev) => prev.map((item) => ({ ...item, read: true })));
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
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}