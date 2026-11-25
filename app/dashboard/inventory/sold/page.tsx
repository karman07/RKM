'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInventory, getMe, getUsers, getBranches, updateInventoryStatus, fetchAllPages, staticUrl, type InventoryItem, type User, type Branch } from '@/lib/api';
import BillModal from '@/components/BillModal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import dynamic from 'next/dynamic';
import {
  Store, User as UserIcon, ShieldCheck, CreditCard,
  Globe, LayoutDashboard, Search, Printer,
  FileEdit, ChevronRight, TrendingUp, BarChart3, Download, Loader2
} from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import { downloadCsv } from '@/lib/export-utils';


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
          {status && (<div className={`p-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-center animate-[fadeRise_300ms_ease-out] ${status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>{status.msg}</div>)}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label><input type="text" value={formData.sold_customer_name} onChange={e => setFormData({...formData, sold_customer_name: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium" /></div>
            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mobile Number</label><input type="text" value={formData.sold_customer_phone} onChange={e => setFormData({...formData, sold_customer_phone: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium" /></div>
          </div>
          <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipping Destination</label><textarea rows={2} value={formData.shipping_address} onChange={e => setFormData({...formData, shipping_address: e.target.value})} className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none transition-all text-sm font-medium resize-none" /></div>
          <div className="pt-4 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 rounded-2xl border border-slate-200 text-sm font-bold text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" disabled={loading} className="flex-[2] py-4 rounded-2xl bg-blue-600 text-white text-sm font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirm Artisan Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * What the customer was actually billed for this item. The server stores it as `final_sale_price` when the sale is
 * saved (worked out from the bill's payments). `selling_price` alone can be the pre-discount list price, so it is only a
 * fallback for sales that predate the field.
 */
const netSalePrice = (item: { selling_price?: number; final_sale_price?: number | null }) =>
  Math.round(Number(item.final_sale_price ?? item.selling_price) || 0);

// The item's own recorded weight; falls back to the product's catalogue weight when the item has none (0/unset).
function soldWeight(item: any, field: 'gross_weight' | 'net_weight' | 'stone_weight'): number | '' {
  const own = Number(item?.[field]);
  if (own > 0) return own;
  const fromProduct = typeof item?.product_id === 'object' ? Number(item.product_id?.[field]) : NaN;
  return fromProduct > 0 ? fromProduct : '';
}

const idOf = (v: any): string => (v && typeof v === 'object' ? String(v._id ?? '') : v ? String(v) : '');

/** Everyone credited on a sale: the multi-staff list, else the single legacy seller. De-duplicated, populated user objects where available. */
function creditedStaff(item: any): any[] {
  const list = Array.isArray(item?.sold_by_user_ids) && item.sold_by_user_ids.length
    ? item.sold_by_user_ids
    : item?.sold_by_user_id ? [item.sold_by_user_id] : [];
  const seen = new Set<string>();
  return list.filter((u: any) => {
    const id = idOf(u);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Calendar day (YYYY-MM-DD) of a timestamp in the viewer's local time, so a 1am sale isn't counted on the previous UTC day. */
function localDay(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const catName = (item: any): string => {
  const c = typeof item?.product_id === 'object' ? item.product_id?.category_id : null;
  return (c && typeof c === 'object' ? c.name : '') || '';
};

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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

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
        const [meRes, soldItems, usersRes, branchesRes] = await Promise.all([
          getMe().catch(() => null),
          fetchAllPages<InventoryItem>((page, limit) => getInventory({ status: 'sold', limit: String(limit), page: String(page) }), 200),
          getUsers(undefined, 1, 300).catch(() => ({ data: [] })),
          getBranches().catch(() => []),
        ]);
        setUser(meRes);
        setItems(soldItems);
        setAllUsers((usersRes as any).data || []);
        setBranches(branchesRes);
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

  const paymentModes = useMemo(
    () => Array.from(new Set(items.map(i => i.payment_mode).filter((m): m is string => Boolean(m)))).sort(),
    [items],
  );

  const channels = useMemo(
    () => Array.from(new Set(items.map(i => i.sale_channel).filter((m): m is string => Boolean(m)))).sort(),
    [items],
  );
  const categoryNames = useMemo(
    () => Array.from(new Set(items.map(catName).filter(Boolean))).sort(),
    [items],
  );
  // Everyone who appears on a sale (sales agents / cashiers credited, plus the authorising manager) for the Staff filter.
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      for (const u of [...creditedStaff(it), (it as any).sold_by_manager_id]) {
        const id = idOf(u);
        const name = u && typeof u === 'object' ? u.name : '';
        if (id && name) map.set(id, name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount === '' ? null : Number(minAmount);
    const max = maxAmount === '' ? null : Number(maxAmount);
    return items.filter((item) => {
      const day = localDay(item.sold_at);
      if (fromDate && (!day || day < fromDate)) return false;
      if (toDate && (!day || day > toDate)) return false;
      if (branchFilter !== 'all') {
        const branchId = typeof item.sold_at_branch_id === 'object' ? item.sold_at_branch_id?._id : item.sold_at_branch_id;
        if (branchId !== branchFilter) return false;
      }
      if (modeFilter !== 'all' && item.payment_mode !== modeFilter) return false;
      if (channelFilter !== 'all' && (item.sale_channel || 'store') !== channelFilter) return false;
      if (categoryFilter !== 'all' && catName(item) !== categoryFilter) return false;
      if (staffFilter !== 'all') {
        const ids = [...creditedStaff(item).map(idOf), idOf((item as any).sold_by_manager_id)];
        if (!ids.includes(staffFilter)) return false;
      }
      if (min !== null || max !== null) {
        const price = netSalePrice(item);
        if (min !== null && price < min) return false;
        if (max !== null && price > max) return false;
      }
      if (!q) return true;
      const productName = typeof item.product_id === 'object' ? item.product_id?.name : '';
      const staffNames = creditedStaff(item).map((u: any) => u?.name).filter(Boolean).join(' ');
      const haystack = [item.unique_item_code, item.barcode, item.sale_reference, (item as any).invoice_number, productName, item.sold_customer_name, item.sold_customer_phone, item.sale_channel, item.payment_mode, staffNames, (item as any).sold_by_manager_id?.name].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, fromDate, toDate, branchFilter, modeFilter, channelFilter, categoryFilter, staffFilter, minAmount, maxAmount]);

  const hasFilters = Boolean(search || branchFilter !== 'all' || modeFilter !== 'all' || channelFilter !== 'all' || categoryFilter !== 'all' || staffFilter !== 'all' || minAmount || maxAmount || fromDate || toDate);
  const clearFilters = () => {
    setSearch(''); setBranchFilter('all'); setModeFilter('all'); setChannelFilter('all'); setCategoryFilter('all');
    setStaffFilter('all'); setMinAmount(''); setMaxAmount(''); setFromDate(''); setToDate('');
  };
  const filteredTotal = useMemo(() => filtered.reduce((sum, it) => sum + netSalePrice(it), 0), [filtered]);

  function applyPreset(kind: 'today' | '7d' | 'month' | 'lastmonth') {
    const now = new Date();
    const fmt = (d: Date) => localDay(d.toISOString());
    if (kind === 'today') { setFromDate(fmt(now)); setToDate(fmt(now)); }
    else if (kind === '7d') { const d = new Date(now); d.setDate(d.getDate() - 6); setFromDate(fmt(d)); setToDate(fmt(now)); }
    else if (kind === 'month') { setFromDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1))); setToDate(fmt(now)); }
    else { setFromDate(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setToDate(fmt(new Date(now.getFullYear(), now.getMonth(), 0))); }
  }

  function handleExportHistory() {
    setExporting(true);
    try {
      downloadCsv('sales-records', filtered, [
        { header: 'Date', accessor: (r) => localDay(r.sold_at) },
        { header: 'Time', accessor: (r) => (r.sold_at ? new Date(r.sold_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '') },
        { header: 'Invoice', accessor: (r) => (r as any).sale_reference || '' },
        { header: 'Item', accessor: (r) => (typeof r.product_id === 'object' ? r.product_id?.name : '') || 'Artisan Work' },
        { header: 'Category', accessor: (r) => catName(r) },
        { header: 'SKU', accessor: (r) => (typeof r.product_id === 'object' ? (r.product_id as any)?.sku : '') || '' },
        { header: 'Item Code', accessor: 'unique_item_code' },
        { header: 'Gross Weight (g)', accessor: (r) => soldWeight(r, 'gross_weight') },
        { header: 'Net Weight (g)', accessor: (r) => soldWeight(r, 'net_weight') },
        { header: 'Stone Weight (g)', accessor: (r) => soldWeight(r, 'stone_weight') },
        { header: 'Customer', accessor: (r) => r.sold_customer_name || 'Walk-in Customer' },
        { header: 'Phone', accessor: (r) => r.sold_customer_phone || '' },
        { header: 'Branch', accessor: (r) => (typeof r.sold_at_branch_id === 'object' ? (r.sold_at_branch_id as any)?.name : '') || 'Direct Sale' },
        { header: 'Cashier', accessor: (r) => creditedStaff(r).filter((u: any) => u?.role === 'cashier').map((u: any) => u.name).join(' / ') },
        { header: 'Sales Agent(s)', accessor: (r) => creditedStaff(r).filter((u: any) => u?.role !== 'cashier').map((u: any) => u.name).join(' / ') },
        { header: 'Credited Staff Count', accessor: (r) => creditedStaff(r).length },
        { header: 'Manager', accessor: (r) => (typeof (r as any).sold_by_manager_id === 'object' ? (r as any).sold_by_manager_id?.name : '') || '' },
        { header: 'Channel', accessor: (r) => r.sale_channel || 'store' },
        { header: 'Payment Mode', accessor: (r) => r.payment_mode || '' },
        { header: 'List Price (Rs)', accessor: (r) => Math.round(Number(r.selling_price) || 0) },
        { header: 'Billed Amount (Rs)', accessor: (r) => netSalePrice(r) },
        { header: 'Cost (Rs)', accessor: (r) => r.purchase_price ?? 0 },
        { header: 'Profit (Rs)', accessor: (r) => netSalePrice(r) - (r.purchase_price ?? 0) },
      ]);
    } finally {
      setExporting(false);
    }
  }

  // One record per invoice: items sold together share a sale_reference and print as ONE bill.
  const bills = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const it of filtered) {
      const key = it.sale_reference || it._id;
      const group = map.get(key);
      if (group) group.push(it); else map.set(key, [it]);
    }
    return Array.from(map.values());
  }, [filtered]);

  const chartData = useMemo(() => {
    if (!filtered.length) return null;
    
    // Sort items by date
    const sorted = [...filtered].sort((a, b) => new Date(a.sold_at || 0).getTime() - new Date(b.sold_at || 0).getTime());
    
    // Group by date
    const groups: Record<string, { revenue: number, profit: number, count: number }> = {};
    sorted.forEach(item => {
      const date = item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';
      if (!groups[date]) groups[date] = { revenue: 0, profit: 0, count: 0 };
      groups[date].revenue += netSalePrice(item);
      groups[date].profit += (netSalePrice(item) - (item.purchase_price || 0));
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
          borderColor: '#263a5e',
          backgroundColor: 'rgba(38, 58, 94, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#263a5e',
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
  }, [filtered]);

  return (
    <div className="animate-[fadeRise_400ms_ease-out] pb-20">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Artisan Transaction Ledger</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Authorized compliance and masterpiece settlement records.</p>
        </div>
        <button
          onClick={handleExportHistory}
          disabled={exporting || filtered.length === 0}
          className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-60 self-start md:self-auto"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download History ({filtered.length})
        </button>
      </div>

      <div className="mb-10 flex flex-wrap items-center gap-3 p-4 rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="relative group flex-1 min-w-[220px]">
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master records..."
          />
          <svg className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-blue-600 transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
        >
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select
          value={modeFilter}
          onChange={e => setModeFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Payment Modes</option>
          {paymentModes.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</span>
          <DatePicker value={fromDate} max={toDate} onChange={setFromDate} allowClear placeholder="Any" />
          <span className="text-slate-300">—</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</span>
          <DatePicker value={toDate} min={fromDate} onChange={setToDate} allowClear placeholder="Any" align="right" />
        </div>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]">
          <option value="all">All Staff</option>
          {staffOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Channels</option>
          {channels.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').toUpperCase()}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]">
          <option value="all">All Categories</option>
          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">₹ Min</span>
          <input type="number" min={0} value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Any" className="w-20 text-xs font-bold text-slate-700 outline-none bg-transparent" />
          <span className="text-slate-300">—</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max</span>
          <input type="number" min={0} value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Any" className="w-20 text-xs font-bold text-slate-700 outline-none bg-transparent" />
        </div>
        <div className="flex items-center gap-1.5">
          {([['today', 'Today'], ['7d', '7 Days'], ['month', 'This Month'], ['lastmonth', 'Last Month']] as const).map(([k, label]) => (
            <button key={k} onClick={() => applyPreset(k)} className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all">{label}</button>
          ))}
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
          >
            Clear Filters
          </button>
        )}
        <p className="ml-auto text-[11px] font-bold text-slate-400 whitespace-nowrap">
          {loading ? 'Loading…' : `${items.length} items loaded · showing ${bills.length} bill${bills.length === 1 ? '' : 's'} (${filtered.length} item${filtered.length === 1 ? '' : 's'}) · ₹${filteredTotal.toLocaleString('en-IN')} billed`}
        </p>
      </div>

      {/* Staff Performance Leaderboards — built from the FILTERED records, so every filter above applies. A sale shared by several
          staff is split equally between them (same rule the incentive engine uses), so board totals add up to the real total. */}
      {!loading && filtered.length > 0 && (() => {
        type Row = { id: string; name: string; role: string; branch: string; count: number; revenue: number };
        const cashiers: Record<string, Row> = {};
        const agents: Record<string, Row> = {};
        const managers: Record<string, Row> = {};
        const add = (map: Record<string, Row>, u: any, role: string, branch: string, share: number, value: number) => {
          const id = idOf(u) || u?.name;
          if (!id || !u?.name) return;
          if (!map[id]) map[id] = { id: idOf(u), name: u.name, role, branch, count: 0, revenue: 0 };
          map[id].count += share;
          map[id].revenue += value * share;
        };

        filtered.forEach(item => {
          const branchName = (item as any).sold_at_branch_id?.name || 'Direct Sale';
          const value = netSalePrice(item);
          const staff = creditedStaff(item);
          // Managers/admins credited as the seller count on the Manager board (full value, once per item); everyone else is split equally.
          const isMgr = (u: any) => u?.role === 'manager' || u?.role === 'admin';
          const sellers = staff.filter((u: any) => !isMgr(u));
          const mgrs = new Map<string, any>();
          staff.filter(isMgr).forEach((u: any) => mgrs.set(idOf(u), u));
          const authorising = (item as any).sold_by_manager_id;
          if (authorising && typeof authorising === 'object') mgrs.set(idOf(authorising), authorising);
          sellers.forEach((u: any) => add(u?.role === 'cashier' ? cashiers : agents, u, u?.role === 'cashier' ? 'Cashier' : 'Sales', branchName, 1 / sellers.length, value));
          mgrs.forEach((u: any) => add(managers, u, 'Manager', branchName, 1, value));
        });

        const boards = [
          { key: 'cashier', title: 'Cashier Leaderboard', sub: 'Revenue attributed to cashiers', rows: Object.values(cashiers), accent: '#2563eb' },
          { key: 'sales', title: 'Sales Team Leaderboard', sub: 'Revenue credited to sales agents (split equally on shared bills)', rows: Object.values(agents), accent: '#059669' },
          { key: 'manager', title: 'Manager Leaderboard', sub: 'Revenue sold or authorized by managers', rows: Object.values(managers), accent: '#475569' },
        ]
          .map(b => ({ ...b, rows: b.rows.sort((x, y) => y.revenue - x.revenue) }))
          .filter(b => b.rows.length > 0);
        if (!boards.length) return null;

        return (
          <div className="mb-10 grid grid-cols-1 xl:grid-cols-3 gap-6">
            {boards.map(board => {
              const max = Math.max(...board.rows.map(r => r.revenue), 1);
              return (
                <div key={board.key} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                    <h3 className="text-base font-black text-slate-900">{board.title}</h3>
                    <p className="text-[11px] text-slate-500 font-medium">{board.sub}</p>
                  </div>
                  <div className="p-4 flex flex-col gap-2">
                    {board.rows.slice(0, 5).map((c, i) => {
                      const fullUser = allUsers.find(u => u._id === c.id) || ({ name: c.name, _id: c.id, role: board.key === 'cashier' ? 'cashier' : 'manager', email: '', is_active: true, created_at: '' } as User);
                      const count = Math.round(c.count * 100) / 100;
                      return (
                        <button
                          key={c.id || c.name}
                          onClick={() => setStaffFilter(c.id || 'all')}
                          title="Click to filter this page to this person"
                          className="relative flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all text-left w-full"
                        >
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 overflow-hidden" style={{ background: (fullUser as any).avatar ? 'transparent' : board.accent, opacity: 1 - i * 0.12 }}>
                            {(fullUser as any).avatar ? <img src={staticUrl((fullUser as any).avatar)} className="w-full h-full object-cover" /> : c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-black text-slate-900 truncate">{i + 1}. {c.name}</p>
                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                              <div className="h-full rounded-full" style={{ width: `${Math.round((c.revenue / max) * 100)}%`, background: board.accent }} />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-slate-800">₹{Math.round(c.revenue).toLocaleString('en-IN')}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{count} sale{count !== 1 ? 's' : ''}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Intelligence Dashboard Section */}
      {!loading && chartData && (
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
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
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
                {bills.map((billItems) => {
                  const item = billItems[0];   // customer, branch, staff and payment are the same for every item of a bill
                  const billTotal = billItems.reduce((sum, bi) => sum + netSalePrice(bi), 0);
                  const billCost = billItems.reduce((sum, bi) => sum + Math.round(bi.purchase_price || 0), 0);
                  return (
                    <tr key={item.sale_reference || item._id} className="group hover:bg-slate-50/30 transition-colors duration-200">
                      <td className="px-8 py-6">
                        <div className="space-y-4">
                          {billItems.length > 1 && (
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg tracking-wider">{billItems.length} items · 1 invoice</span>
                              {item.sale_reference && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg tracking-wider border border-emerald-200">INV: {item.sale_reference}</span>
                              )}
                            </div>
                          )}
                          {billItems.map((bi) => {
                            const product = typeof bi.product_id === 'object' ? bi.product_id : null;
                            return (
                              <div key={bi._id} className="flex items-center gap-5">
                                <div className="relative group/img">
                                  <div className="absolute -inset-1 bg-gradient-to-tr from-blue-500 to-blue-700 rounded-xl blur opacity-20 group-hover/img:opacity-40 transition-opacity" />
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
                                      {bi.unique_item_code}
                                    </span>
                                    {billItems.length === 1 && bi.sale_reference && (
                                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg tracking-wider border border-emerald-200">
                                        INV: {bi.sale_reference}
                                      </span>
                                    )}
                                    {user?.role === 'admin' && billItems.length > 1 && (
                                      <button onClick={() => setEditingItem(bi)} className="text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 underline">edit</button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <p className="text-sm font-black text-slate-800">{item.sold_customer_name || '—'}</p>
                          {item.old_gold_reference && <p className="text-[10px] font-black text-amber-700 mt-0.5">Old Gold Ref: {item.old_gold_reference}</p>}
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
                            <div className={`w-2 h-2 rounded-full ${(item.sold_at_branch_id as any)?.name ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'bg-blue-400 shadow-[0_0_8px_rgba(113,134,181,0.4)]'}`} />
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
                              {billTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <TrendingUp size={10} className="text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">
                              ROI: ₹{(billTotal - billCost).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              // A multi-item bill must print as one invoice: its payments are stored for the whole bill, so
                              // printing a single item would show that item against everything the customer paid.
                              const sameBill = item.sale_reference ? items.filter(i => i.sale_reference === item.sale_reference) : [];
                              setSelectedBillItems(sameBill.length > 0 ? sameBill : [item]);
                              setSelectedBillDate(item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-US', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-US', { dateStyle: 'long' }));
                            }}
                            className="p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all transform active:scale-95 shadow-sm"
                            title="Print Signature Bill"
                          ><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg></button>
                          {user?.role === 'admin' && billItems.length === 1 && (
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
