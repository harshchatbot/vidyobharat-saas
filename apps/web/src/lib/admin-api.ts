export type AdminDashboard = {
  total_guest_sessions: number;
  active_guest_sessions: number;
  accepted_uploads: number;
  completed_exports: number;
  failed_exports: number;
  uploaded_bytes: number;
  active_storage_bytes: number;
  recent_activity: Array<Record<string, unknown>>;
  coverage_note: string;
};

export type AdminGuest = {
  guest_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: string;
  uploads_count: number;
  exports_count: number;
  uploaded_bytes: number;
  storage_bytes: number;
  processing_seconds: number;
};

export type AdminExport = {
  job_id: string;
  status: string;
  progress_stage: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  attempt_count: number;
  error_code: string | null;
  filename: string | null;
  duration_seconds: number | null;
  output_bytes: number | null;
};

export type AdminConfig = {
  revision: number;
  cache_ttl_seconds: number;
  config: Record<string, Record<string, unknown>>;
};

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(method)) headers.set('X-RangManch-Admin-CSRF', '1');
  const request = () => fetch(`/api/admin/backend/${path.replace(/^\//, '')}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let response = await request();
  if (response.status === 401) {
    const { getFirebaseAuth } = await import('@/lib/firebase-client');
    const user = getFirebaseAuth().currentUser;
    if (user) {
      const token = await user.getIdToken(true);
      const refreshed = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RangManch-Admin-CSRF': '1' },
        body: JSON.stringify({ idToken: token }),
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (refreshed.ok) response = await request();
    }
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.detail === 'string' ? body.detail : 'Admin request failed.';
    throw new AdminApiError(message, response.status);
  }
  return body as T;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[index]}`;
}
