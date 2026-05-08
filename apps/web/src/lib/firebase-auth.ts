import { FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID, GOOGLE_CLIENT_ID, getApiUrl } from '@/lib/env';

export type FirebaseAuthSession = {
  idToken: string;
  refreshToken?: string;
  email?: string;
  localId: string;
  displayName?: string;
  photoUrl?: string;
};

export type FirebaseUserProfile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
};

interface PromptMomentNotification {
  isDisplayMoment: () => boolean;
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
  getMomentType: () => string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: any) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            context?: string;
          }) => void;
          prompt: (callback?: (notification: PromptMomentNotification) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            }
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;
const AUTH_REQUEST_TIMEOUT_MS = 15000;

function ensureConfigured() {
  if (!FIREBASE_API_KEY || !FIREBASE_AUTH_DOMAIN || !FIREBASE_PROJECT_ID || !FIREBASE_APP_ID) {
    throw new Error(
      'Firebase auth is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, and NEXT_PUBLIC_FIREBASE_APP_ID.',
    );
  }
}

function firebaseRestUrl(path: string) {
  ensureConfigured();
  return `https://identitytoolkit.googleapis.com/v1/${path}?key=${FIREBASE_API_KEY}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || body?.error?.errors?.[0]?.message || 'Authentication failed';
    throw new Error(message.replaceAll('_', ' '));
  }
  return body as T;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your Firebase configuration and network, then try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendVerifyEmail(idToken: string) {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:sendOobCode'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'VERIFY_EMAIL',
      idToken,
    }),
  });
  await parseJson(response);
}

export async function signInWithPassword(email: string, password: string): Promise<FirebaseAuthSession> {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:signInWithPassword'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await parseJson<{
    idToken: string;
    refreshToken: string;
    localId: string;
    email?: string;
    displayName?: string;
  }>(response);
  return {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    localId: body.localId,
    email: body.email,
    displayName: body.displayName,
  };
}

export async function signUpWithPassword(email: string, password: string, fullName?: string): Promise<FirebaseAuthSession | null> {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:signUp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await parseJson<{
    idToken: string;
    refreshToken: string;
    localId: string;
    email?: string;
  }>(response);

  if (fullName?.trim()) {
    await updateProfile(body.idToken, { displayName: fullName.trim() });
  }

  try {
    await sendVerifyEmail(body.idToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send verification email';
    throw new Error(`Account created, but verification email could not be sent. ${message}`);
  }
  return null;
}

async function updateProfile(idToken: string, payload: { displayName?: string; photoUrl?: string }) {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:update'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      displayName: payload.displayName,
      photoUrl: payload.photoUrl,
      returnSecureToken: false,
    }),
  });
  await parseJson(response);
}

export async function getUserForIdToken(idToken: string): Promise<FirebaseUserProfile> {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:lookup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await parseJson<{ users?: Array<Record<string, unknown>> }>(response);
  const user = body.users?.[0];
  if (!user) {
    throw new Error('Unable to load Firebase user profile');
  }
  const email = typeof user.email === 'string' ? user.email : '';
  const displayName = typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim()
    : email.split('@')[0] || 'User';
  const photoUrl = typeof user.photoUrl === 'string' && user.photoUrl.trim() ? user.photoUrl.trim() : null;
  return {
    id: typeof user.localId === 'string' ? user.localId : '',
    email,
    name: displayName,
    avatarUrl: photoUrl,
    emailVerified: Boolean(user.emailVerified),
  };
}

export function getProfileFields(user: FirebaseUserProfile) {
  return {
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export async function persistAppSession(payload: {
  accessToken: string;
  userId: string;
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}) {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || 'Failed to persist app session');
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('vidyo_access_token', payload.accessToken);
      window.localStorage.setItem('vidyo_user_id', payload.userId);
    } catch {
      // Ignore storage errors in strict/private browsing contexts.
    }
  }

  const bootstrapResponse = await fetch(`${getApiUrl()}/me/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${payload.accessToken}`,
      'X-User-ID': payload.userId,
    },
    body: JSON.stringify({
      display_name: payload.name,
      email: payload.email,
      avatar_url: payload.avatarUrl,
    }),
  });

  if (!bootstrapResponse.ok) {
    const body = await bootstrapResponse.text();
    throw new Error(body || 'Failed to initialize user profile');
  }
}

async function loadGoogleIdentityScript() {
  if (googleScriptPromise) {
    return googleScriptPromise;
  }
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google sign-in requires a browser environment'));
      return;
    }
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function signInWithGoogleCredential(credential: string): Promise<FirebaseAuthSession> {
  const response = await fetchWithTimeout(firebaseRestUrl('accounts:signInWithIdp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(credential)}&providerId=google.com`,
      requestUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  const body = await parseJson<{
    idToken: string;
    refreshToken: string;
    localId: string;
    email?: string;
    displayName?: string;
    photoUrl?: string;
  }>(response);
  return {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    localId: body.localId,
    email: body.email,
    displayName: body.displayName,
    photoUrl: body.photoUrl,
  };
}

export async function signInWithGooglePopup(): Promise<FirebaseAuthSession> {
  ensureConfigured();
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID.');
  }
  
  await loadGoogleIdentityScript();
  
  return new Promise<FirebaseAuthSession>((resolve, reject) => {
    if (!window.google?.accounts?.id) {
      reject(new Error('Google Identity Services is unavailable'));
      return;
    }

    // 1. Initialize the IDP configuration
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      auto_select: false, // Vital: prevents automatically picking the "default" browser account
      callback: async (response: any) => {
        if (response.error) {
          reject(new Error(`Google Identity Error: ${response.error}`));
          return;
        }
        try {
          const session = await signInWithGoogleCredential(response.credential);
          resolve(session);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Google sign-in failed'));
        }
      },
    });

    /**
     * 2. FORCING THE ACCOUNT SELECTOR
     * Instead of just calling .prompt(), we use the 'click' trigger on a hidden element 
     * or use the standard GSI popup picker. 
     */
    const parent = document.createElement('div');
    parent.id = 'google-signin-hidden-container';
    parent.style.display = 'none';
    document.body.appendChild(parent);

    // This renders the actual Google button logic internally
    window.google.accounts.id.renderButton(parent, {
      type: 'standard',
      shape: 'rectangular',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
    });

    // Manually trigger the click on the internal div that Google created
    const googleBtn = parent.querySelector('div[role="button"]') as HTMLElement;
    if (googleBtn) {
      googleBtn.click();
    } else {
      // Fallback to prompt if the button rendering fails
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          reject(new Error('Google Popup blocked or not displayed. Please check browser settings.'));
        }
      });
    }

    // Cleanup the hidden div after a short delay
    setTimeout(() => {
      if (document.getElementById('google-signin-hidden-container')) {
        document.body.removeChild(parent);
      }
    }, 5000);
  });
}
