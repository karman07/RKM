'use client';
import { useState, useEffect } from 'react';
import { getBranches, createBranch, updateBranch, deleteBranch, getUsers, type Branch } from '@/lib/api';
import Modal from '@/components/Modal';
import { 
  Plus, 
  MapPin, 
  Phone, 
  Mail, 
  User, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Building2,
  Globe,
  Hash,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState<Partial<Branch>>({
    name: '',
    code: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    city: '',
    state: '',
    pincode: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [branchData, managerData] = await Promise.all([
        getBranches(),
        getUsers('manager', 1, 100)
      ]);
      setBranches(branchData);
      setManagers(managerData.data);
    } catch (e: any) {
      showToast(e.message || 'Failed to initialize registry', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showToast(message: string, type: 'success' | 'danger') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', code: '', address: '', phone: '', email: '', manager: '', city: '', state: '', pincode: '', is_active: true });
    setError('');
    setModalOpen(true);
  }

  function openEdit(b: Branch) {
    setEditTarget(b);
    setForm({ ...b, manager: (b.manager as any)?._id || (b.manager as string) || '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await updateBranch(editTarget._id, form);
        showToast('Branch updated successfully', 'success');
      } else {
        await createBranch(form);
        showToast('Branch created successfully', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteBranch(deleteTarget._id);
      setDeleteTarget(null);
      showToast('Branch removed from registry', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Deletion failed', 'danger');
    }
  }

  const filtered = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    b.code.toLowerCase().includes(search.toLowerCase()) ||
    b.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Organization Registry</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Manage Branch Network & Strategic Locations
          </p>
        </div>
        
        <button
          onClick={openCreate}
          className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-blue-600/20 group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          <span className="font-bold text-sm tracking-wide">Register New Branch</span>
        </button>
      </div>

      {/* Command Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder="Search by name, code, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Grid Display */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-100 rounded-[2rem] p-8 h-[240px] animate-pulse">
              <div className="flex gap-4 mb-6">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-32 bg-slate-100 rounded-full" />
                  <div className="h-3 w-20 bg-slate-100 rounded-full" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="h-4 w-full bg-slate-100 rounded-full" />
                <div className="h-4 w-2/3 bg-slate-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-[2rem] py-32 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No branches located</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Your search criteria didn't match any registered branches. Try adjusting your filters or add a new strategic location.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((b) => (
            <div key={b._id} className="group bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:shadow-2xl hover:shadow-blue-600/5 hover:border-blue-100 transition-all duration-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(b)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(b)} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-5 mb-8">
                <div className="w-16 h-16 bg-blue-600/5 rounded-3xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-inner">
                  <Building2 className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-md">{b.code}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${b.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} title={b.is_active ? 'Active' : 'Inactive'} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">{b.name}</h3>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                  <p className="text-sm text-slate-600 leading-relaxed italic">{b.address}, {b.city}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700 font-bold">{b.phone}</span>
                </div>
                {b.manager && (
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-[11px] uppercase tracking-wider font-black text-slate-500">
                       Manager: {(b.manager as any).name || 'Authenticated Personnel'}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{b.state || 'Regional Office'} / {b.pincode || 'N/A'}</span>
                </div>
                {b.email && <Mail className="w-4 h-4 text-blue-500/40" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Modify Branch Registry' : 'Establish New Location'}>
        <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1 pr-3 scrollbar-hide">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-2xl px-5 py-4 flex items-center gap-3">
              <XCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Location Name</label>
              <div className="relative group">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600" />
                <input
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="Main Boutique"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Branch Code</label>
              <div className="relative group">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600" />
                <input
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  value={form.code}
                  onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})}
                  placeholder="BR-001"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Full Address</label>
            <textarea
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all min-h-[100px] resize-none"
              value={form.address}
              onChange={(e) => setForm({...form, address: e.target.value})}
              placeholder="Enter comprehensive address details..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">City</label>
              <input
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                value={form.city}
                onChange={(e) => setForm({...form, city: e.target.value})}
                placeholder="Ludhiana"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">State</label>
              <input
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                value={form.state}
                onChange={(e) => setForm({...form, state: e.target.value})}
                placeholder="Punjab"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Pincode</label>
              <input
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                value={form.pincode}
                onChange={(e) => setForm({...form, pincode: e.target.value})}
                placeholder="141001"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Phone Vector</label>
              <div className="relative group">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600" />
                <input
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  value={form.phone}
                  onChange={(e) => setForm({...form, phone: e.target.value})}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Boutique Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600" />
                <input
                  type="email"
                  className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  placeholder="contact@boutique.com"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 ml-1">Management Contact</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600" />
              <select
                className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none font-bold"
                value={form.manager || ''}
                onChange={(e) => setForm({...form, manager: e.target.value})}
              >
                <option value="">Unassigned</option>
                {managers.map(m => (
                  <option key={m._id} value={m._id}>{m.name} ({m.email})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 mb-0.5">Activation Status</p>
              <p className="text-[10px] text-slate-500 font-medium tracking-tight">Set if this branch is currently operational</p>
            </div>
            <button
              type="button"
              onClick={() => setForm({...form, is_active: !form.is_active})}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all ${form.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all shadow-sm ${form.is_active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel Operation
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : editTarget ? 'Sync Metadata' : 'Initiate Registry'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Revoke Registry">
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Trash2 className="w-10 h-10 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-2 italic">Confirm Revocation</h3>
            <p className="text-sm text-slate-500 leading-relaxed px-4">
              Are you prepared to decommission <strong>{deleteTarget?.name}</strong> from the Maison registry? This action is irreversible.
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all">
              Abort
            </button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg shadow-red-600/20 active:scale-95">
              Confirm Deletion
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
