'use client';
import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { 
  Plus, 
  ArrowUpRight, 
  Edit3, 
  Trash2, 
  FileText, 
  Users as UsersIcon, 
  User as UserIcon,
  Shield,
  Award,
  Activity, 
  Clock, 
  Calendar,
  AlertCircle,
  TrendingUp,
  LayoutDashboard
} from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { 
  getUsers, 
  getCategories, 
  getProducts, 
  getInventory, 
  getInventoryStats, 
  getMe, 
  updateInventoryStatus, 
  staticUrl, 
  getAttendanceSummary,
  getAllAttendanceStats,
  type InventoryItem, 
  type User 
} from '@/lib/api';

// Dynamically import Chart.js to avoid SSR issues
const Doughnut = dynamic(() => import('react-chartjs-2').then(mod => mod.Doughnut), { ssr: false });
const Line = dynamic(() => import('react-chartjs-2').then(mod => mod.Line), { ssr: false });

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler
);

interface Stats {
  users: number;
  categories: number;
  products: number;
  inventory: number;
  available: number;
  sold: number;
  reserved: number;
  recentSales: any[];
  categoryStock: any[];
  totalValue: number;
  totalProfit: number;
  salesTrend: { labels: string[]; data: number[]; dates: Date[] };
  allSoldItems: InventoryItem[];
  attendanceSummary: { total: Record<string, number>; roles: Record<string, Record<string, number>> };
  topOperatives: any[];
}

