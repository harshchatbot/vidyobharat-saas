import fs from 'node:fs';

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getDatabase } from 'firebase-admin/database';

import { config } from './config.mjs';

let app;

export function getFirebaseApp() {
  if (app) return app;
  const serviceAccount = JSON.parse(fs.readFileSync(config.firebase.serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.firebase.storageBucket,
    databaseURL: config.firebase.databaseURL || undefined,
    projectId: config.firebase.projectId,
  });
  return app;
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseAuth() {
  return admin.auth(getFirebaseApp());
}

export function getFirebaseStorageBucket() {
  return getStorage(getFirebaseApp()).bucket(config.firebase.storageBucket);
}

export function getRealtimeDb() {
  return getDatabase(getFirebaseApp());
}
