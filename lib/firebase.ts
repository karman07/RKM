// Firebase client config for Admin panel
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
//
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Only ever initialized in the browser, on demand, so a missing/invalid
// config doesn't crash SSR prerendering (e.g. the /_not-found page).
function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.apiKey) return null;
  return !getApps().length ? initializeApp(firebaseConfig) : getApp();
}

let cachedAuth: Auth | null = null;

/** Phone OTP auth. Only call from browser event handlers. */
export function getFirebaseAuth(): Auth {
  if (!cachedAuth) {
    const app = getFirebaseApp();
    if (!app) throw new Error('Firebase is not configured');
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

// FCM Push Messaging
export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

let messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (messaging) return messaging;
  const app = getFirebaseApp();
  if (!app) return null;
  try { messaging = getMessaging(app); } catch { messaging = null; }
  return messaging;
}

/** Request permission & get FCM token */
export async function requestNotificationToken(): Promise<string | null> {
  try {
    // Skip entirely if Firebase is not configured
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return null;
    if (!('serviceWorker' in navigator)) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const m = getFirebaseMessaging();
    if (!m) return null;

    // Register the SW first, then wait for it to become active before getToken
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

/** Subscribe to foreground messages */
export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, callback);
}
