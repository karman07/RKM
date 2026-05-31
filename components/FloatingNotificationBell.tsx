'use client';
import { useEffect, useState } from 'react';
import { getMyNotifications } from '../lib/api';
import { useRouter, usePathname } from 'next/navigation';

export default function FloatingNotificationBell() {
  const [unread, setUnread] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const data = await getMyNotifications();
        const unreadCount = data.filter((n: any) => !n.isRead).length;
        setUnread(unreadCount);
      } catch (err) {}
    };
    fetchNotifs();
    // optionally poll every 30s
    const int = setInterval(fetchNotifs, 30000);
    return () => clearInterval(int);
  }, []);

  if (pathname !== '/dashboard') return null;

  return (
    <button
      onClick={() => router.push('/dashboard/notifications')}
      className="fixed bottom-8 right-8 z-50 bg-white p-3.5 rounded-2xl shadow-xl shadow-[#5A0F1A]/10 border border-[#5A0F1A]/10 hover:scale-105 transition-transform group"
    >
      <div className="relative">
        <svg className="w-6 h-6 text-[#5A0F1A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </button>
  );
}
