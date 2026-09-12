'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getSuppliers, getPurchaseOrders, createSupplier, updateSupplier, deleteSupplier, Supplier, PurchaseOrder } from '@/lib/api';
import Modal from '@/components/Modal';
import { Doughnut, Bar } from 'react-chartjs-2';
import 'chart.js/auto';

export default function SuppliersDashboard() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({ name: '', contact_person: '', phone: '', email: '', gst_number: '', place: '', address: '' });

  function showToast(message: string, type: 'success' | 'danger' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, poRes] = await Promise.all([
        getSuppliers(),
        getPurchaseOrders(1, 1000),
      ]);
      setSuppliers(sRes);
      setPurchaseOrders(poRes.data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return showToast('Supplier name is required', 'danger');
    try {
      if (editingId) {
        await updateSupplier(editingId, form);
        showToast('Supplier updated successfully');
      } else {
        await createSupplier(form);
        showToast('Supplier created successfully');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to permanently remove this supplier? This action cannot be undone.')) {
      try {
        await deleteSupplier(id);
        showToast('Supplier deleted');
        loadData();
      } catch (err: any) {
        showToast(err.message, 'danger');
      }
    }
  };

  const chartData = useMemo(() => {
    const supplierStats: Record<string, { count: number, spend: number }> = {};
    
    purchaseOrders.forEach(po => {
       const supplierId = typeof po.supplier_id === 'object' ? (po.supplier_id as any)._id : po.supplier_id;
       const key = supplierId || po.vendor_name || 'Unknown';
       if (!supplierStats[key]) {
         supplierStats[key] = { count: 0, spend: 0 };
       }
       const sumItems = po.items.reduce((acc, it) => acc + (it.count || 1), 0);
       supplierStats[key].count += sumItems;
       supplierStats[key].spend += po.total_amount || 0;
    });

    const labels = [];
    const counts = [];
    const colors = ['#4c6291', '#10b981', '#f59e0b', '#263a5e', '#ef4444', '#64748b', '#a0afd2'];
    const bgColors = [];

    let i = 0;
    for (const [key, stats] of Object.entries(supplierStats)) {
       const sup = suppliers.find(s => s._id === key);
       labels.push(sup ? sup.name : key);
       counts.push(stats.count);
       bgColors.push(colors[i % colors.length]);
       i++;
    }

    return {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: bgColors,
          borderWidth: 0,
        }
      ]
    };
  }, [purchaseOrders, suppliers]);

  return (
    <div className="space-y-8 animate-[fadeRise_400ms_ease-out] pb-20">
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl backdrop-blur-md border flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-red-500/90 text-white border-red-400'}`}>
          <p className="text-xs font-bold uppercase tracking-widest">{toast.message}</p>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Supplier Network</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Manage your vendors and monitor where your inventory comes from.</p>
        </div>
        <button
          onClick={() => { setForm({ name: '', contact_person: '', phone: '', email: '', gst_number: '', place: '', address: '' }); setEditingId(null); setModalOpen(true); }}
          className="px-6 py-3.5 rounded-2xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
          Add Supplier
        </button>
      </section>

      {/* Analytics Charts */}
      {chartData.labels.length > 0 && (
         <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Sourcing Distribution (By Items Bought)</h3>
               <div className="w-full h-64 max-w-xs relative flex items-center justify-center">
                  <Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } } } } }} />
               </div>
            </div>
         </section>
      )}

      {/* Suppliers List */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier Name</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Place / Origin</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">GST / VAT</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                 <tr><td colSpan={5} className="p-8 text-center animate-pulse text-slate-400 font-bold">Loading...</td></tr>
              ) : suppliers.length === 0 ? (
                 <tr><td colSpan={5} className="p-16 text-center text-slate-400 font-bold uppercase tracking-widest">No Suppliers Found</td></tr>
              ) : (
                suppliers.map(sup => (
                  <tr key={sup._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                       <p className="text-sm font-black text-slate-900">{sup.name}</p>
                       <span className={`text-[10px] font-bold uppercase tracking-widest ${sup.is_active ? 'text-emerald-500' : 'text-red-500'}`}>{sup.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-6 py-5">
                       <p className="text-sm font-bold text-slate-700">{sup.contact_person || '—'}</p>
                       <p className="text-[10px] font-medium text-slate-400">{sup.phone || sup.email || 'No contact info'}</p>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-700">
                       <p className="text-sm font-bold text-slate-700">{sup.place || 'Local'}</p>
                       <p className="text-[10px] font-medium text-slate-400 truncate max-w-[150px]">{sup.address || 'No address'}</p>
                    </td>
                    <td className="px-6 py-5">
                       <p className="text-xs font-bold text-slate-500">{sup.gst_number || '—'}</p>
                    </td>
                    <td className="px-6 py-5 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <button onClick={() => { 
                           setEditingId(sup._id!); 
                           setForm({ name: sup.name, contact_person: sup.contact_person, phone: sup.phone, email: sup.email, gst_number: sup.gst_number, is_active: sup.is_active, place: sup.place, address: sup.address }); 
                           setModalOpen(true); 
                         }} className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                           Edit
                         </button>
                         <button onClick={() => handleDelete(sup._id!)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                           <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Supplier' : 'New Supplier'} width="max-w-lg">
          <form onSubmit={handleSave} className="p-2 space-y-5">
             <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company Name <span className="text-red-500">*</span></label>
               <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact Person</label>
                 <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500" value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} />
               </div>
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone</label>
                 <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} />
               </div>
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                 <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
               </div>
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">GST/VAT Number</label>
                 <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500" value={form.gst_number || ''} onChange={e => setForm({...form, gst_number: e.target.value})} />
               </div>
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Place / Origin</label>
                 <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500 font-bold" value={form.place || ''} onChange={e => setForm({...form, place: e.target.value})} placeholder="e.g. Mumbai, Dubai" />
               </div>
               <div className="col-span-2 space-y-1.5">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Address</label>
                 <textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500 min-h-[80px]" value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} placeholder="Enter full business address..." />
               </div>
             </div>
             <div className="pt-4 flex gap-4">
               <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50 rounded-xl">Cancel</button>
               <button type="submit" className="flex-[2] py-4 bg-blue-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-colors">
                 {editingId ? 'Save Changes' : 'Create Supplier'}
               </button>
             </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
