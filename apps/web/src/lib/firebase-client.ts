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
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          await setPersistence(auth, browserLocalPersistence);
          await auth.authStateReady();
          return auth;
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(
            'Firebase Auth initialization timed out. Check browser storage, Identity Toolkit connectivity and emulator settings.'
          )), 12000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  })().catch(error => {
    readyPromise = null;
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
