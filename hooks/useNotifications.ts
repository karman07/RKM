'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { saveNotification, NOTIF_ICONS } from '../lib/notificationStore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const VAPID_KEY = 'BKqq3YgM04DffJri7Xxr6WJVujCDnQomMYLFjhurfKPn-p-32noPi9nxEGNCItICNDj3-YxJ510I7mhzui-CgHM';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function registerTokenWithBackend(token: string) {
  try {
    const sessionStr = typeof window !== 'undefined' ? localStorage.getItem('cashier_session') : null;
    if (!sessionStr) return;
    const session = JSON.parse(sessionStr);
    const jwtToken = session.token || session.accessToken || session.access_token;
    if (!jwtToken) return;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` };
    await fetch(`${API_BASE}/notifications/remove-token`, {
      method: 'DELETE', headers, body: JSON.stringify({ token }),
    }).catch(() => {});
    await fetch(`${API_BASE}/notifications/register-token`, {
      method: 'POST', headers, body: JSON.stringify({ token }),
    });
  } catch (err) { console.error('[useNotifications] Token registration failed', err); }
}

export function useNotifications() {
  const unsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    // Silently skip if Firebase env vars aren't configured yet
    if (!firebaseConfig.projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || cancelled) return;
        const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        const m = getMessaging(app);
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const sw = await navigator.serviceWorker.ready;
        const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
        if (cancelled || !token) return;
        await registerTokenWithBackend(token);
        unsubRef.current = onMessage(m, (payload: any) => {
          const { title, body } = payload.notification || {};
          const data = payload.data || {};
          const icon = NOTIF_ICONS[data.type as string] ?? '🔔';
          const url = data.url as string | undefined;
          saveNotification({ type: data.type || 'default', title: title || '', body: body || '', url });
          toast.info(`${icon} ${title}`, {
            description: body,
            duration: 7000,
            action: url ? { label: 'View', onClick: () => (window.location.href = url) } : undefined,
          });
        });
      } catch (err) { console.error('[FCM] Cashier init error', err); }
    })();
    return () => { cancelled = true; unsubRef.current?.(); };
  }, []);
}
