'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // We enforce 24 hour credential requirement by checking timestamp
    const sessionStr = localStorage.getItem('manager_session');
    
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        
        // Ensure role is 'manager' AND session is within 24 hours
        if (session.role !== 'manager' || now - session.timestamp > oneDayMs) {
          localStorage.removeItem('manager_session');
          router.replace('/login');
        } else {
          // Token is valid and fresh, allow them in
          router.replace('/dashboard');
        }
      } catch (err) {
        // If data is corrupted, clear and login
        localStorage.removeItem('manager_session');
        router.replace('/login');
      }
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-10 h-10 border-4 border-[#7A1C2A] border-t-transparent rounded-full animate-spin shadow-lg" />
    </div>
  );
}
