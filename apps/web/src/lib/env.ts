const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const envApiFallbackUrl = process.env.NEXT_PUBLIC_API_FALLBACK_URL?.trim();
const envFirebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
const envFirebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
const envFirebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
const envFirebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
const envFirebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
const envFirebaseMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
const envFirebaseMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();
const envGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
const isProd = process.env.NODE_ENV === 'production';

if (!envApiUrl && isProd) {
  throw new Error('NEXT_PUBLIC_API_URL is required in production');
}

if (!envApiUrl && !isProd) {
  // Keep local dev running even if .env.local is not created yet.
  // eslint-disable-next-line no-console
  console.warn('NEXT_PUBLIC_API_URL is not set. Falling back to http://localhost:8000');
}

if ((!envFirebaseApiKey || !envFirebaseAuthDomain || !envFirebaseProjectId || !envFirebaseAppId || !envGoogleClientId) && isProd) {
  throw new Error(
    'NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID, and NEXT_PUBLIC_GOOGLE_CLIENT_ID are required in production',
  );
}

const derivedFallbackUrl =
  !envApiFallbackUrl && envApiUrl?.includes('onrender.com')
    ? 'https://api.rangmanch.techfilabs.com'
    : '';

export const API_URL = envApiUrl || 'http://localhost:8000';
export const API_FALLBACK_URL = envApiFallbackUrl || derivedFallbackUrl;
export const FIREBASE_API_KEY = envFirebaseApiKey || '';
export const FIREBASE_AUTH_DOMAIN = envFirebaseAuthDomain || '';
export const FIREBASE_PROJECT_ID = envFirebaseProjectId || '';
export const FIREBASE_APP_ID = envFirebaseAppId || '';
export const FIREBASE_STORAGE_BUCKET = envFirebaseStorageBucket || '';
export const FIREBASE_MESSAGING_SENDER_ID = envFirebaseMessagingSenderId || '';
export const FIREBASE_MEASUREMENT_ID = envFirebaseMeasurementId || '';
export const GOOGLE_CLIENT_ID = envGoogleClientId || '';
