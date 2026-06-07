'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInventory, getMe, getUsers, updateInventoryStatus, staticUrl, type InventoryItem, type User } from '@/lib/api';
import BillModal from '@/components/BillModal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import dynamic from 'next/dynamic';
import { 
  Store, User as UserIcon, ShieldCheck, CreditCard,
  Globe, LayoutDashboard, Search, Printer, 
  FileEdit, ChevronRight, TrendingUp, BarChart3
} from 'lucide-react';


const Line = dynamic(() => import('react-chartjs-2').then(mod => mod.Line), { ssr: false });
const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false });

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);



function EditRecordModal({ item, onClose, onSave }: { item: InventoryItem; onClose: () => void; onSave: () => void }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [formData, setFormData] = useState({
    sold_customer_name: item.sold_customer_name || '',
    sold_customer_phone: item.sold_customer_phone || '',
    sold_customer_email: item.sold_customer_email || '',
    shipping_address: item.shipping_address || '',
    shipping_city: item.shipping_city || '',
    shipping_pincode: item.shipping_pincode || '',
    payment_mode: item.payment_mode || 'cash',
    sale_channel: item.sale_channel || 'store'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await updateInventoryStatus(item._id, { status: item.status, ...formData });
      setStatus({ type: 'success', msg: 'Artisan record updated successfully' });
      setTimeout(onSave, 1500);
    } catch (error) {
      setStatus({ type: 'error', msg: 'Failed to update record' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-[fadeIn_300ms_ease-out]">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden">
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white">
          <div><h2 className="text-xl font-bold text-slate-900">Edit Artisan Record</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Masterpiece ID: {item.unique_item_code}</p></div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white hover:shadow-md transition-all text-slate-400"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-10 space-y-6">
          {status && (<div className={`p-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-center animate-[fadeRise_300ms_ease-out] ${status.type === 'success' ? 'bg-sky-50 text-sky-600 border border-sky-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>{status.msg}</div>)}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label><input type="text" value={formData.sold_customer_name} onChange={e => setFormData({...formData, sold_customer_name: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium" /></div>
            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mobile Number</label><input type="text" value={formData.sold_customer_phone} onChange={e => setFormData({...formData, sold_customer_phone: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium" /></div>
          </div>
          <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipping Destination</label><textarea rows={2} value={formData.shipping_address} onChange={e => setFormData({...formData, shipping_address: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium resize-none" /></div>
          <div className="pt-4 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 rounded-2xl border border-slate-200 text-sm font-bold text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" disabled={loading} className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white text-sm font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-blue-600 transition-all">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirm Artisan Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SoldInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedBillItems, setSelectedBillItems] = useState<InventoryItem[] | null>(null);
  const [selectedBillDate, setSelectedBillDate] = useState<string>('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [historyUser, setHistoryUser] = useState<User | null>(null);

  // Helper: find full User object from a populated sold_by field
  function resolveUser(populated: any): User | null {
    if (!populated || typeof populated !== 'object') return null;
    // Try to find the full user in allUsers by _id
    const full = allUsers.find(u => u._id === (populated._id || populated));
    if (full) return full;
    // Fall back to a synthesized User-like object from populated data
    if (populated.name) return { ...populated } as User;
    return null;
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [meRes, invRes, usersRes] = await Promise.all([
          getMe().catch(() => null),
          getInventory({ status: 'sold', limit: '200', page: '1' }),
          getUsers(undefined, 1, 300).catch(() => ({ data: [] })),
        ]);
        setUser(meRes);
        setItems(invRes.data);
        setAllUsers((usersRes as any).data || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load artisan records');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Global Barcode Scanner Listener
  useEffect(() => {
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
          // Barcode scan completed
          setSearch(barcodeBuffer);
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const productName = typeof item.product_id === 'object' ? item.product_id.name : '';
      const haystack = [item.unique_item_code, item.barcode, item.sale_reference, (item as any).invoice_number, productName, item.sold_customer_name, item.sold_customer_phone, item.sale_channel, item.payment_mode].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  const chartData = useMemo(() => {
    if (!items.length) return null;
    
    // Sort items by date
    const sorted = [...items].sort((a, b) => new Date(a.sold_at || 0).getTime() - new Date(b.sold_at || 0).getTime());
    
    // Group by date
    const groups: Record<string, { revenue: number, profit: number, count: number }> = {};
    sorted.forEach(item => {
      const date = item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';
      if (!groups[date]) groups[date] = { revenue: 0, profit: 0, count: 0 };
      groups[date].revenue += (item.selling_price || 0);
      groups[date].profit += ((item.selling_price || 0) - (item.purchase_price || 0));
      groups[date].count += 1;
    });

    const labels = Object.keys(groups);
    const revenue = labels.map(l => groups[l].revenue);
    const profit = labels.map(l => groups[l].profit);

    return {
      revenueData: {
        labels,
        datasets: [{
          label: 'Revenue Trajectory',
          data: revenue,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#2563eb',
          pointBorderWidth: 2,
        }]
      },
      profitData: {
        labels,
        datasets: [{
          label: 'Net Profit Margin',
          data: profit,
          backgroundColor: '#10b981',
          borderRadius: 8,
          barThickness: 32,
        }]
      }
    };
  }, [items]);

  const showCharts = !search.trim();

  return (
    <div className="animate-[fadeRise_400ms_ease-out] pb-20">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Artisan Transaction Ledger</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Authorized compliance and masterpiece settlement records.</p>
        </div>
        <div className="relative group">
          <input
            className="w-full md:w-80 pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm group-hover:shadow-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master records..."
          />
          <svg className="absolute left-3.5 top-3.5 text-slate-400 group-focus-within:text-blue-600 transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* Staff Performance Leaderboards */}
      {!loading && items.length > 0 && showCharts && (() => {
        const cashierMap: Record<string, { id: string; name: string; branch: string; count: number; revenue: number }> = {};
        const managerMap: Record<string, { id: string; name: string; branch: string; count: number; revenue: number }> = {};

        items.forEach(item => {
          const branchName = (item as any).sold_at_branch_id?.name || 'Direct Sale';
          
          const cashier = (item as any).sold_by_user_id;
          if (cashier && typeof cashier === 'object' && cashier.name) {
            const id = cashier._id || cashier.name;
            if (!cashierMap[id]) cashierMap[id] = { id: cashier._id || '', name: cashier.name, branch: branchName, count: 0, revenue: 0 };
            cashierMap[id].count += 1;
            cashierMap[id].revenue += item.selling_price || 0;
          }

          const manager = (item as any).sold_by_manager_id;
          if (manager && typeof manager === 'object' && manager.name) {
            const id = manager._id || manager.name;
            if (!managerMap[id]) managerMap[id] = { id: manager._id || '', name: manager.name, branch: branchName, count: 0, revenue: 0 };
            managerMap[id].count += 1;
            managerMap[id].revenue += item.selling_price || 0;
          }
        });

        const cashierList = Object.values(cashierMap).sort((a, b) => b.revenue - a.revenue);
        const managerList = Object.values(managerMap).sort((a, b) => b.revenue - a.revenue);
        
        if (!cashierList.length && !managerList.length) return null;
        
        const maxCashierRev = Math.max(...cashierList.map(c => c.revenue), 1);
        const maxManagerRev = Math.max(...managerList.map(c => c.revenue), 1);
        const rankColors = ['#4f46e5','#6366f1','#818cf8','#a5b4fc','#c7d2fe'];

        return (
          <div className="mb-10 grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Cashier Leaderboard */}
            {cashierList.length > 0 && (
              <div className="bg-white rounded-[2.5rem] border border-blue-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-blue-50 flex items-center gap-3 bg-gradient-to-r from-blue-50/60 to-slate-50">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Cashier Leaderboard</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Revenue attributed to cashiers</p>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {cashierList.slice(0, 5).map((c, i) => {
                    const fullUser = allUsers.find(u => u._id === c.id) || ({ name: c.name, _id: c.id, role: 'cashier', email: '', is_active: true, created_at: '' } as User);
                    return (
                    <button
                      key={c.name}
                      onClick={() => setHistoryUser(fullUser)}
                      className="relative flex flex-col gap-2 p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-md hover:border-blue-200 transition-all hover:-translate-y-0.5 text-left w-full"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black shadow-sm overflow-hidden" style={{ background: (fullUser as any).avatar ? 'transparent' : (rankColors[i] ?? '#e0e7ff') }}>
                          {(fullUser as any).avatar ? (
                            <img src={staticUrl((fullUser as any).avatar)} className="w-full h-full object-cover" />
                          ) : (
                            c.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-black text-slate-900 truncate">{c.name}</p>
                          <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Cashier • {c.branch}</p>
                        </div>
                      </div>
                      <div className="mt-1">
                        <p className="text-lg font-black text-blue-700">₹{c.revenue.toLocaleString('en-IN')}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{c.count} sale{c.count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((c.revenue / maxCashierRev) * 100)}%`, background: rankColors[i] ?? '#e0e7ff' }} />
                      </div>
                      {i === 0 && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
                          <svg width="10" height="10" fill="white" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        </div>
                      )}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manager Leaderboard */}
            {managerList.length > 0 && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Manager Leaderboard</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Revenue authorized by managers</p>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {managerList.slice(0, 5).map((c, i) => {
                    const fullUser = allUsers.find(u => u._id === c.id) || ({ name: c.name, _id: c.id, role: 'manager', email: '', is_active: true, created_at: '' } as User);
                    return (
                    <button
                      key={c.name}
                      onClick={() => setHistoryUser(fullUser)}
                      className="relative flex flex-col gap-2 p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-md hover:border-violet-200 transition-all hover:-translate-y-0.5 text-left w-full"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black shadow-sm overflow-hidden" style={{ background: (fullUser as any).avatar ? 'transparent' : '#334155' }}>
                          {(fullUser as any).avatar ? (
                            <img src={staticUrl((fullUser as any).avatar)} className="w-full h-full object-cover" />
                          ) : (
                            c.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-black text-slate-900 truncate">{c.name}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Manager • {c.branch}</p>
                        </div>
                      </div>
                      <div className="mt-1">
                        <p className="text-lg font-black text-slate-800">₹{c.revenue.toLocaleString('en-IN')}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{c.count} sale{c.count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((c.revenue / maxManagerRev) * 100)}%`, background: '#64748b' }} />
                      </div>
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Intelligence Dashboard Section */}
      {!loading && chartData && showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Revenue Trajectory</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Daily settlement velocity</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
            </div>
            <div className="h-[280px]">
              <Line 
                data={chartData.revenueData} 
                options={{ 
                  maintainAspectRatio: false, 
                  plugins: { legend: { display: false }, tooltip: { padding: 12, backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 14, weight: 'bold' } } },
                  scales: { 
                    y: { grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#94a3b8' } }
                  }
                }} 
              />
            </div>
          </div>

          <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Strategic Profitability</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Realized Net ROI index</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
            </div>
            <div className="h-[280px]">
              <Bar 
                data={chartData.profitData} 
                options={{ 
                  maintainAspectRatio: false, 
                  plugins: { legend: { display: false }, tooltip: { padding: 12, backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 14, weight: 'bold' } } },
                  scales: { 
                    y: { grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#94a3b8' } }
                  }
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[11px] font-black uppercase tracking-widest text-center">{error}</div>}

      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-40">
            <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-40">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No matching records located in the vault.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Masterpiece</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipping & Fulfillment</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Store & Authority</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Financials</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  return (
                    <tr key={item._id} className="group hover:bg-slate-50/30 transition-colors duration-200">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className="relative group/img">
                            <div className="absolute -inset-1 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-xl blur opacity-20 group-hover/img:opacity-40 transition-opacity" />
                            <div className="relative w-14 h-14 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm flex-shrink-0">
                              {product?.images?.[0] ? (
                                <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500" />
                              ) : (
                                <div className="h-full flex items-center justify-center bg-slate-50 text-slate-300">
                                  <LayoutDashboard size={20} />
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">{product?.name || 'Artisan Work'}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded-lg tracking-wider border border-slate-200">
                                {item.unique_item_code}
                              </span>
                              {item.sale_reference && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg tracking-wider border border-emerald-200">
                                  INV: {item.sale_reference}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <p className="text-sm font-black text-slate-800">{item.sold_customer_name || '—'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-medium text-slate-500">{item.sold_customer_phone || item.sold_customer_email || 'No contact'}</span>
                            {item.sold_at && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300" />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  {new Date(item.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-medium text-slate-600 max-w-[200px] line-clamp-2 italic leading-relaxed">
                          {item.shipping_address ? `${item.shipping_address}, ${item.shipping_city}` : 'Store Collection Managed'}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="space-y-4">
                          {/* Branch / Channel Badge */}
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full ${(item.sold_at_branch_id as any)?.name ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]'}`} />
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.15em] antialiased">
                              {(item.sold_at_branch_id as any)?.name || 'Direct Sale'}
                            </span>
                          </div>

                          {/* Personnel Stack */}
                          <div className="space-y-2.5 pl-0.5">
                            {/* Manager Row */}
                            {(() => {
                              const mgr = (item as any).sold_by_manager_id;
                              const mgrUser = resolveUser(mgr);
                              return (
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 flex-shrink-0 overflow-hidden">
                                    {mgrUser && (mgrUser as any).avatar ? (
                                      <img src={staticUrl((mgrUser as any).avatar)} className="w-full h-full object-cover" />
                                    ) : (
                                      <ShieldCheck size={11} className="text-slate-500" />
                                    )}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Manager</span>
                                    {mgrUser ? (
                                      <button onClick={() => setHistoryUser(mgrUser)} className="text-[11px] font-bold text-slate-700 leading-none hover:text-blue-600 transition-colors text-left">
                                        {mgrUser.name}
                                      </button>
                                    ) : (
                                      <span className="text-[11px] font-medium text-slate-400 leading-none">—</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Cashier Row */}
                            {(() => {
                              const csh = (item as any).sold_by_user_id;
                              const cshUser = resolveUser(csh);
                              return (
                                <div className="flex items-center gap-3">
                                  {cshUser ? (
                                    <>
                                      <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0 overflow-hidden">
                                        {(cshUser as any).avatar ? (
                                          <img src={staticUrl((cshUser as any).avatar)} className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="text-[9px] font-black text-white">
                                            {cshUser.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-0.5">Staff</span>
                                        <button onClick={() => setHistoryUser(cshUser)} className="text-[11px] font-black text-blue-700 uppercase tracking-tight leading-none hover:text-blue-500 transition-colors text-left">
                                          {cshUser.name}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center border border-dashed border-slate-300 flex-shrink-0">
                                        <UserIcon size={11} className="text-slate-300" />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none mb-0.5">Staff</span>
                                        <span className="text-[10px] font-medium text-slate-400 italic leading-none">Not assigned</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <CreditCard size={12} className="text-slate-400" />
                            <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{item.payment_mode || 'TRANSFER'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Globe size={12} className="text-blue-400" />
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">{item.sale_channel || 'DIRECT'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] font-bold text-slate-400">₹</span>
                            <span className="text-base font-black text-slate-900 tracking-tight">
                              {Math.round(Number(item.selling_price || 0)).toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <TrendingUp size={10} className="text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">
                              ROI: ₹{Math.round(item.selling_price - item.purchase_price).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              setSelectedBillItems([item]);
                              setSelectedBillDate(item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-US', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-US', { dateStyle: 'long' }));
                            }}
                            className="p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all transform active:scale-95 shadow-sm"
                            title="Print Signature Bill"
                          ><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg></button>
                          {user?.role === 'admin' && (
                            <button 
                              onClick={() => setEditingItem(item)}
                              className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-blue-600 hover:text-white transition-all transform active:scale-95 shadow-sm"
                              title="Edit Compliance Record"
                            ><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBillItems && <BillModal items={selectedBillItems} date={selectedBillDate} onClose={() => setSelectedBillItems(null)} />}
      {editingItem && (
        <EditRecordModal 
          item={editingItem} 
          onClose={() => setEditingItem(null)} 
          onSave={() => { setEditingItem(null); window.location.reload(); }} 
        />
      )}
      {historyUser && (
        <UserHistoryDrawer user={historyUser} onClose={() => setHistoryUser(null)} />
      )}
    </div>
  );
}
