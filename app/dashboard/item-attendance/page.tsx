'use client';
import { useEffect, useState } from 'react';
import { getBranches, Branch, getItemAttendanceDailyStats, ItemAttendanceDailyStats, getAttendanceTrends, AttendanceTrendPoint } from '@/lib/api';
import { Building2, Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ItemAttendanceAdminPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [fetchingStats, setFetchingStats] = useState(false);
  const [stats, setStats] = useState<ItemAttendanceDailyStats | null>(null);
  const [trends, setTrends] = useState<AttendanceTrendPoint[]>([]);
  const [tab, setTab] = useState<'missing' | 'present'>('missing');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getBranches()
      .then(res => {
        setBranches(res);
        if (res.length > 0) {
          setSelectedBranch(res[0]._id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) return;
    setFetchingStats(true);
    Promise.all([
      getItemAttendanceDailyStats(selectedBranch),
      getAttendanceTrends(selectedBranch, 7)
    ]).then(([statsRes, trendsRes]) => {
      setStats(statsRes);
      setTrends(trendsRes.reverse());
    }).catch(console.error)
    .finally(() => setFetchingStats(false));
  }, [selectedBranch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const total = stats?.total_active_items || 0;
  const present = stats?.present_count || 0;
  const missing = stats?.missing_count || 0;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const displayMissing = stats?.missing_items?.filter((item: any) => 
    item.product_id?.name?.toLowerCase().includes(search.toLowerCase()) || 
    item.barcode?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const displayPresent = stats?.present_items?.filter((record: any) => 
    record.item_id?.product_id?.name?.toLowerCase().includes(search.toLowerCase()) || 
    record.item_id?.barcode?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="max-w-[1600px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Item Attendance</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Branch Daily Inventory Audit Status • {fmtDate(new Date())}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-[2rem] border border-slate-200 shadow-sm min-w-[300px]">
          <Building2 className="w-5 h-5 text-slate-400 ml-4" />
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="flex-1 bg-transparent py-3 pr-6 focus:outline-none text-sm font-bold text-slate-900 outline-none"
          >
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {fetchingStats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 relative overflow-hidden group shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Total Expected</p>
              <h3 className="text-4xl font-black text-slate-900">{total}</h3>
              <p className="text-[10px] font-bold text-slate-500 mt-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Active & Returned Items
              </p>
            </div>

            <div className="bg-white border border-emerald-200 rounded-[2rem] p-8 relative overflow-hidden group shadow-sm">
              <div className="absolute top-0 right-0 p-8 opacity-10 text-emerald-500">
                <CheckCircle2 className="w-20 h-20" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 mb-2">Verified</p>
              <h3 className="text-4xl font-black text-emerald-700">{present}</h3>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Completion</span>
                  <span className="text-[10px] font-black text-emerald-700">{pct}%</span>
                </div>
                <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-white border border-red-200 rounded-[2rem] p-8 relative overflow-hidden group shadow-sm">
               <div className="absolute top-0 right-0 p-8 opacity-10 text-red-500">
                 <AlertCircle className="w-20 h-20" />
               </div>
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 mb-2">Missing</p>
               <h3 className="text-4xl font-black text-red-700">{missing}</h3>
               <p className="text-[10px] font-bold text-red-500 mt-3 flex items-center gap-1.5">
                 <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                 Pending physical scan
               </p>
            </div>
          </div>

          {/* Trends */}
          {trends.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-400">7-Day Attendance Trend</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/><span className="text-[10px] font-bold text-slate-500 uppercase">Verified</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/><span className="text-[10px] font-bold text-slate-500 uppercase">Missing</span></div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-2 h-40">
                {trends.map((t, i) => {
                  const maxVal = Math.max(...trends.map(x => Math.max(1, x.total)));
                  const hP = (t.present / maxVal) * 100;
                  const hM = (t.missing / maxVal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3 group relative">
                      <div className="w-full max-w-[2.5rem] h-full flex flex-col justify-end gap-1 relative z-10 bg-slate-50 rounded-xl p-1">
                        <div className="w-full bg-red-500 rounded-lg transition-all duration-500 hover:bg-red-400" style={{ height: `${hM}%`, minHeight: t.missing > 0 ? '4px' : '0' }}></div>
                        <div className="w-full bg-emerald-500 rounded-lg transition-all duration-500 hover:bg-emerald-400" style={{ height: `${hP}%`, minHeight: t.present > 0 ? '4px' : '0' }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                      
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

          {/* List Section */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col min-h-[500px]">
             <div className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-slate-100 gap-4">
                <div className="flex bg-slate-50 p-1.5 rounded-[1.5rem] border border-slate-100">
                  <button
                    onClick={() => setTab('missing')}
                    className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      tab === 'missing' 
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                        : 'text-slate-400 hover:text-red-600'
                    }`}
                  >
                    Pending Audit ({missing})
                  </button>
                  <button
                    onClick={() => setTab('present')}
                    className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      tab === 'present' 
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                        : 'text-slate-400 hover:text-emerald-600'
                    }`}
                  >
                    Verified Today ({present})
                  </button>
                </div>

                <div className="relative group min-w-[280px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search item or barcode..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-[1.5rem] text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-all outline-none"
                  />
                </div>
             </div>

             <div className="flex-1 overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="bg-slate-50/50 border-b border-slate-100">
                     <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Product</th>
                     <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Barcode</th>
                     <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Status</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {tab === 'missing' ? (
                      displayMissing.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-32 text-center text-slate-400 italic text-sm font-medium">No pending items matched.</td>
                        </tr>
                      ) : (
                        displayMissing.map((item: any) => (
                          <tr key={item._id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-8 py-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                                  {item.product_id?.images?.[0] ? (
                                    <img src={item.product_id.images[0].startsWith('http') ? item.product_id.images[0] : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${item.product_id.images[0].startsWith('/') ? '' : '/'}${item.product_id.images[0]}`} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-slate-100" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900">{item.product_id?.name || 'Unknown Product'}</p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">SKU: {item.product_id?.sku}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <span className="text-sm font-bold text-slate-600">{item.barcode}</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <span className="inline-flex items-center px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-[0.1em] rounded-full border border-red-100">
                                Missing
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                    ) : (
                      displayPresent.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-32 text-center text-slate-400 italic text-sm font-medium">No verified items matched.</td>
                        </tr>
                      ) : (
                        displayPresent.map((record: any) => (
                          <tr key={record._id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-8 py-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                                  {record.item_id?.product_id?.images?.[0] ? (
                                    <img src={record.item_id.product_id.images[0].startsWith('http') ? record.item_id.product_id.images[0] : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${record.item_id.product_id.images[0].startsWith('/') ? '' : '/'}${record.item_id.product_id.images[0]}`} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-slate-100" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900">{record.item_id?.product_id?.name || 'Unknown Product'}</p>
                                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Scanned by {record.scanned_by?.name || 'Unknown'} at {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <span className="text-sm font-bold text-slate-600">{record.item_id?.barcode}</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <span className="inline-flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.1em] rounded-full border border-emerald-100">
                                Verified
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                    )}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
