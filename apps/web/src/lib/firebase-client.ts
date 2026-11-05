"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  type Auth,
} from "firebase/auth";

import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from "@/lib/env";

let readyPromise: Promise<Auth> | null = null;
let authEmulatorConnected = false;
const useAuthEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR === 'true';

export function getFirebaseAuth(): Auth {
  if (
    !FIREBASE_API_KEY ||
    !FIREBASE_AUTH_DOMAIN ||
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_APP_ID
  ) {
    throw new Error("Firebase authentication is not configured.");
  }
  const existing = getApps().find((candidate) => candidate.name === "[DEFAULT]");
  if (existing && (existing.options.projectId !== FIREBASE_PROJECT_ID || existing.options.apiKey !== FIREBASE_API_KEY)) {
    throw new Error("Firebase default app configuration conflicts with NEXT_PUBLIC_FIREBASE_* values. Restart Next.js and clear stale builds.");
  }
  const app = existing ?? initializeApp({
          apiKey: FIREBASE_API_KEY,
          authDomain: FIREBASE_AUTH_DOMAIN,
          projectId: FIREBASE_PROJECT_ID,
          appId: FIREBASE_APP_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET || undefined,
        });
  const auth = getAuth(app);

  const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;

  if (emulatorUrl && useAuthEmulator && !authEmulatorConnected) {
    connectAuthEmulator(auth, emulatorUrl, {
      disableWarnings: true,
    });
    authEmulatorConnected = true;
  }

  return auth;
}

export function waitForFirebaseAuth(): Promise<Auth> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const auth = getFirebaseAuth();
    await Promise.race([
      (async () => {
        await setPersistence(auth, browserLocalPersistence);
        await auth.authStateReady();
      })(),
      new Promise<never>((_, reject) => {
        // Timeout handled outside the promise, so it does not remain active.
        // Firebase persistence can hang if IndexedDB is blocked by browser policy.
        const handle = setTimeout(() => reject(new Error(
          'Firebase authentication initialization timed out. Check browser storage permissions and Firebase Auth connectivity.'
        )), 12000);
        auth.authStateReady().then(() => clearTimeout(handle), () => clearTimeout(handle));
      }),
    ]);
    return auth;
  })().catch(error => {
    readyPromise = null; // Permit explicit retry after a transient failure.
    throw error;
  });
  return readyPromise;
}

export async function getFreshFirebaseIdToken(
  forceRefresh = false
): Promise<string | null> {
  const auth = await waitForFirebaseAuth();
  return auth.currentUser?.getIdToken(forceRefresh) ?? null;
}
