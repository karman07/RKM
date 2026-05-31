'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import {
  getProfile, markItemPresent, getItemAttendanceDailyStats, checkSessionExpiry,
  type UserProfile, type ItemAttendanceDailyStats,
} from '../../../lib/api';

export default function ItemAttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<ItemAttendanceDailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const loadStats = useCallback(async (profile: UserProfile, date: string) => {
    if (!profile.branch?._id) return;
    setLoading(true);
    try {
      const s = await getItemAttendanceDailyStats(profile.branch._id, date);
      setStats(s);
    } catch { setStats(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then((p) => { setUser(p); loadStats(p, selectedDate); })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); });
  }, [router, loadStats, selectedDate]);

  async function handleScan(barcode: string) {
    setShowScanner(false);
    setScanLoading(true);
    setScanResult(null);
    try {
      await markItemPresent(barcode);
      setScanResult({ success: true, message: `✓ Item marked present (barcode: ${barcode})` });
      if (user) await loadStats(user, selectedDate);
    } catch (err: any) {
      setScanResult({ success: false, message: err.message || `Failed to mark item: ${barcode}` });
    } finally { setScanLoading(false); }
  }

  const presentPct = stats && stats.total_active_items > 0
    ? Math.round((stats.present_count / stats.total_active_items) * 100) : 0;

  return (
    
      <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6 bg-white min-h-full">
        {showScanner && <BarcodeScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Item Audit</h1>
            <p className="text-slate-400 text-sm font-medium mt-1">Scan items to mark them present for today</p>
          </div>
          <button
            id="item-audit-scan-btn"
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2.5 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan Item
          </button>
        </div>

        {/* Scan Result Toast */}
        {scanLoading && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-5 h-5 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm font-bold text-slate-500">Marking item present…</span>
          </div>
        )}
        {scanResult && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 border ${scanResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${scanResult.success ? 'bg-emerald-500' : 'bg-red-500'}`}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                {scanResult.success
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                }
              </svg>
            </div>
            <span className={`text-sm font-bold ${scanResult.success ? 'text-emerald-800' : 'text-red-700'}`}>{scanResult.message}</span>
            <button onClick={() => setScanResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Date Selector */}
        <div className="flex items-center gap-3">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Date</label>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => { setSelectedDate(e.target.value); if (user) loadStats(user, e.target.value); }}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-[#7A1C2A] transition-all"
          />
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Items', value: stats.total_active_items, color: 'text-slate-900', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', bg: '#5A0F1A' },
                { label: 'Present',     value: stats.present_count,      color: 'text-emerald-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', bg: '#059669' },
                { label: 'Missing',     value: stats.missing_count,      color: 'text-red-600',     icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4', bg: '#dc2626' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.bg}15` }}>
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={s.bg} strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                      </svg>
                    </div>
                  </div>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-black text-slate-900">Scan Progress</p>
                <p className="text-sm font-black text-[#5A0F1A]">{presentPct}%</p>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#5A0F1A] to-[#7A1C2A] rounded-full transition-all duration-500"
                  style={{ width: `${presentPct}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-2">
                {stats.present_count} of {stats.total_active_items} items scanned
              </p>
            </div>

            {/* Missing Items */}
            {stats.missing_items.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900">Missing Items</h2>
                  <span className="text-[11px] font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                    {stats.missing_items.length} missing
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {stats.missing_items.slice(0, 20).map((item: any, idx: number) => (
                    <div key={item._id ?? idx} className="px-6 py-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">
                          {item.product_id?.name ?? item.unique_item_code ?? '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.unique_item_code} · {item.barcode}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Present Items */}
            {stats.present_items.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900">Scanned Today</h2>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                    {stats.present_items.length} present
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {stats.present_items.slice(0, 20).map((rec: any, idx: number) => (
                    <div key={rec._id ?? idx} className="px-6 py-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">
                          {rec.item_id?.product_id?.name ?? rec.item_id?.unique_item_code ?? '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {new Date(rec.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-400">No audit data for selected date</p>
          </div>
        )}
      </div>
    
  );
}
