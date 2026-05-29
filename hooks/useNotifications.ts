'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { requestNotificationToken, onForegroundMessage } from '../lib/firebase';
import { saveNotification } from '../lib/notificationStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function registerTokenWithBackend(token: string) {
  try {
    const sessionStr = typeof window !== 'undefined'
      ? localStorage.getItem('admin_session') || localStorage.getItem('session')
      : null;
    if (!sessionStr) return;
    const session = JSON.parse(sessionStr);
    const jwtToken = session.token || session.accessToken || session.access_token;
    if (!jwtToken) return;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` };
    await fetch(`${API_BASE}/notifications/remove-token`, {
      method: 'DELETE', headers, body: JSON.stringify({ token }),
    }).catch(() => {});
    const res = await fetch(`${API_BASE}/notifications/register-token`, {
      method: 'POST', headers, body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[FCM] Token registered with backend:', data);
  } catch (err) {
    console.error('[FCM] Token registration failed', err);
  }
}

export function useNotifications() {
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    let cancelled = false;

    (async () => {
      const token = await requestNotificationToken();
      console.log('[FCM] Token:', token ?? 'null — permission denied or Firebase not configured');
      if (cancelled || !token) return;

      await registerTokenWithBackend(token);

      unsubRef.current = onForegroundMessage((payload: any) => {
        const { title, body } = payload.notification || {};
        const data = payload.data || {};
        const url = data.url as string | undefined;
        saveNotification({ type: data.type || 'default', title: title || '', body: body || '', url });

        const toastType = data.type === 'item_sold' ? 'success'
          : data.type === 'item_stolen' ? 'error'
          : data.type === 'item_damaged' ? 'warning'
          : 'info';

        const showToast = { success: toast.success, error: toast.error, warning: toast.warning, info: toast.info }[toastType] ?? toast.info;
        showToast(title, {
          description: body,
          duration: 8000,
          action: url ? { label: 'View', onClick: () => { window.location.href = url; } } : undefined,
        });
      });
    })();

    return () => { cancelled = true; unsubRef.current?.(); };
  }, []);
}
