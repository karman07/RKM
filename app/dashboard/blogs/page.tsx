'use client';
import { useState, useEffect, useCallback } from 'react';
import { getBlogs, createBlog, updateBlog, deleteBlog, uploadBlogImage, staticUrl, type Blog } from '@/lib/api';
import Modal from '@/components/Modal';
import { 
  Search, Plus, Edit3, Trash2, FileText, 
  ChevronLeft, ChevronRight, ImagePlus 
} from 'lucide-react';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface BlogForm {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover_image: string;
  author: string;
  tags: string;
  categories: string;
  is_published: boolean;
  meta_title: string;
  meta_description: string;
}

const emptyForm: BlogForm = {
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  cover_image: '',
  author: 'RKM Team',
  tags: '',
  categories: '',
  is_published: false,
  meta_title: '',
  meta_description: '',
};

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Blog | null>(null);
  const [form, setForm] = useState<BlogForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Blog | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBlogs({ 
        page: String(page), 
        limit: '10',
        search: search.trim() 
      });
      setBlogs(res.data);
      setTotal(res.meta.total);
    } catch (e: any) {
      showToast(e.message || 'Failed to load blogs');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setSelectedFile(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(b: Blog) {
    setEditTarget(b);
    setSelectedFile(null);
    setForm({
      title: b.title,
      slug: b.slug,
      content: b.content,
      excerpt: b.excerpt,
      cover_image: b.cover_image,
      author: b.author,
      tags: (b.tags || []).join(', '),
      categories: (b.categories || []).join(', '),
      is_published: b.is_published,
      meta_title: b.meta_title || '',
      meta_description: b.meta_description || '',
    });
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteBlog(deleteTarget._id);
      showToast('Story decommissioned successfully');
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      showToast(e.message || 'Decommissioning failed');
    }
  }

  async function handleSave() {
    if (!form.title || !form.slug) {
      showToast('Title and slug are required');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, val]) => {
        if (val !== undefined && val !== null) fd.append(key, String(val));
      });
      if (selectedFile) fd.append('file', selectedFile);

      if (editTarget) {
        await updateBlog(editTarget._id, fd);
        showToast('Story synchronized successfully');
      } else {
        await createBlog(fd);
        showToast('Story launched successfully');
      }
      setModalOpen(false);
      setSelectedFile(null);
      load();
    } catch (e: any) {
      showToast(e.message || 'Transmission failed');
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (dateStr: any) => {
    if (!dateStr) return 'Recently';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-8 animate-[fadeRise_300ms_ease-out]">
      {toast && <div className="app-toast">{toast}</div>}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Artisan Journal</h1>
          <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em]">Storytelling Architecture & SEO Discovery</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Filter stories..." 
              className="pl-11 pr-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm w-[280px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-200 transition-all text-slate-900 placeholder-slate-300 shadow-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-2xl shadow-blue-500/20 transition-all active:scale-95">
            <Plus className="w-4 h-4" />
            Launch Narrative
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 overflow-hidden">
        {loading ? (
          <div className="py-32 flex flex-col items-center gap-6">
            <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synchronizing Manifest...</p>
          </div>
        ) : blogs.length === 0 ? (
          <div className="py-32 text-center">
             <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-slate-200" />
             </div>
             <p className="text-slate-900 font-black text-lg">No narratives discovered</p>
             <p className="text-[10px] uppercase font-bold text-slate-300 tracking-widest mt-2">Begin your artisan journey now</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Article Manifest</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Author</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">SEO Integrity</th>
                  <th className="px-10 py-6"></th>
                </tr>
              </thead>
              <tbody>
                {blogs.map((b) => (
                  <tr key={b._id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.25rem] bg-slate-100 overflow-hidden border border-slate-100 shrink-0 group-hover:scale-110 transition-transform duration-700 ease-in-out">
                          {b.cover_image ? (
                            <img src={staticUrl(b.cover_image)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-black text-slate-200 text-lg">RK</div>
                          )}
                        </div>
                        <div className="max-w-md">
                          <p className="font-black text-slate-900 text-lg line-clamp-1 group-hover:text-blue-600 transition-colors">{b.title}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-3">
                            <span className="text-blue-500">/{b.slug}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                            <span>{formatDate(b.createdAt)}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                       <p className="text-sm font-black text-slate-700">{b.author}</p>
                    </td>
                    <td className="px-10 py-8">
                      <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest ${b.is_published ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                        {b.is_published ? 'Broadcast' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex gap-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className={`h-1.5 w-8 rounded-full ${b.meta_title && b.meta_description ? 'bg-blue-500' : 'bg-slate-100'}`}></div>
                        ))}
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        <button onClick={() => openEdit(b)} className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:shadow-lg shadow-blue-500/5 transition-all">
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button onClick={() => setDeleteTarget(b)} className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-100 hover:shadow-lg shadow-red-500/5 transition-all">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="px-10 py-8 bg-slate-50/40 border-t border-slate-50 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total Shards: <span className="text-slate-900 ml-1">{total}</span>
            </p>
            <div className="flex items-center gap-3">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:hover:bg-white transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 text-slate-900" />
              </button>
              <div className="flex items-center gap-2 mx-1">
                {Array.from({ length: Math.ceil(total / 10) }).map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setPage(i + 1)}
                    className={`w-10 h-10 rounded-2xl text-[10px] font-black transition-all ${page === i + 1 ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:bg-white border border-transparent hover:border-slate-200'}`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
              <button 
                disabled={page * 10 >= total}
                onClick={() => setPage(p => p + 1)}
                className="p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:hover:bg-white transition-all shadow-sm"
              >
                <ChevronRight className="w-4 h-4 text-slate-900" />
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Journal Entry' : 'Draft New Narrative'} width="max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 py-6">
          <div className="lg:col-span-3 space-y-12">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-4">Story Title</label>
              <input 
                className="w-full px-0 py-3 bg-transparent border-b-2 border-slate-100 focus:border-slate-900 transition-all text-3xl font-black text-slate-900 placeholder-slate-200 outline-none" 
                placeholder="The Silent Language of Gold..."
                value={form.title} 
                onChange={(e) => {
                  const title = e.target.value;
                  setForm(f => ({ ...f, title, slug: editTarget ? f.slug : slugify(title) }));
                }} 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-10">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Permanent Identifier</label>
                <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 rounded-[1.25rem] border border-slate-100">
                  <span className="text-slate-300 font-black">/</span>
                  <input className="w-full bg-transparent border-none outline-none text-sm font-black text-blue-600" value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Primary Historian</label>
                <input className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[1.25rem] text-sm font-black text-slate-800 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all" value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Narrative Hook (Excerpt)</label>
              <textarea rows={3} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[1.25rem] text-sm font-medium text-slate-600 leading-relaxed placeholder-slate-200 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all" placeholder="Capture the reader in one sentence..." value={form.excerpt} onChange={(e) => setForm(f => ({ ...f, excerpt: e.target.value }))} />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Story Blueprint</label>
              <textarea rows={16} className="w-full px-8 py-6 bg-white border border-slate-200 rounded-[2rem] text-sm font-medium text-slate-800 leading-relaxed font-mono placeholder-slate-200 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all shadow-inner" placeholder="Markdown or HTML content..." value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-12">
            <div className="space-y-5">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Visual Manifest</label>
              <div className="w-full aspect-square rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 overflow-hidden relative group">
                {selectedFile || form.cover_image ? (
                  <>
                    <img src={selectedFile ? URL.createObjectURL(selectedFile) : staticUrl(form.cover_image)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <button onClick={() => { setSelectedFile(null); setForm(f => ({ ...f, cover_image: '' })); }} className="p-3 bg-red-500 text-white rounded-2xl shadow-xl transition-all hover:scale-110">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                    <ImagePlus className="w-10 h-10 text-slate-200 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Upload Covering Asset</p>
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-8 pt-8 border-t border-slate-100">
               <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">SEO Architecture Title</label>
                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-blue-600 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={form.meta_title} onChange={(e) => setForm(f => ({ ...f, meta_title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-3">Discovery Digest</label>
                <textarea rows={5} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-600 leading-relaxed outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={form.meta_description} onChange={(e) => setForm(f => ({ ...f, meta_description: e.target.value }))} />
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Broadcast Manifest</span>
                <button 
                  onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))} 
                  className={`h-7 w-12 rounded-full relative transition-all duration-500 ${form.is_published ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-200'}`}
                >
                  <span className={`h-5 w-5 bg-white rounded-full absolute top-1 shadow-sm transition-all duration-500 ${form.is_published ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-10 border-t border-slate-100 flex justify-end gap-5">
          <button onClick={() => setModalOpen(false)} className="px-10 py-4 text-sm font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">Withdraw</button>
          <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-[1.5rem] text-sm font-black shadow-2xl shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
            {saving ? 'Transmitting...' : editTarget ? 'Sync Entry' : 'Launch Narrative'}
          </button>
        </div>
      </Modal>

      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Decommission Narrative" width="max-w-md">
          <div className="py-2">
            <p className="text-slate-600 text-sm leading-relaxed">Are you sure you want to decommission <span className="font-black text-slate-900 italic">"{deleteTarget.title}"</span>?</p>
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-4">Security Warning: This action is permanent.</p>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all">Abort</button>
            <button onClick={handleDelete} className="px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-500/10 transition-all active:scale-95">Confirm Deletion</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
