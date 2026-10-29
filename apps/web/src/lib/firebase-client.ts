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

export function getFirebaseAuth(): Auth {
  if (
    !FIREBASE_API_KEY ||
    !FIREBASE_AUTH_DOMAIN ||
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_APP_ID
  ) {
    throw new Error("Firebase authentication is not configured.");
  }
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: FIREBASE_API_KEY,
          authDomain: FIREBASE_AUTH_DOMAIN,
          projectId: FIREBASE_PROJECT_ID,
          appId: FIREBASE_APP_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET || undefined,
        });
  const auth = getAuth(app);

  const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;

  if (emulatorUrl && !authEmulatorConnected) {
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
    await setPersistence(auth, browserLocalPersistence);
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
    return auth;
  })();
  return readyPromise;
}

export async function getFreshFirebaseIdToken(
  forceRefresh = false
): Promise<string | null> {
  const auth = await waitForFirebaseAuth();
  return auth.currentUser?.getIdToken(forceRefresh) ?? null;
}
