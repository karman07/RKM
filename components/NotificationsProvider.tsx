'use client';
import { useNotifications } from '../hooks/useNotifications';

/** Drop this anywhere in a client tree to activate push notifications for this panel. */
export default function NotificationsProvider() {
  useNotifications();
  return null;
}
