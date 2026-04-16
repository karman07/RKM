'use client';
import { useState, useEffect, useRef } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, uploadCategoryImage, staticUrl, type Category } from '@/lib/api';
import Modal from '@/components/Modal';

const statusBadge = {
  active:   { wrap: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  inactive: { wrap: 'bg-rose-50 text-rose-700 border-rose-100', dot: 'bg-rose-400' },
};

interface CatForm {
  name: string;
  description: string;
  is_active: boolean;
}
const emptyForm: CatForm = { name: '', description: '', is_active: true };

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<CatForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  
  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await getCategories(showInactive);
      // API returns a raw array, so we handle it directly
      setCategories(Array.isArray(res) ? res : (res as any)?.data || []);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [showInactive]);

  function showToast(message: string, type: 'success' | 'danger' | 'info' = 'info') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setError('');
    setImageFile(null);
    setImagePreview('');
    setModalOpen(true);
  }

  function openEdit(c: Category) {
    setEditTarget(c);
    setForm({ name: c.name, description: c.description ?? '', is_active: c.is_active });
    setError('');
    setImageFile(null);
    setImagePreview(c.image_url ? staticUrl(c.image_url) : '');
    setModalOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        ...(form.description && { description: form.description }),
        is_active: form.is_active,
      };
      let saved: Category;
      if (editTarget) {
        saved = await updateCategory(editTarget._id, payload);
        showToast('Category synchronized successfully', 'success');
      } else {
        saved = await createCategory(payload);
        showToast('New collection category initialized', 'success');
      }
      
      if (imageFile) {
        setUploading(true);
        try {
          await uploadCategoryImage(saved._id, imageFile);
        } finally {
          setUploading(false);
        }
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to persist category');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget._id);
      setDeleteTarget(null);
      showToast('Category archived successfully', 'success');
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Deactivation failed', 'danger');
    }
  }

  function set(field: keyof CatForm, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="space-y-8 animate-[fadeRise_400ms_ease-out]">
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl backdrop-blur-md border animate-[fadeRise_300ms_ease-out] flex items-center gap-3 ${
          toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 
          toast.type === 'danger' ? 'bg-red-500/90 text-white border-red-400' : 'bg-slate-800/95 text-white border-slate-700'
        }`}>
          <p className="text-[11px] font-black uppercase tracking-widest">{toast.message}</p>
        </div>
      )}

      {/* Hero Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Product Categories</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Architect the structural hierarchy of your jewellery collections.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-white border border-slate-100 rounded-xl shadow-sm">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
               Show Archived
               <input 
                 type="checkbox" 
                 checked={showInactive} 
                 onChange={e => setShowInactive(e.target.checked)}
                 className="w-4 h-4 rounded border-slate-200 text-blue-600 transition-all cursor-pointer accent-blue-600"
               />
             </label>
          </div>
          <button 
            onClick={openCreate}
            className="px-6 py-3.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest shadow-xl hover:bg-blue-600 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
            Create Category
          </button>
        </div>
      </section>

      {/* Main Content Card */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hydrating Catalog...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-32 space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
               <svg width="32" height="32" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <p className="text-slate-400 font-medium">No results found in current view</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-left">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Metadata</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="px-8 py-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {categories.map((c) => (
                  <tr key={c._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                             {c.image_url ? (
                               <img src={staticUrl(c.image_url)} className="w-full h-full object-cover" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-slate-300">
                                 <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                               </div>
                             )}
                          </div>
                          <div>
                             <p className="text-sm font-black text-slate-900">{c.name}</p>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">SLUG: {c.slug}</p>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       {(() => {
                         const style = c.is_active ? statusBadge.active : statusBadge.inactive;
                         return (
                           <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${style.wrap}`}>
                             <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                             {c.is_active ? 'Active' : 'Archived'}
                           </span>
                         );
                       })()}
                    </td>
                    <td className="px-8 py-6">
                       <p className="text-xs font-medium text-slate-500 max-w-xs line-clamp-2">{c.description || 'No specialized description provided'}</p>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEdit(c)}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 shadow-sm transition-all"
                          >
                             <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 00 2 2h14a2 2 0 00 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button 
                            onClick={() => setDeleteTarget(c)}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-all"
                          >
                             <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Editor Modal */}
      {modalOpen && (
        <Modal open={true} onClose={() => setModalOpen(false)} title={editTarget ? 'Synchronize Identity' : 'Protocol: Add Category'} width="max-w-xl">
          <div className="space-y-6 pt-2">
            {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-600 uppercase tracking-widest">{error}</div>}
            
            <div className="space-y-4">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category Name <span className="text-red-500">*</span></label>
                  <input 
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    value={form.name} 
                    onChange={e => set('name', e.target.value)} 
                    placeholder="e.g. Victorian Heirlooms"
                  />
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Narrative (Description)</label>
                  <textarea 
                    rows={4} 
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none" 
                    value={form.description} 
                    onChange={e => set('description', e.target.value)} 
                    placeholder="Describe the essence of this collection..."
                  />
               </div>

               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visual Asset</label>
                  <div className="flex gap-4">
                     {imagePreview && (
                        <div className="relative group/img overflow-hidden">
                           <img src={imagePreview} className="w-32 h-32 rounded-3xl object-cover border border-slate-200" />
                           <button 
                             onClick={() => { setImageFile(null); setImagePreview(''); }}
                             className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-[2px]"
                           >
                              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
                           </button>
                        </div>
                     )}
                     <label className={`flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl hover:bg-slate-50 hover:border-blue-300 transition-all cursor-pointer group ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 mb-2 transition-colors">
                           <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-600 transition-colors">
                           {imagePreview ? 'Replace Asset' : 'Drop Image Here'}
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                     </label>
                  </div>
               </div>

               <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex-1">
                     <p className="text-xs font-bold text-slate-700">Display in Catalog</p>
                     <p className="text-[10px] font-medium text-slate-400">Archived categories are hidden from the frontend store.</p>
                  </div>
                  <button 
                    onClick={() => set('is_active', !form.is_active)}
                    className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${form.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-transform duration-300 ${form.is_active ? 'left-6' : 'left-1'}`} />
                  </button>
               </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => setModalOpen(false)} 
                className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 rounded-2xl border transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving || !form.name} 
                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
              >
                {saving ? 'Synchronizing...' : editTarget ? 'Commit Changes' : 'Initialize Protocol'}
                {!saving && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)} title="Destructive Action Required" width="max-w-md">
          <div className="space-y-6 pt-2">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
               <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div className="text-center">
               <p className="text-sm font-black text-slate-900">Archive {deleteTarget.name}?</p>
               <p className="text-xs font-medium text-slate-500 mt-2">This category will be soft-deleted. It will no longer appear in the catalogue design list but historical links will be preserved.</p>
            </div>
            
            <div className="flex gap-4">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 rounded-2xl border transition-colors">Maintain</button>
              <button onClick={handleDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 hover:bg-rose-700 transition-all">Proceed to Deactivation</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
