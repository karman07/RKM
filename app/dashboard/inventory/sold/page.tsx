'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInventory, getMe, updateInventoryStatus, staticUrl, type InventoryItem, type User } from '@/lib/api';
import dynamic from 'next/dynamic';

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

function BillModal({ items, date, onClose }: { items: InventoryItem[], date: string, onClose: () => void }) {
  const total = items.reduce((acc, item) => acc + (item.selling_price || 0), 0);
  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-2 md:p-4 print:p-0 print:bg-white overflow-y-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: auto;  margin: 0mm; }
        @media print {
          body { background: white; margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #printable-bill, #printable-bill * { visibility: visible; }
          #printable-bill { 
            position: absolute; left: 0; top: 0; 
            width: 780px !important; margin: 0; padding: 1.2cm;
            box-shadow: none !important; border: none !important;
          }
        }
      `}} />
      <div id="printable-bill" className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl print:shadow-none print:rounded-none my-auto font-sans">
        <div className="px-8 md:px-12 py-6 border-b border-slate-100 flex items-center justify-between print:hidden bg-slate-50/50 rounded-t-[2.5rem]">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Compliance Document</h2>
          <div className="flex items-center gap-3">
            <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[11px] font-bold uppercase tracking-widest bg-[#1A6B3A] shadow-lg shadow-emerald-900/20 transition-transform active:scale-95">
              Print Bill
            </button>
            <button onClick={onClose} className="p-2.5 rounded-full hover:bg-white hover:shadow-md transition-all text-slate-400 hover:text-red-500">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-8 md:p-14 lg:p-16 print:p-0 relative bg-white">
          <div className="flex justify-between items-start mb-10">
            <div className="flex flex-col gap-4">
              <div className="w-24 h-24 mb-2">
                <img src="/RKM LOGO PNG.png" alt="RKM Logo" className="w-full h-full object-contain" />
              </div>
              <p className="text-[10px] md:text-[12px] font-bold text-slate-400 uppercase tracking-[0.6em] mb-4">OFFICIAL SETTLEMENT</p>
              <div className="space-y-1 text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                <p><span className="text-[#1A6B3A]">MOB:</span> +91 88139 47793</p>
                <p><span className="text-[#1A6B3A]">WEB:</span> WWW.RKMJEWELLERS.COM</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-2">INVOICE</h2>
              <p className="text-sm font-medium text-slate-500">{date}</p>
            </div>
          </div>
          <div className="h-[4px] w-full mb-10 bg-[#1A6B3A]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1A6B3A]">BILLED TO</p>
              <h3 className="text-2xl font-serif font-bold text-slate-900">{items[0]?.sold_customer_name || 'Valued Client'}</h3>
              <div className="space-y-1 text-slate-600 text-sm">
                <p className="font-bold">{items[0]?.sold_customer_phone || ''}</p>
                <p>{items[0]?.sold_customer_email || ''}</p>
                <p className="text-slate-400 max-w-[300px] leading-relaxed">
                  {items[0]?.shipping_address ? `${items[0].shipping_address}, ${items[0].shipping_city}, ${items[0].shipping_pincode}` : 'Store Collection Asset'}
                </p>
              </div>
            </div>
            <div className="md:text-right space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1A6B3A]">DETAILS</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-slate-400">ASSET CODE: </span> <span className="font-bold text-slate-900">{items[0]?.unique_item_code}</span></p>
                <p><span className="text-slate-400">Settlement: </span> <span className="font-bold text-slate-900 uppercase">{items[0]?.payment_mode}</span></p>
              </div>
            </div>
          </div>
          <table className="w-full table-fixed mb-16">
            <thead>
              <tr className="border-b-[3px] border-[#1A6B3A] text-[10px] font-bold uppercase tracking-[0.1em] text-[#1A6B3A]">
                <th className="py-4 text-left w-[45%]">MASTERPIECE</th>
                <th className="py-4 text-center w-[25%]">VAULT ID</th>
                <th className="py-4 text-right w-[30%]">VALUATION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="py-6 pr-4">
                    <p className="text-lg font-serif font-bold text-slate-900 mb-1 leading-tight">{typeof item.product_id === 'object' ? item.product_id.name : "Handcrafted Gem"}</p>
                    <p className="text-xs text-slate-400 italic">Artisan Signature Series</p>
                  </td>
                  <td className="py-6 text-center text-[12px] font-bold text-slate-500 font-mono italic">{item.unique_item_code}</td>
                  <td className="py-6 text-right text-lg font-serif font-bold text-slate-900">₹{(item.selling_price || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col items-end gap-6 mb-16">
            <div className="w-full md:w-80 space-y-3 border-b border-slate-200 pb-4 text-right">
              <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="font-bold text-slate-900">₹{total.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">GST (3%)</span><span className="font-bold text-slate-900">₹{(total * 0.03).toLocaleString()}</span></div>
            </div>
            <div className="text-right flex items-end justify-end gap-6">
              <span className="text-sm font-bold text-slate-400 tracking-widest uppercase">TOTAL</span>
              <span className="text-4xl font-serif font-bold text-[#1A6B3A]">₹{(total * 1.03).toLocaleString()}</span>
            </div>
          </div>
          <div className="pt-10 border-t border-slate-200 text-center">
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-3 italic">© RKM Enterprise Suite — Inventory Compliance</p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedBillItems, setSelectedBillItems] = useState<InventoryItem[] | null>(null);
  const [selectedBillDate, setSelectedBillDate] = useState<string>('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [meRes, invRes] = await Promise.all([
          getMe().catch(() => null),
          getInventory({ status: 'sold', limit: '200', page: '1' })
        ]);
        setUser(meRes);
        setItems(invRes.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load artisan records');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const productName = typeof item.product_id === 'object' ? item.product_id.name : '';
      const haystack = [item.unique_item_code, item.barcode, productName, item.sold_customer_name, item.sold_customer_phone, item.sale_channel, item.payment_mode].filter(Boolean).join(' ').toLowerCase();
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
            className="w-full md:w-80 pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm group-hover:shadow-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master records..."
          />
          <svg className="absolute left-3.5 top-3.5 text-slate-400 group-focus-within:text-blue-600 transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

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
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
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
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipping</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Store & Authority</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Settlement</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Valuation</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  return (
                    <tr key={item._id} className="group hover:bg-slate-50/30 transition-colors duration-200">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm flex-shrink-0">
                            {product?.images?.[0] ? <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-400 italic">Gem</div>}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{product?.name || 'Artisan Work'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tight">VAULT: {item.unique_item_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-bold text-slate-800">{item.sold_customer_name || '—'}</p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">{item.sold_customer_phone || item.sold_customer_email || 'No contact recorded'}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-medium text-slate-600 max-w-[200px] line-clamp-2 italic leading-relaxed">
                          {item.shipping_address ? `${item.shipping_address}, ${item.shipping_city}` : 'Store Collection Managed'}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest leading-none">
                            {(item.sold_at_branch_id as any)?.name || 'Direct Sale'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase w-10">MGR:</span>
                            <span className="text-[10px] font-bold text-slate-700">{(item.sold_by_manager_id as any)?.name || '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase w-10">CSH:</span>
                            <span className="text-[10px] font-bold text-slate-600">{(item.sold_by_cashier_id as any)?.name || 'System'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{item.sale_channel || 'DIRECT'}</p>
                        <p className="text-[10px] font-bold text-blue-500 uppercase mt-1">{item.payment_mode || 'TRANSFER'}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-slate-900 tracking-tight">₹{Number(item.selling_price || 0).toLocaleString('en-IN')}</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-1">ROI: ₹{(item.selling_price - item.purchase_price).toLocaleString()}</p>
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
    </div>
  );
}
