'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  getPurchaseOrder, 
  updatePurchaseOrder, 
  publishPurchaseOrder, 
  getSuppliers, 
  getCategories, 
  getLookupsByType, 
  staticUrl, 
  type PurchaseOrder, 
  type Supplier, 
  type Category, 
  type Lookup 
} from '@/lib/api';
import Modal from '@/components/Modal';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Lookups
  const [metalTypes, setMetalTypes] = useState<Lookup[]>([]);
  const [purities, setPurities] = useState<Lookup[]>([]);
  const [colors, setColors] = useState<Lookup[]>([]);
  const [genders, setGenders] = useState<Lookup[]>([]);
  const [occasions, setOccasions] = useState<Lookup[]>([]);
  const [stoneTypes, setStoneTypes] = useState<Lookup[]>([]);

  const [poForm, setPoForm] = useState<Partial<PurchaseOrder>>({
    supplier_id: '',
    vendor_name: '',
    purchase_date: new Date().toISOString().split('T')[0],
    invoice_number: '',
    total_amount: 0,
    items: []
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => {});
    getCategories().then(res => setCategories(Array.isArray(res) ? res : (res as any)?.data || [])).catch(() => {});
    getLookupsByType('metal_type').then(res => setMetalTypes(res || [])).catch(() => {});
    getLookupsByType('purity').then(res => setPurities(res || [])).catch(() => {});
    getLookupsByType('metal_color').then(res => setColors(res || [])).catch(() => {});
    getLookupsByType('gender').then(res => setGenders(res || [])).catch(() => {});
    getLookupsByType('occasion').then(res => setOccasions(res || [])).catch(() => {});
    getLookupsByType('stone_type').then(res => setStoneTypes(res || [])).catch(() => {});
  }, []);

  async function loadPO() {
    if (id === 'new') {
      setLoading(false);
      return;
    }
    try {
      const data = await getPurchaseOrder(id as string);
      setPo(data);
      setPoForm(data);
    } catch (e) {
      showToast('Failed to load purchase order', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPO(); }, [id]);

  // Auto-calculate total amount
  useEffect(() => {
    const total = (poForm.items || []).reduce((sum, item) => {
      return sum + ((item.purchase_price || 0) * (item.count || 1));
    }, 0);
    if (total !== poForm.total_amount) {
      setPoForm(prev => ({ ...prev, total_amount: total }));
    }
  }, [poForm.items]);

  function showToast(message: string, type: 'success' | 'danger') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleAddItem() {
    const newItem = {
      name: '',
      sku: `SKU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      category_id: '',
      metal_type: 'Gold',
      purity: '22K',
      metal_color: 'Yellow Gold',
      gender: 'Unisex',
      occasion: 'Casual',
      dimensions: '',
      has_stones: false,
      stone_type: '',
      stone_weight: 0,
      count: 1,
      buy_price: 0,
      purchase_price: 0,
      selling_price: 0,
      gross_weight: 0,
      net_weight: 0,
      images: []
    };
    setPoForm(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  }

  function handleUpdateItem(index: number, field: string, value: any) {
    const newItems = [...(poForm.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    // If buy_price changes, update purchase_price for compatibility
    if (field === 'buy_price') {
      newItems[index].purchase_price = value;
    }
    setPoForm(prev => ({ ...prev, items: newItems }));
  }

  function handleRemoveItem(index: number) {
    setPoForm(prev => ({ ...prev, items: (prev.items || []).filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (id === 'new') {
        // Implementation for createPO if needed, otherwise route to standard service
      } else {
        await updatePurchaseOrder(id as string, poForm);
        showToast('Purchase order saved successfully', 'success');
        loadPO();
      }
    } catch (e) {
      showToast('Failed to save changes', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!confirm('Are you sure you want to publish? This will lock the PO and add items to inventory.')) return;
    setPublishing(true);
    try {
      await publishPurchaseOrder(id as string);
      showToast('Purchase order published to inventory', 'success');
      loadPO();
    } catch (e) {
      showToast('Publishing failed - check item details', 'danger');
    } finally {
      setPublishing(false);
    }
  }

  const isPublished = po?.status === 'published';

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hydrating Ledger...</p>
    </div>
  );

  return (
    <div className="space-y-10 animate-[fadeRise_400ms_ease-out] pb-20">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0mm !important; /* Removes browser watermark */
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Suppress all dashboard furniture entirely */
          .admin-shell header, .admin-shell aside, .no-print {
            display: none !important;
          }
          /* Let the document flow naturally within the page margins */
          .print-document {
            display: block !important;
            width: 100% !important;
            background: white !important;
            padding: 8mm !important; /* Replaces browser margin, tighter fit */
            box-sizing: border-box !important;
          }
        }
      `}</style>

      <div className="no-print space-y-10">
        {toast && (
          <div className={`fixed top-8 left-1/2 -track-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl backdrop-blur-md border animate-[fadeRise_300ms_ease-out] flex items-center gap-3 ${
            toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-red-500/90 text-white border-red-400'
          }`}>
            <p className="text-[10px] font-black uppercase tracking-widest">{toast.message}</p>
          </div>
        )}

        {/* Hero Header */}
        <section className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => router.back()} className="p-2 -ml-2 text-slate-400 hover:text-slate-900 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${
              isPublished ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
            }`}>
              {isPublished ? 'Published & Locked' : 'Draft Protocol'}
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
            {poForm.po_number || 'Initializing New PO...'}
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Registry of artisanal acquisitions and inventory ingress.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.print()}
            className="px-6 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-900 text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
            Print Ledger
          </button>
          {!isPublished && (
            <>
              <button 
                onClick={handleSave} 
                className="px-6 py-3.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Syncing...' : 'Commit Draft'}
              </button>
              <button 
                onClick={handlePublish} 
                className="px-6 py-3.5 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all disabled:opacity-50"
                disabled={publishing}
              >
                {publishing ? 'Ingressing...' : 'Publish to Vault'}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Supplier & Context Card */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-12">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
           </div>
           <div>
              <h3 className="text-lg font-black text-slate-900 uppercase">Supplier Logistics</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Metadata for official record</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origin Vendor <span className="text-red-500">*</span></label>
              <select 
                value={poForm.supplier_id} 
                disabled={isPublished}
                onChange={e => {
                  const s = suppliers.find(x => x._id === e.target.value);
                  setPoForm(prev => ({ ...prev, supplier_id: e.target.value, vendor_name: s?.name || '' }));
                }}
                className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all appearance-none bg-slate-50/50"
              >
                <option value="">Select Producer...</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
           </div>
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor Invoice Ref</label>
              <input 
                disabled={isPublished}
                className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300" 
                value={poForm.invoice_number || ''} 
                onChange={e => setPoForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                placeholder="INV-XXXX-XXXX"
              />
           </div>
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registry Date</label>
              <input 
                type="date" 
                disabled={isPublished}
                className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" 
                value={poForm.purchase_date?.split('T')[0] || ''} 
                onChange={e => setPoForm(prev => ({ ...prev, purchase_date: e.target.value }))} 
              />
           </div>
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-blue-600">Aggregate Valuation (₹)</label>
              <div className="w-full px-4 py-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 text-md font-black text-blue-700 font-mono">
                {poForm.total_amount?.toLocaleString()}
              </div>
           </div>
        </div>
      </section>

      {/* Asset Allocation (Line Items) */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                 <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Asset Specification Ledger</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">{poForm.items?.length || 0} Individual items identified for ingress</p>
              </div>
           </div>
           {!isPublished && (
             <button 
               onClick={handleAddItem}
               className="px-6 py-3.5 rounded-2xl bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 shadow-md flex items-center gap-2"
             >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
                Append New Asset
             </button>
           )}
        </div>

        <div className="space-y-8">
          {poForm.items?.map((item, idx) => (
            <div key={idx} className="group relative bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-10 transition-all hover:border-blue-200">
               {!isPublished && (
                 <button 
                   onClick={() => handleRemoveItem(idx)}
                   className="absolute top-8 right-8 p-3 rounded-2xl bg-rose-50 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white active:scale-90"
                 >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>
               )}

               <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Visual Preview */}
                  <div className="lg:col-span-2 space-y-4">
                     <div className="aspect-square rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden">
                        {item.images?.[0] ? (
                          <img src={staticUrl(item.images[0])} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-4">
                             <svg width="32" height="32" className="mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asset Portrait Required</p>
                          </div>
                        )}
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Allocation Sku</label>
                        <input 
                          disabled={isPublished}
                          className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/50 text-[10px] font-black text-slate-500 uppercase tracking-widest focus:ring-2 focus:ring-blue-500/10 outline-none"
                          value={item.sku}
                          onChange={e => handleUpdateItem(idx, 'sku', e.target.value)}
                        />
                     </div>
                  </div>

                  {/* Core Attributes */}
                  <div className="lg:col-span-10 grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-6">
                     <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descriptive Designation <span className="text-red-500">*</span></label>
                        <input 
                          disabled={isPublished}
                          className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" 
                          placeholder="e.g. Victorian Diamond Studs"
                          value={item.name}
                          onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catalogue</label>
                        <select 
                          disabled={isPublished}
                          value={item.category_id} 
                          onChange={e => handleUpdateItem(idx, 'category_id', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-sm font-semibold outline-none appearance-none"
                        >
                          <option value="">Select Category...</option>
                          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-emerald-600">Buy Valuation (₹)</label>
                        <input 
                          type="number"
                          disabled={isPublished}
                          className="w-full px-4 py-3 bg-emerald-50/30 rounded-2xl border border-emerald-100 text-sm font-black text-emerald-700 font-mono outline-none" 
                          value={item.buy_price || ''}
                          onChange={e => handleUpdateItem(idx, 'buy_price', parseFloat(e.target.value) || 0)}
                        />
                     </div>

                     {/* Second Row Lookups */}
                     <div className="grid grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Material</label>
                           <select disabled={isPublished} value={item.metal_type} onChange={e => handleUpdateItem(idx, 'metal_type', e.target.value)} className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none">
                              {metalTypes.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Integrity/Purity</label>
                           <select disabled={isPublished} value={item.purity} onChange={e => handleUpdateItem(idx, 'purity', e.target.value)} className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none">
                              {purities.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
                           </select>
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visual Finish</label>
                        <select disabled={isPublished} value={item.metal_color} onChange={e => handleUpdateItem(idx, 'metal_color', e.target.value)} className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none">
                           {colors.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-indigo-600">Suggested Sell (₹)</label>
                        <input 
                          type="number"
                          disabled={isPublished}
                          className="w-full px-4 py-3 bg-indigo-50/30 rounded-2xl border border-indigo-100 text-sm font-black text-indigo-700 font-mono outline-none" 
                          value={item.selling_price || ''}
                          onChange={e => handleUpdateItem(idx, 'selling_price', parseFloat(e.target.value) || 0)}
                        />
                     </div>

                     {/* Metrics Row */}
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Wt (g)</label>
                           <input disabled={isPublished} type="number" className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-xs font-bold outline-none" value={item.gross_weight || ''} onChange={e => handleUpdateItem(idx, 'gross_weight', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Wt (g)</label>
                           <input disabled={isPublished} type="number" className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-xs font-bold outline-none" value={item.net_weight || ''} onChange={e => handleUpdateItem(idx, 'net_weight', parseFloat(e.target.value) || 0)} />
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Allocation Count</label>
                        <input disabled={isPublished} type="number" className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-xs font-bold outline-none" value={item.count || ''} onChange={e => handleUpdateItem(idx, 'count', parseInt(e.target.value) || 0)} />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Physica Dimensions</label>
                        <input disabled={isPublished} className="w-full px-4 py-3 bg-slate-50/50 rounded-2xl border border-slate-200 text-xs font-bold outline-none" placeholder="e.g. 15mm x 20mm" value={item.dimensions || ''} onChange={e => handleUpdateItem(idx, 'dimensions', e.target.value)} />
                     </div>
                     <div className="flex items-end pb-3">
                        <button 
                          disabled={isPublished}
                          onClick={() => handleUpdateItem(idx, 'has_stones', !item.has_stones)}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all ${item.has_stones ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                        >
                           <div className={`w-3 h-3 rounded-full ${item.has_stones ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
                           <span className="text-[10px] font-black uppercase tracking-widest">Gemstone Attachment</span>
                        </button>
                     </div>

                     {/* Hidden Dynamic Gemstone Fields */}
                     {item.has_stones && (
                       <div className="md:col-span-4 grid grid-cols-2 gap-8 p-6 bg-amber-50/50 rounded-3xl border border-amber-100 animate-[fadeRise_200ms_ease-out]">
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Geological Classification</label>
                             <select disabled={isPublished} value={item.stone_type} onChange={e => handleUpdateItem(idx, 'stone_type', e.target.value)} className="w-full px-4 py-3 bg-white rounded-2xl border border-amber-200 text-xs font-bold outline-none appearance-none">
                                <option value="">Select Stone...</option>
                                {stoneTypes.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
                             </select>
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Stone Mass (g)</label>
                             <input disabled={isPublished} type="number" step="0.01" className="w-full px-4 py-3 bg-white rounded-2xl border border-amber-200 text-xs font-bold outline-none" value={item.stone_weight || ''} onChange={e => handleUpdateItem(idx, 'stone_weight', parseFloat(e.target.value) || 0)} />
                          </div>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          ))}
        </div>
      </section>
      </div>

      {/* Professional Legal Invoice (Modern Corporate Edition) */}
      <div className="hidden print:block print-document bg-white text-slate-800 font-sans w-full">
        <div className="w-full max-w-[194mm] mx-auto flex flex-col bg-white">
          
          {/* Top Header Stringent Line */}
          <div className="h-2 w-full bg-emerald-800 mb-8 rounded-sm"></div>

          {/* Top Header Block */}
          <div className="flex justify-between items-start border-b border-emerald-800 pb-8">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-emerald-900 leading-none">RKM Jewellers</h1>
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800 mt-2">Purchase Order & Asset Manifest</p>
              <div className="mt-4 text-xs font-medium text-emerald-900 leading-relaxed">
                 Principal Boutique & Vault • New Delhi<br />
                 GSTIN: 07AAACRKM1234Z5<br />
                 Maison ID: PV-071
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-light uppercase tracking-widest text-emerald-900 mb-2">Voucher</h2>
              <div className="inline-block px-3 py-1 bg-white border border-emerald-800 rounded">
                 <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">PO: {poForm.po_number || 'DRAFT-SYSTEM-AUTH'}</p>
              </div>
            </div>
          </div>

          {/* Manifest Info Grid */}
          <div className="grid grid-cols-2 mt-8 gap-8">
             <div className="bg-white p-6 rounded-xl border border-emerald-800">
                <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-3">Supplier Information</p>
                <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">{poForm.vendor_name || 'Individual Artisan'}</p>
                <div className="mt-3 space-y-1">
                   <p className="text-xs font-medium text-slate-900 leading-relaxed max-w-[250px]">{suppliers.find(s => s._id === poForm.supplier_id)?.address || 'Registered Address In System'}</p>
                   <p className="text-xs font-medium text-slate-900 mt-2">Tel: {suppliers.find(s => s._id === poForm.supplier_id)?.phone || 'Maison Record Only'}</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl border border-emerald-800 flex flex-col justify-center">
                   <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-1.5">Issue Date</p>
                   <p className="text-sm font-bold text-slate-900">{poForm.purchase_date ? new Date(poForm.purchase_date).toLocaleDateString('en-GB') : 'SYSTEM-PENDING'}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-emerald-800 flex flex-col justify-center">
                   <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-1.5">Vendor Invoice Ref</p>
                   <p className="text-sm font-bold text-slate-900">{poForm.invoice_number || 'NOT SPECIFIED'}</p>
                </div>
                <div className="col-span-2 bg-white p-5 rounded-xl border border-emerald-800 flex flex-col justify-center">
                   <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-1.5">Authorization Status</p>
                   <p className="text-sm font-bold text-emerald-900 uppercase">{isPublished ? 'Published & Locked To Vault' : 'Draft / Unverified'}</p>
                </div>
             </div>
          </div>

          {/* Asset Ledger */}
          <div className="mt-10 rounded-xl border border-emerald-800">
             <table className="w-full text-sm text-left">
                <thead className="bg-white border-b border-emerald-800 text-emerald-900">
                   <tr>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Item Description</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Specifications</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Qty</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Unit Price</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Total (INR)</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-emerald-800/20">
                   {poForm.items?.map((item, i) => (
                      <tr key={i} className="bg-white">
                         <td className="px-6 py-5">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded border border-emerald-800 bg-white overflow-hidden flex-shrink-0">
                                  {item.images?.[0] ? <img src={staticUrl(item.images[0])} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full w-full text-[8px] text-emerald-800 font-bold">NO IMG</div>}
                               </div>
                               <div>
                                  <p className="font-bold text-slate-900 uppercase tracking-tight">{item.name}</p>
                                  <p className="text-[10px] font-bold text-emerald-800/70 uppercase tracking-widest mt-1">SKU: {item.sku}</p>
                                  <p className="text-[10px] font-bold text-emerald-900 mt-1">{categories.find(c => c._id === item.category_id)?.name || 'General Inventory'}</p>
                               </div>
                            </div>
                         </td>
                         <td className="px-6 py-5 align-middle">
                            <p className="text-xs font-bold text-slate-900">{item.metal_type} {item.purity}</p>
                            <p className="text-[11px] font-medium text-slate-700 mt-1">{item.metal_color} • Net: {item.net_weight}g</p>
                            {item.has_stones && (
                              <p className="text-[10px] font-bold text-emerald-900 mt-2 bg-white border border-emerald-800 px-2 py-0.5 rounded inline-block">Stone: {item.stone_type} ({item.stone_weight}g)</p>
                            )}
                         </td>
                         <td className="px-6 py-5 align-middle text-right font-medium text-slate-900">
                            {item.count}
                         </td>
                         <td className="px-6 py-5 align-middle text-right text-slate-900">
                            <span className="font-medium">₹{item.purchase_price?.toLocaleString()}</span>
                         </td>
                         <td className="px-6 py-5 align-middle text-right font-bold text-slate-900">
                            ₹{((item.purchase_price || 0) * (item.count || 1)).toLocaleString()}
                         </td>
                      </tr>
                   ))}
                   {(!poForm.items || poForm.items.length === 0) && (
                     <tr>
                       <td colSpan={5} className="px-6 py-8 text-center text-sm text-emerald-900 italic">No line items recorded on this voucher.</td>
                     </tr>
                   )}
                </tbody>
             </table>
          </div>

          {/* Financial Totals */}
          <div className="mt-8 flex justify-end">
             <div className="w-80 rounded-xl bg-white p-6 border border-emerald-800">
                <div className="flex justify-between items-center py-2 border-b border-emerald-800/30">
                   <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Subtotal</p>
                   <p className="text-sm font-bold text-slate-900">₹{poForm.total_amount?.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-800/30">
                   <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Tax & Duties</p>
                   <p className="text-[10px] font-black text-emerald-800 uppercase">Inclusive</p>
                </div>
                <div className="flex justify-between items-end pt-4">
                   <p className="text-sm font-black text-emerald-900 uppercase tracking-wider">Total Due</p>
                   <p className="text-3xl font-extrabold text-slate-900 tracking-tight">₹{poForm.total_amount?.toLocaleString()}</p>
                </div>
             </div>
          </div>

          {/* Verification Blocks */}
          <div className="mt-auto pt-16 flex justify-between items-end">
             <div className="w-64">
                <div className="border-b border-emerald-800 pb-2 mb-2 text-center">
                   <p className="text-xs italic text-emerald-900 capitalize">Vendor signature</p>
                </div>
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest text-center">{poForm.vendor_name || 'Authorized Signatory'}</p>
             </div>
             
             <div className="flex-1 px-12 text-center flex flex-col justify-end">
                {/* Empty central divider to balance signature blocks */}
             </div>

             <div className="w-64">
                <div className="border-b border-emerald-800 pb-2 mb-2 text-center">
                   <p className="text-xs italic text-emerald-900 capitalize">Maison signature</p>
                </div>
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest text-center">RKM Principal Authority</p>
             </div>
          </div>
          
          {/* Footer */}
          <div className="mt-12 text-center border-t border-emerald-800 pt-6">
             <p className="text-[9px] font-black text-emerald-900 uppercase tracking-[0.4em]">Confidential Business Record • RKM Jewellers</p>
          </div>
        </div>
      </div>
    </div>
  );
}
