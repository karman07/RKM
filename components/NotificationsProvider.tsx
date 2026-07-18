'use client';
import { useNotifications } from '../hooks/useNotifications';
export default function NotificationsProvider() {
  useNotifications();
  return null;
}
