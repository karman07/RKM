// lib/firebase.ts - Firebase client for Manager panel (auth + FCM messaging)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// ─── FCM Push Messaging ────────────────────────────────────────────────────
export const VAPID_KEY = 'BKqq3YgM04DffJri7Xxr6WJVujCDnQomMYLFjhurfKPn-p-32noPi9nxEGNCItICNDj3-YxJ510I7mhzui-CgHM';

let _messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (_messaging) return _messaging;
  try { _messaging = getMessaging(app); } catch { _messaging = null; }
  return _messaging;
}

export async function requestNotificationToken(): Promise<string | null> {
  try {
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return null;
    if (!('serviceWorker' in navigator)) return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const m = getFirebaseMessaging();
    if (!m) return null;
    await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    return token || null;
  } catch (err) {
    console.error('[FCM] Failed to get token', err);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, callback);
}
