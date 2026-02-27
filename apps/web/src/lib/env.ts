const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const isProd = process.env.NODE_ENV === 'production';

if (!envApiUrl && isProd) {
  throw new Error('NEXT_PUBLIC_API_URL is required in production');
}

if (!envApiUrl && !isProd) {
  // Keep local dev running even if .env.local is not created yet.
  // eslint-disable-next-line no-console
  console.warn('NEXT_PUBLIC_API_URL is not set. Falling back to http://localhost:8000');
}

export const API_URL = envApiUrl || 'http://localhost:8000';
