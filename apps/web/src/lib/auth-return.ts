export function safeReturnPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /:\/\//.test(value)) return fallback;
  try {
    const parsed = new URL(value, 'https://rangmanchai.local');
    if (parsed.origin !== 'https://rangmanchai.local' || parsed.pathname === '/login' || parsed.pathname === '/signup') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return fallback; }
}
