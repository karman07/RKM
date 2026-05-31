'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import ViewItemModal from '../../../components/ViewItemModal';
import { getProfile, UserProfile, getItemAttendanceDailyStats, markItemPresent, ItemAttendanceDailyStats, updateInventoryStatus, getAttendanceTrends, AttendanceTrendPoint } from '../../../lib/api';
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ItemAttendanceDailyStats | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [tab, setTab] = useState<'missing' | 'present'>('missing');
  const [viewItem, setViewItem] = useState<any>(null);
  const [stolenConfirmItem, setStolenConfirmItem] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [trends, setTrends] = useState<AttendanceTrendPoint[]>([]);
  const isProcessingRef = useRef(false);

  const fetchStats = async (branchId: string) => {
    try {
      const [data, trendData] = await Promise.all([
        getItemAttendanceDailyStats(branchId),
        getAttendanceTrends(branchId, 7)
      ]);
      setStats(data);
      setTrends(trendData.reverse());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }
    
    getProfile()
      .then(profile => {
        setUser(profile);
        if (profile.branch?._id) return fetchStats(profile.branch._id);
      })
      .catch(() => {
        localStorage.removeItem('manager_session');
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleScan = async (barcode: string) => {
    if (!barcode.trim() || !user?.branch?._id || isProcessingRef.current) return;
    setIsScanning(false);
    isProcessingRef.current = true;
    setMessage({ text: 'Recording...', type: 'loading' });
    try {
      await markItemPresent(barcode);
      setMessage({ text: `Successfully recorded: ${barcode}`, type: 'success' });
      setManualBarcode('');
      await fetchStats(user.branch._id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to record attendance', type: 'error' });
    }
    isProcessingRef.current = false;
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // Global Barcode Scanner Listener
  useEffect(() => {
    if (!user?.branch?._id) return;
    
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in any input/textarea, let the input handle it naturally
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const currentTime = Date.now();
      // If the delay is more than 50ms, it's likely a human typing, reset buffer
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 3) {
          handleScan(barcodeBuffer);
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user]);

  const confirmMarkStolen = async () => {
    if (!stolenConfirmItem || !user?.branch?._id) return;
    setActionLoading(stolenConfirmItem);
    const itemId = stolenConfirmItem;
    setStolenConfirmItem(null);
    try {
      await updateInventoryStatus(itemId, { status: 'stolen' });
      setMessage({ text: 'Item marked as stolen', type: 'success' });
      await fetchStats(user.branch._id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update item status', type: 'error' });
    }
    setActionLoading(null);
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  if (loading) return <div className="flex h-full items-center justify-center p-8"><div className="w-8 h-8 border-4 border-[#7A1C2A] border-t-transparent rounded-full animate-spin" /></div>;

  const total = stats?.total_active_items || 0;
  const present = stats?.present_count || 0;
  const missing = stats?.missing_count || 0;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  return (
    <>
      <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
        
        {/* Header & Scanner */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Daily Item Audit</h1>
            <p className="text-slate-500 font-medium mt-1">Scan physical inventory to verify presence • {fmtDate(new Date())}</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => setIsScanning(true)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-[#7A1C2A] text-white text-sm font-bold rounded-2xl shadow-sm hover:bg-[#5A0F1A] transition-all"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                <rect x="3" y="3" width="18" height="18" rx="4" />
              </svg>
              Camera Scan
            </button>
          </div>
        </div>

        {/* Message Banner */}
        {message.text && (
          <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message.type === 'loading' && <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
            {message.type === 'success' && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            {message.type === 'error' && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
            {message.text}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Total Stock</h3>
            </div>
            <p className="text-4xl font-black text-slate-900 tracking-tight">{total}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Available & Returned items
            </p>
          </div>
          
          <div className="bg-white border border-emerald-100 rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-100">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">Verified</h3>
            </div>
            <p className="text-4xl font-black text-emerald-700 tracking-tight">{present}</p>
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Completion</span>
                <span className="text-[10px] font-black text-emerald-700">{pct}%</span>
              </div>
              <div className="h-2 bg-emerald-100 rounded-full overflow-hidden p-0.5">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(16,185,129,0.4)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-red-100 rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-100">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-500">Missing</h3>
            </div>
            <p className="text-4xl font-black text-red-600 tracking-tight">{missing}</p>
            <p className="text-[10px] font-bold text-red-400 mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Items pending daily scan
            </p>
          </div>
        </div>

        {/* Trends */}
        {trends.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-[32px] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-400">7-Day Attendance Trend</h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/><span className="text-[10px] font-bold text-slate-500 uppercase">Verified</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/><span className="text-[10px] font-bold text-slate-500 uppercase">Missing</span></div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 h-32">
              {trends.map((t, i) => {
                const total = Math.max(1, t.total);
                const hP = (t.present / total) * 100;
                const hM = (t.missing / total) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                    <div className="w-full max-w-[2rem] h-full flex flex-col justify-end gap-1 relative z-10">
                      <div className="w-full bg-red-500 rounded-sm transition-all duration-500 hover:bg-red-400" style={{ height: `${hM}%`, minHeight: t.missing > 0 ? '4px' : '0' }}></div>
                      <div className="w-full bg-emerald-500 rounded-sm transition-all duration-500 hover:bg-emerald-400" style={{ height: `${hP}%`, minHeight: t.present > 0 ? '4px' : '0' }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    
                    {/* Tooltip */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap shadow-xl">
                      {t.present} Verified • {t.missing} Missing
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="bg-white border border-slate-100 rounded-[40px] shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col min-h-[500px]">
          <div className="flex p-2 bg-slate-50/50 border-b border-slate-100 gap-1">
            <button
              onClick={() => setTab('missing')}
              className={`flex-1 py-3.5 rounded-[24px] text-[12px] font-black uppercase tracking-widest transition-all duration-300 ${
                tab === 'missing' 
                  ? 'bg-red-600 text-white shadow-lg shadow-red-100' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              Pending Audit ({missing})
            </button>
            <button
              onClick={() => setTab('present')}
              className={`flex-1 py-3.5 rounded-[24px] text-[12px] font-black uppercase tracking-widest transition-all duration-300 ${
                tab === 'present' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              Verified Today ({present})
            </button>
          </div>

          <div className="flex-1 p-0 overflow-y-auto custom-scrollbar-dark max-h-[600px]">
            {tab === 'missing' ? (
              <div className="divide-y divide-slate-50">
                {stats?.missing_items?.length === 0 ? (
                  <div className="p-20 text-center">
                    <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[40px] flex items-center justify-center mx-auto mb-6 shadow-inner">
                      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Audit Complete</h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">Great job! All active physical inventory has been accounted for today.</p>
                  </div>
                ) : (
                  stats?.missing_items?.map((item: any) => (
                    <div 
                      key={item._id} 
                      onClick={() => setViewItem(item)}
                      className="group flex items-center gap-5 p-5 hover:bg-slate-50/80 transition-all border-l-4 border-transparent hover:border-red-500 cursor-pointer"
                    >
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        {item.product_id?.images?.[0] ? (
                          <img src={item.product_id.images[0].startsWith('http') ? item.product_id.images[0] : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${item.product_id.images[0].startsWith('/') ? '' : '/'}${item.product_id.images[0]}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate group-hover:text-red-600 transition-colors">{item.product_id?.name || 'Unknown Product'}</p>
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 mt-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SKU: <span className="text-slate-600">{item.product_id?.sku}</span></p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Barcode: <span className="text-slate-600">{item.barcode}</span></p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                        <span className="inline-flex items-center px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-[0.1em] rounded-full border border-red-100">Pending Scan</span>
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-black text-slate-400 tracking-wider">{item.product_id?.gross_weight?.toFixed(2)}g</p>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setStolenConfirmItem(item._id); }}
                            disabled={actionLoading === item._id}
                            className="px-3 py-1 bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                          >
                            {actionLoading === item._id ? '...' : 'Mark Stolen'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {stats?.present_items?.length === 0 ? (
                  <div className="p-20 text-center text-slate-300">
                    <p className="text-sm font-bold uppercase tracking-widest">No verified scans yet</p>
                  </div>
                ) : (
                  stats?.present_items?.map((record: any) => (
                      <div 
                        key={record._id} 
                        onClick={() => setViewItem(record.item_id)}
                        className="flex items-center gap-5 p-5 hover:bg-slate-50/80 transition-all border-l-4 border-transparent hover:border-emerald-500 cursor-pointer"
                      >
                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
                          {record.item_id?.product_id?.images?.[0] ? (
                            <img src={record.item_id.product_id.images[0].startsWith('http') ? record.item_id.product_id.images[0] : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${record.item_id.product_id.images[0].startsWith('/') ? '' : '/'}${record.item_id.product_id.images[0]}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-emerald-400"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{record.item_id?.product_id?.name || 'Unknown Product'}</p>
                        <p className="text-[11px] font-bold text-slate-500 mt-1">
                          Scanned by <span className="text-[#7A1C2A]">{record.scanned_by?.name || 'Unknown'}</span> at <span className="text-slate-900 font-black">{new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.1em] rounded-full border border-emerald-100">
                          <span className="w-1 h-1 rounded-full bg-emerald-500" />
                          Verified
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isScanning && (
        <BarcodeScannerModal
          onScan={handleScan}
          onClose={() => setIsScanning(false)}
        />
      )}

      {viewItem && (
        <ViewItemModal
          item={viewItem}
          onClose={() => setViewItem(null)}
        />
      )}

      {stolenConfirmItem && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_200ms_ease-out]">
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden relative">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Mark as Stolen?</h3>
              <p className="text-sm text-slate-500 mb-8 font-medium">
                This action will immediately remove the item from active inventory and log it as stolen. This cannot be easily undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStolenConfirmItem(null)}
                  className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-700 text-sm font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMarkStolen}
                  className="flex-1 py-3.5 px-4 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all active:scale-95"
                >
                  Yes, Mark Stolen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
