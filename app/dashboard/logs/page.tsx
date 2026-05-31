'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { getProfile, getInventory, UserProfile, InventoryItem } from '../../../lib/api';

const STATUS_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  sold:      { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#059669', label: 'Sold' },
  damaged:   { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: '#ef4444', label: 'Damaged' },
  returned:  { icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6', color: '#f59e0b', label: 'Returned' },
  reserved:  { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', color: '#3b82f6', label: 'Reserved' },
  available: { icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: '#64748b', label: 'Stock' },
};

export default function SystemLogsPage() {
  return (
    <Suspense fallback={
      
        <div className="flex h-96 items-center justify-center">
          <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
        </div>
      
    }>
      <LogsPageContent />
    </Suspense>
  );
}

function LogsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams?.get('status') || '');

  useEffect(() => {
    const st = searchParams?.get('status');
    setStatusFilter(st || '');
  }, [searchParams]);

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }

    getProfile()
      .then((profile) => {
        setUser(profile);
        if (!profile.branch?._id) return;
        return getInventory({ branch_id: profile.branch._id, limit: '100', page: '1' });
      })
      .then((res) => {
        if (res) {
          // Only include items that have had some activity
          const active = res.data.filter((item) => item.status !== 'available');
          setLogs(active);
        }
      })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = statusFilter ? logs.filter((l) => l.status === statusFilter) : logs;

  function formatDate(d: string) {
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return (
    
      <div className="flex h-96 items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
      </div>
    
  );

  return (
    
    <div className="min-h-screen bg-[#FAFAFA] font-sans">

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Audit Trail</h2>
            <p className="text-sm text-slate-400 font-medium">{filtered.length} activity events</p>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 focus:outline-none focus:border-[#7A1C2A] transition-all"
          >
            <option value="">All Events</option>
            <option value="sold">Sold</option>
            <option value="damaged">Damaged</option>
            <option value="returned">Returned</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-[2px] bg-slate-100 rounded-full" />

          <div className="space-y-4">
            {filtered.map((item) => {
              const product = item.product_id as any;
              const cfg = STATUS_ICONS[item.status] ?? STATUS_ICONS.available;
              const eventDate = item.sold_at ?? item.updatedAt;

              return (
                <div key={item._id} className="relative flex gap-4 pl-14">
                  {/* Dot */}
                  <div
                    className="absolute left-[10px] top-5 w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm border-2 border-white"
                    style={{ background: `${cfg.color}20` }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={cfg.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                    </svg>
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap gap-2 items-start justify-between mb-2">
                      <div>
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-1"
                          style={{ background: `${cfg.color}20`, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <p className="text-sm font-black text-slate-900">{product?.name ?? '—'}</p>
                        <code className="text-[10px] text-slate-400 font-mono">{item.barcode}</code>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-[#7A1C2A]">₹{item.selling_price.toLocaleString('en-IN')}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(eventDate)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 border-t border-slate-50 pt-2 mt-2">
                      {item.status === 'sold' && item.sold_customer_name && (
                        <span>Customer: <span className="text-slate-600 font-bold">{item.sold_customer_name}</span></span>
                      )}
                      {item.status === 'sold' && item.payment_mode && (
                        <span>Payment: <span className="text-slate-600 font-bold capitalize">{item.payment_mode}</span></span>
                      )}
                      {item.status === 'damaged' && (
                        <span>Reason: <span className="text-slate-600 font-bold">{(item as any).damage_reason || 'Not specified'}</span></span>
                      )}
                      <span>Location: <span className="text-slate-600 font-bold capitalize">{item.location?.replace('_', ' ')}</span></span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="ml-14 bg-white border border-slate-100 rounded-2xl p-12 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-medium">No activity events found</p>
                <p className="text-slate-300 text-sm mt-1">Sold, damaged, and returned items will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    
  );
}
