// Firebase client config for Admin panel
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? 'AIzaSyAIehYi9V4FJTlPBBza44MZXb15HTl1Yes',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? 'rkm-inv.firebaseapp.com',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? 'rkm-inv',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? 'rkm-inv.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '859269998887',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? '1:859269998887:web:913ddac83bc23a2c0aa102',
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID     ?? 'G-SD5ZX1MK8S',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Phone OTP auth
export const auth = getAuth(app);

// FCM Push Messaging
export const VAPID_KEY = 'BKqq3YgM04DffJri7Xxr6WJVujCDnQomMYLFjhurfKPn-p-32noPi9nxEGNCItICNDj3-YxJ510I7mhzui-CgHM';

let messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (messaging) return messaging;
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