function StatCard({ label, value, icon, colors, subValue, trend }: { label: string; value: number | string; icon: React.ReactNode; colors: any; subValue?: string; trend?: 'up' | 'down' | 'neutral' }) {
  const isNegative = typeof value === 'string' && value.includes('-');
  const statusColor = isNegative ? '#e11d48' : (trend === 'up' ? '#10b981' : colors.activeText);
  const statusBg = isNegative ? '#fff1f2' : (trend === 'up' ? '#f0fdf4' : colors.border);

  // Dynamic Font Scaling for multi-crore valuations
  const valueStr = String(value);
  const getFontSize = (len: number) => {
    if (len > 15) return 'text-xl';
    if (len > 12) return 'text-2xl';
    if (len > 10) return 'text-3xl';
    return 'text-4xl';
  };

  return (
    <div 
      className="p-8 rounded-[2.5rem] border bg-white shadow-sm transition-all hover:translate-y-[-4px] hover:shadow-xl hover:shadow-blue-500/5 group relative overflow-hidden min-w-0"
      style={{ borderColor: colors.border }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/20 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-blue-100/30 transition-colors" />
      
      <div className="flex items-center justify-between mb-8 relative z-10 gap-4">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] flex-1 line-clamp-1" style={{ color: colors.textHeader }}>{label}</p>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 scale-110 shrink-0" style={{ backgroundColor: statusBg, color: statusColor }}>
          {icon}
        </div>
      </div>
      
      <div className="relative z-10 w-full overflow-hidden">
        <p className={`${getFontSize(valueStr.length)} font-black tracking-tighter truncate leading-tight transition-all duration-300`} style={{ color: isNegative ? '#e11d48' : colors.textMain }}>
          {value}
        </p>
        {subValue && (
          <div className="flex items-center gap-2 mt-3 truncate">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">{subValue}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BillModal({ items, date, onClose, colors }: { items: InventoryItem[], date: string, onClose: () => void, colors: any }) {
  const total = items.reduce((acc, item) => acc + (item.selling_price || 0), 0);
  const GREEN_THEME = "#1A6B3A";
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-2 md:p-4 print:p-0 print:bg-white overflow-y-auto">
      {/* Global Print Overlay Style */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: auto;  margin: 0mm; }
        @media print {
          body { background: white; margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #printable-bill, #printable-bill * { visibility: visible; }
          #printable-bill { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 780px !important; 
            margin: 0;
            padding: 1.2cm;
            box-shadow: none !important;
            border: none !important;
          }
          .print-hidden { display: none !important; }
        }
      `}} />

      <div id="printable-bill" className="bg-white w-full max-w-4xl rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] animate-[fadeRise_400ms_ease-out] print:shadow-none print:rounded-none my-auto font-sans">
        {/* Modal Header Controls (Hidden on Print) */}
        <div className="px-8 md:px-12 py-6 border-b border-slate-100 flex items-center justify-between print:hidden bg-slate-50/50 rounded-t-[1.5rem] md:rounded-t-[2.5rem]">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Crafting Document...</h2>
          <div className="flex items-center gap-3">
            <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[11px] font-bold uppercase tracking-widest transition-all transform active:scale-95 shadow-lg shadow-emerald-900/20" style={{ backgroundColor: GREEN_THEME }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg>
              Print Bill
            </button>
            <button onClick={onClose} className="p-2.5 rounded-full hover:bg-white hover:shadow-md transition-all text-slate-400 hover:text-red-500">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Bill Content - Matching V2 DOCX Design */}
        <div className="p-8 md:p-14 lg:p-16 print:p-0 relative bg-white rounded-b-[1.5rem] md:rounded-b-[2.5rem]">
          {/* Header Table Layout */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-2" style={{ color: GREEN_THEME }}>RKM JEWELLERS</h1>
              <p className="text-[10px] md:text-[12px] font-bold text-slate-400 uppercase tracking-[0.6em] mb-4">ARTISAN EXECUTIVE</p>
              <div className="space-y-1 text-[11px] md:text-[12px] font-bold text-slate-500 uppercase tracking-widest">
                <p className="flex items-center gap-2"><span style={{ color: GREEN_THEME }}>MOB:</span> +91 88139 47793</p>
                <p className="flex items-center gap-2"><span style={{ color: GREEN_THEME }}>WEB:</span> WWW.RKMJEWELLERS.COM</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-2">INVOICE</h2>
              <p className="text-sm md:text-base font-medium text-slate-500">{date}</p>
            </div>
          </div>

          {/* Green Divider (Matching DOCX Border) */}
          <div className="h-[4px] w-full mb-10" style={{ backgroundColor: GREEN_THEME }} />

          {/* Billed To + Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: GREEN_THEME }}>BILLED TO</p>
              <h3 className="text-2xl font-serif font-bold text-slate-900">{items[0]?.sold_customer_name || 'Karman Singh'}</h3>
              <div className="space-y-1 text-slate-600 text-[13px] md:text-sm">
                <p className="font-bold">{items[0]?.sold_customer_phone || '08813917626'}</p>
                <p>{items[0]?.sold_customer_email || 'karmansingharora01@gmail.com'}</p>
                <p className="text-slate-400 max-w-[300px] leading-relaxed">
                  {items[0]?.shipping_address ? `${items[0].shipping_address}, ${items[0].shipping_city}, ${items[0].shipping_pincode}` : 'A-30, Max Height Society, Kundli, Sonipat'}
                </p>
              </div>
            </div>
            <div className="md:text-right space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: GREEN_THEME }}>INVOICE DETAILS</p>
              <div className="space-y-2 text-[13px] md:text-sm">
                <p><span className="text-slate-400">Vault Record: </span> <span className="font-bold text-slate-900">{items[0]?.unique_item_code || 'ITEM-B7BC31-11192'}</span></p>
                <p><span className="text-slate-400">Settlement: </span> <span className="font-bold text-slate-900 uppercase">{items[0]?.payment_mode || 'Cash Settlement'}</span></p>
                <p><span className="text-slate-400">Category: </span> <span className="font-bold text-slate-900">{items[0]?.sale_channel || 'Artisan Masterpiece'}</span></p>
              </div>
            </div>
          </div>

          {/* Items Table (Matching V2 Stylings) */}
          <div className="mb-16">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b-[3px] text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: GREEN_THEME, color: GREEN_THEME }}>
                  <th className="py-4 text-left w-[45%]">MASTERPIECE</th>
                  <th className="py-4 text-center w-[25%]">VAULT ID</th>
                  <th className="py-4 text-right w-[30%] pr-2">VALUATION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-8 pr-4">
                      <p className="text-lg md:text-xl font-serif font-bold text-slate-900 mb-1 leading-tight">{typeof item.product_id === 'object' ? (item.product_id?.name || "Handcrafted Masterpiece") : "Handcrafted Masterpiece"}</p>
                      <p className="text-xs text-slate-400 italic">Precious Artisan Jewellery</p>
                    </td>
                    <td className="py-8 text-center text-[12px] font-bold text-slate-500 font-mono overflow-hidden text-ellipsis">
                      {item.unique_item_code}
                    </td>
                    <td className="py-8 text-right text-lg md:text-xl font-serif font-bold text-slate-900 whitespace-nowrap">
                      ₹{(item.selling_price || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex flex-col items-end gap-6 mb-20">
            <div className="w-full md:w-80 space-y-3 border-b border-slate-200 pb-4">
              <div className="flex justify-between text-sm md:text-base">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-bold text-slate-900">₹{total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm md:text-base">
                <span className="text-slate-400">GST (3%)</span>
                <span className="font-bold text-slate-900">₹{(total * 0.03).toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-end justify-end gap-6 mb-2">
                <span className="text-sm md:text-lg font-bold text-slate-400 tracking-widest uppercase">TOTAL</span>
                <span className="text-4xl md:text-5xl font-serif font-bold" style={{ color: GREEN_THEME }}>₹{(total * 1.03).toLocaleString()}</span>
              </div>
              <p className="text-[10px] md:text-[12px] font-medium text-slate-400 italic">Inclusive of 3% Artisan GST</p>
            </div>
          </div>

          {/* Footer (Matching DOCX) */}
          <div className="pt-10 border-t border-slate-200 text-center">
            <p className="text-[12px] md:text-[14px] font-medium text-slate-400 uppercase tracking-widest mb-3">© RKM Suite — Certified Record</p>
            <div className="flex items-center justify-center gap-4 text-[12px] md:text-[14px] font-bold uppercase tracking-[0.2em]" style={{ color: GREEN_THEME }}>
              <span>Authentic</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GREEN_THEME }} />
              <span>Integrity</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GREEN_THEME }} />
              <span>Secure Vault</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditRecordModal({ item, onClose, onSave, colors }: { item: InventoryItem; onClose: () => void; onSave: () => void; colors: any }) {
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
      await updateInventoryStatus(item._id, {
        status: item.status,
        ...formData
      });
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
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden" style={{ borderColor: colors.border }}>
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Edit Artisan Record</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Vault ID: {item.unique_item_code}</p>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white hover:shadow-md transition-all text-slate-400">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-10 space-y-6">
          {status && (
            <div className={`p-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-center animate-[fadeRise_300ms_ease-out] ${status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
              {status.msg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label>
              <input 
                type="text" 
                value={formData.sold_customer_name}
                onChange={e => setFormData({...formData, sold_customer_name: e.target.value})}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm"
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mobile Number</label>
              <input 
                type="text" 
                value={formData.sold_customer_phone}
                onChange={e => setFormData({...formData, sold_customer_phone: e.target.value})}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm"
                placeholder="+91 ...."
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
            <input 
              type="email" 
              value={formData.sold_customer_email}
              onChange={e => setFormData({...formData, sold_customer_email: e.target.value})}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm"
              placeholder="client@email.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipping Destination</label>
            <textarea 
              rows={2}
              value={formData.shipping_address}
              onChange={e => setFormData({...formData, shipping_address: e.target.value})}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm resize-none"
              placeholder="Full address details..."
            />
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</label>
              <input 
                type="text" 
                value={formData.shipping_city}
                onChange={e => setFormData({...formData, shipping_city: e.target.value})}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pincode</label>
              <input 
                type="text" 
                value={formData.shipping_pincode}
                onChange={e => setFormData({...formData, shipping_pincode: e.target.value})}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment</label>
              <select 
                value={formData.payment_mode}
                onChange={e => setFormData({...formData, payment_mode: e.target.value})}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-medium text-sm appearance-none bg-white"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div className="pt-4 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" disabled={loading} className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-blue-600 transition-all shadow-lg flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save Record Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const [stats, setStats] = useState<Stats | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBillItems, setSelectedBillItems] = useState<InventoryItem[] | null>(null);
  const [selectedBillDate, setSelectedBillDate] = useState<string>('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  const [reportDays, setReportDays] = useState(7);
  
  const chartRef = useRef<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const [meRes, users, categories, productsRes, inventoryRes, recentSoldRes, dbStats, allSoldRes, attSummary, attStats] = await Promise.all([
          getMe().catch(() => null),
          getUsers().catch(() => ({ data: [], meta: { total: 0 } })),
          getCategories(true).catch(() => []),
          getProducts({ limit: '1' }).catch(() => ({ meta: { total: 0 } })),
          getInventory({ limit: '1' }).catch(() => ({ meta: { total: 0 } })),
          getInventory({ status: 'sold', limit: '5' }).catch(() => ({ data: [], meta: { total: 0 } })),
          getInventoryStats().catch(() => ({ totalCount: 0, totalValue: 0, totalPurchaseValue: 0, totalProfit: 0, byStatus: {} as Record<string, any>, byCategory: [], salesTrend: [] })),
          getInventory({ status: 'sold', limit: '100', sold_after: fourteenDaysAgo.toISOString() }).catch(() => ({ data: [], meta: { total: 0 } })),
          getAttendanceSummary(reportDays).catch(() => ({ total: {}, roles: {} })),
          getAllAttendanceStats(new Date().getMonth(), new Date().getFullYear()).catch(() => [])
        ]);

        const availCount = dbStats.byStatus.available?.count || 0;
        const soldCount = dbStats.byStatus.sold?.count || 0;
        const reservedCount = dbStats.byStatus.reserved?.count || 0;

        // Sales Trend (Last 14 days) - Fill gaps from DB data
        const labels: string[] = [];
        const trendData: number[] = [];
        const trendDates: Date[] = [];
        const now = new Date();
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const dbDateStr = d.toISOString().split('T')[0];
          
          labels.push(dateStr);
          trendDates.push(d);
          
          const dbEntry = dbStats.salesTrend.find(t => t.date === dbDateStr);
          trendData.push(dbEntry ? dbEntry.count : 0);
        }

        setStats({
          users: (users as any).meta?.total || (users as any).length || 0,
          categories: categories.length,
          products: (productsRes as any).meta?.total || 0,
          inventory: dbStats.totalCount,
          available: availCount,
          sold: soldCount,
          reserved: reservedCount,
          recentSales: (recentSoldRes as any).data || [],
          categoryStock: dbStats.byCategory,
          totalValue: dbStats.totalPurchaseValue,
          totalProfit: dbStats.totalProfit,
          salesTrend: { labels, data: trendData, dates: trendDates },
          allSoldItems: (allSoldRes as any).data || [],
          attendanceSummary: attSummary,
          topOperatives: (attStats || []).sort((a: any, b: any) => b.present - a.present).slice(0, 5)
        });

        setUser(meRes);
      } catch (error) {
        console.error("Dashboard data load error:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reportDays]);

  const handleChartDoubleClick = (event: any) => {
    if (!chartRef.current || !stats) return;

    const elements = chartRef.current.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const dateClicked = stats.salesTrend.dates[index];
      const itemsForDay = stats.allSoldItems.filter(item => {
        const soldDate = item.sold_at ? new Date(item.sold_at) : null;
        return soldDate && soldDate.toDateString() === dateClicked.toDateString();
      });

      if (itemsForDay.length > 0) {
        setSelectedBillItems(itemsForDay);
        setSelectedBillDate(dateClicked.toLocaleDateString('en-US', { dateStyle: 'long' }));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-[fadeRise_400ms_ease-out] space-y-10 pb-20 px-1">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: colors.textMain }}>Business Executive Overview</h1>
          <p className="text-sm font-medium mt-1" style={{ color: colors.textMuted }}>Central intelligence and artisanal stock control</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textHeader }}>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Real-Time Data Feed
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard 
          label="Total Inventory Value" 
          value={`₹${(stats?.totalValue || 0).toLocaleString()}`} 
          subValue={`${stats?.inventory || 0} Assets in Vault`} 
          colors={colors} 
          icon={<LayoutDashboard className="w-5 h-5" />} 
        />
        <StatCard 
          label="Realized Net Profit" 
          value={`₹${(stats?.totalProfit || 0).toLocaleString()}`} 
          subValue={`From ${stats?.sold || 0} Successful Sales`} 
          colors={colors} 
          trend={(stats?.totalProfit || 0) >= 0 ? 'up' : 'down'}
          icon={(stats?.totalProfit || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingUp className="w-5 h-5 rotate-180" />} 
        />
        <StatCard 
          label="Enlisted Personnels" 
          value={stats?.users ?? 0} 
          subValue={`Active Global Operatives`} 
          colors={colors} 
          icon={<UsersIcon className="w-5 h-5" />} 
        />
        <StatCard 
          label="Presence Index" 
          value={`${stats?.attendanceSummary.total?.present ?? 0} Active`} 
          subValue={`Operatives On-Duty Today`} 
          colors={colors} 
          icon={<Activity className="w-5 h-5" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Sales Trend Chart */}
          <div className="p-8 rounded-[2.5rem] border shadow-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold tracking-tight" style={{ color: colors.textMain }}>Sales Volume Trajectory</h3>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">Double click point to generate bill</p>
              </div>
            </div>
            <div className="h-[300px] w-full cursor-pointer">
              {typeof window !== 'undefined' && Line && stats && (
                <Line
                  ref={chartRef}
                  onDoubleClick={handleChartDoubleClick}
                  data={{
                    labels: stats.salesTrend.labels,
                    datasets: [{
                      label: 'Items Sold',
                      data: stats.salesTrend.data,
                      fill: true,
                      borderColor: '#3b82f6',
                      backgroundColor: (context: any) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
                        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
                        return gradient;
                      },
                      tension: 0.4,
                      pointRadius: 6,
                      pointBackgroundColor: '#fff',
                      pointBorderColor: '#3b82f6',
                      pointBorderWidth: 2,
                      pointHoverRadius: 9,
                      pointHitRadius: 15
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: `${colors.border}44`, display: true },
                        ticks: { font: { size: 10 }, color: colors.textMuted, stepSize: 1 }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: colors.textMuted }
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="p-8 rounded-[2.5rem] border shadow-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
              <div className="flex-1">
                <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: colors.textMain }}>Inventory Liquidity</h2>
                <p className="text-sm mb-8" style={{ color: colors.textMuted }}>Strategic distribution of assets across status categories</p>
                <div className="space-y-6">
                  <StatusRow label="Available for Client View" count={stats?.available ?? 0} total={stats?.inventory ?? 1} color="#10b981" colors={colors} />
                  <StatusRow label="Sold & Dispatched" count={stats?.sold ?? 0} total={stats?.inventory ?? 1} color="#3b82f6" colors={colors} />
                  <StatusRow label="Reserved / Concierge" count={stats?.reserved ?? 0} total={stats?.inventory ?? 1} color="#f59e0b" colors={colors} />
                </div>
              </div>
              <div className="w-full lg:w-80 h-72 flex items-center justify-center relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: colors.textHeader }}>Total Assets</p>
                  <p className="text-4xl font-bold mt-1" style={{ color: colors.textMain }}>{stats?.inventory || 0}</p>
                </div>
                {typeof window !== 'undefined' && Doughnut && stats && (
                  <Doughnut
                    data={{
                      labels: ['Available', 'Sold', 'Reserved'],
                      datasets: [{
                        data: [stats.available, stats.sold, stats.reserved],
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
                        borderColor: colors.bg,
                        borderWidth: 6,
                        hoverOffset: 15
                      }],
                    }}
                    options={{ plugins: { legend: { display: false } }, cutout: '80%', responsive: true, maintainAspectRatio: false }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="p-8 rounded-[2.5rem] border shadow-sm overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold tracking-tight" style={{ color: colors.textMain }}>Artisan Transaction Ledger</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Executive Record</p>
              </div>
              <Link href="/dashboard/inventory/sold" className="text-[10px] font-black underline uppercase tracking-widest text-[#1A6B3A] hover:text-slate-900 transition-colors">Master Sales Log</Link>
            </div>
            
            <div className="overflow-x-auto -mx-8">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100 b-slate-50/50">
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Masterpiece</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipping</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Valuations</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stats?.recentSales?.length ? stats.recentSales.map((item: any) => {
                    const product = typeof item.product_id === 'object' ? item.product_id : null;
                    return (
                      <tr key={item._id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                              {product?.images?.[0] ? (
                                <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 7l-8 10-4-4" /></svg>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{product?.name || 'Handcrafted Work'}</p>
                              <p className="text-[10px] font-medium text-slate-400 uppercase mt-0.5">VAULT: {item.unique_item_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-bold text-slate-900">{item.sold_customer_name || 'Guest Client'}</p>
                          <p className="text-[11px] font-medium text-slate-500">{item.sold_customer_phone || 'Unrecorded'}</p>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-[11px] font-medium text-slate-600 max-w-[200px] line-clamp-2 italic">
                            {item.shipping_address ? `${item.shipping_address}, ${item.shipping_city}` : 'Store Collection'}
                          </p>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-black text-slate-900">₹{(item.selling_price || 0).toLocaleString()}</p>
                          <p className="text-[10px] font-bold text-blue-500 uppercase mt-0.5">{item.payment_mode || 'Cash'}</p>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => {
                                setSelectedBillItems([item]);
                                setSelectedBillDate(item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-US', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-US', { dateStyle: 'long' }));
                              }}
                              className="p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all transform active:scale-90 shadow-sm"
                              title="Download Receipt"
                            >
                              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg>
                            </button>
                            {user?.role === 'admin' && (
                              <button 
                                onClick={() => setEditingItem(item)}
                                className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-blue-600 hover:text-white transition-all transform active:scale-90 shadow-sm"
                                title="Edit Record"
                              >
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <p className="text-sm font-medium text-slate-400">No transactions recorded in this ledger.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Presence Distribution */}
          <div className="p-8 rounded-[2.5rem] border bg-white shadow-sm shadow-slate-200/40 relative overflow-hidden group" style={{ borderColor: colors.border }}>
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-100/20 transition-all duration-700" />
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-black tracking-tight" style={{ color: colors.textMain }}>Presence Audit</h3>
              </div>
              <select 
                value={reportDays}
                onChange={(e) => setReportDays(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={7}>Weekly</option>
                <option value={30}>Monthly</option>
              </select>
            </div>
            
            <div className="space-y-8 relative z-10">
              {/* Role Breakdown: Managers */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                   <Shield className="w-3.5 h-3.5 text-violet-600" />
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Administrative (Managers)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Present</p>
                      <p className="text-xl font-black text-emerald-700">{stats?.attendanceSummary.roles?.manager?.present ?? 0}</p>
                   </div>
                   <div className="bg-red-50 p-4 rounded-2xl border border-red-100/50">
                      <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Absent</p>
                      <p className="text-xl font-black text-red-700">{stats?.attendanceSummary.roles?.manager?.absent ?? 0}</p>
                   </div>
                </div>
              </div>

              {/* Role Breakdown: Cashiers / Others */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2 border-t border-slate-50 pt-6">
                   <UsersIcon className="w-3.5 h-3.5 text-blue-600" />
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Operational Personnel</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Present</p>
                      <p className="text-xl font-black text-emerald-700">{stats?.attendanceSummary.roles?.cashier?.present ?? 0}</p>
                   </div>
                   <div className="bg-red-50 p-4 rounded-2xl border border-red-100/50">
                      <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Absent</p>
                      <p className="text-xl font-black text-red-700">{stats?.attendanceSummary.roles?.cashier?.absent ?? 0}</p>
                   </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50">
                 <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Global Operational Velocity</span>
                    <span className="text-[10px] font-black text-slate-900">{( (stats?.attendanceSummary.total?.present || 0) / ( (stats?.attendanceSummary.total?.present || 0) + (stats?.attendanceSummary.total?.absent || 0) || 1 ) * 100 ).toFixed(0)}% ROI</span>
                 </div>
              </div>
            </div>
          </div>

          {/* Top Operatives Leaderboard */}
          <div className="p-8 rounded-[2.5rem] border bg-white shadow-sm shadow-slate-200/40 relative overflow-hidden group" style={{ borderColor: colors.border }}>
             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-emerald-100/20 transition-all duration-700" />
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <Award className="w-5 h-5 text-emerald-600" />
              <h3 className="text-xl font-black tracking-tight" style={{ color: colors.textMain }}>Performance Hub</h3>
            </div>
            <div className="space-y-4 relative z-10">
              {stats?.topOperatives?.length ? stats.topOperatives.map((op: any, i: number) => (
                <Link 
                  href={`/dashboard/users?profile=${op.user._id}`} 
                  key={i} 
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-all group/item cursor-pointer border border-transparent hover:border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-all">
                       <UserIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-black tracking-tight" style={{ color: colors.textMain }}>{op.user.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">{op.user.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-black text-emerald-600 tracking-tight">{op.present}D</p>
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter leading-none">Present</p>
                  </div>
                </Link>
              )) : (
                 <div className="py-10 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No performance metrics resolved</p>
                 </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bill Modal Overlay */}
      {selectedBillItems && (
        <BillModal 
          items={selectedBillItems} 
          date={selectedBillDate} 
          onClose={() => setSelectedBillItems(null)} 
          colors={colors}
        />
      )}
      {/* Edit Record Modal Modal Overlay */}
      {editingItem && (
        <EditRecordModal 
          item={editingItem} 
          onClose={() => setEditingItem(null)} 
          onSave={() => {
            setEditingItem(null);
            window.location.reload();
          }} 
          colors={colors}
        />
      )}
    </div>
  );
}

function StatusRow({ label, count, total, color, colors }: any) {
  const percentage = Math.min(100, Math.max(0, (count / (total || 1)) * 100));
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[13px] font-bold" style={{ color: colors.textMain }}>{label}</span>
        </div>
        <span className="text-sm font-black" style={{ color: colors.textMain }}>{count}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full transition-all duration-1000 ease-out" style={{ backgroundColor: color, width: `${percentage}%` }} />
      </div>
    </div>
  );
}
