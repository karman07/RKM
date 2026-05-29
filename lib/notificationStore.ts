/**
 * Shared notification store using localStorage.
 * Stores the last 50 notifications and provides read/unread tracking.
 */

export interface StoredNotification {
  id: string;
  type: 'item_sold' | 'item_damaged' | 'item_stolen' | 'stock_added' | 'default';
  title: string;
  body: string;
  url?: string;
  timestamp: number;
  read: boolean;
}

const STORAGE_KEY = 'rkm_notifications';
const MAX = 50;

export function saveNotification(n: Omit<StoredNotification, 'id' | 'timestamp' | 'read'>) {
  const list = loadNotifications();
  const entry: StoredNotification = {
    ...n,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    read: false,
  };
  const updated = [entry, ...list].slice(0, MAX);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  // Dispatch a custom event so other parts of the app can react
  window.dispatchEvent(new CustomEvent('rkm_notification', { detail: entry }));
}

export function loadNotifications(): StoredNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function markAllRead() {
  const list = loadNotifications().map(n => ({ ...n, read: true }));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function markOneRead(id: string) {
  const list = loadNotifications().map(n => n.id === id ? { ...n, read: true } : n);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function clearNotifications() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function unreadCount(): number {
  return loadNotifications().filter(n => !n.read).length;
}

export const NOTIF_ICONS: Record<string, string> = {
  item_sold: 'sale',
  item_damaged: 'damage',
  item_stolen: 'theft',
  stock_added: 'stock',
  default: 'info',
};

export const NOTIF_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  item_sold:    { bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Sale'    },
  item_damaged: { bg: 'bg-amber-50',    border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Damage'  },
  item_stolen:  { bg: 'bg-red-50',      border: 'border-red-200',     dot: 'bg-red-500',     label: 'Theft'   },
  stock_added:  { bg: 'bg-blue-50',     border: 'border-blue-200',    dot: 'bg-blue-500',    label: 'Stock'   },
  default:      { bg: 'bg-slate-50',    border: 'border-slate-200',   dot: 'bg-slate-400',   label: 'Info'    },
};
