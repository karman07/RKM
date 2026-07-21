'use client';
import { useState, useEffect } from 'react';
import { getCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole, type CustomRole } from '@/lib/api';
import { Plus, Trash2, Edit2, Loader2, CheckCircle2, XCircle, Shield, ChevronDown, ChevronUp } from 'lucide-react';

// ── All sidebar permission keys ────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    group: 'Master Controls',
    items: [
      { key: 'dashboard',     label: 'Executive Overview' },
      { key: 'analytics',     label: 'Business Intelligence' },
      { key: 'analytics-ai',  label: 'AI Insights (Beta)' },
      { key: 'notifications', label: 'Notification Center' },
      { key: 'payments',      label: 'Payments' },
      { key: 'reports',       label: 'Reports' },
    ],
  },
  {
    group: 'Asset Custody',
    items: [
      { key: 'inventory',          label: 'Inventory Ledger' },
      { key: 'inventory.sold',     label: 'Sales Records' },
      { key: 'inventory.allocate', label: 'Allocate to Branch' },
      { key: 'inventory.damaged',  label: 'Damaged Items' },
      { key: 'inventory.stolen',   label: 'Stolen Items' },
      { key: 'purchase-orders',    label: 'Purchase Orders' },
      { key: 'suppliers',          label: 'Supplier Network' },
      { key: 'branches',           label: 'Branch Network' },
      { key: 'analytics.branches', label: 'Branch Analytics' },
      { key: 'refunds',            label: 'Return Requests' },
      { key: 'online-orders',      label: 'Online Orders' },
    ],
  },
  {
    group: 'HR & Attendance',
    items: [
      { key: 'attendance',          label: 'Personnel Attendance' },
      { key: 'item-attendance',     label: 'Item Attendance' },
      { key: 'leaves',              label: 'Leave Requests' },
      { key: 'holidays',            label: 'Holidays' },
      { key: 'location-violations', label: 'Location Violations' },
      { key: 'reimbursements',      label: 'Reimbursements' },
      { key: 'payroll',             label: 'Payroll' },
    ],
  },
  {
    group: 'Sales Team Operations',
    items: [
      { key: 'sales-team',            label: 'Sales Team Dashboard' },
      { key: 'sales-team.enquiries',  label: 'Sales Enquiries — Review' },
    ],
  },
  {
    group: 'Product Management',
    items: [
      { key: 'products',    label: 'Product Catalog' },
      { key: 'categories',  label: 'Product Categories' },
      { key: 'lookups',     label: 'Inventory Lookups' },
    ],
  },
  {
    group: 'Security & Access',
    items: [
      { key: 'users',           label: 'Access Control' },
      { key: 'customers',       label: 'Client Relations' },
      { key: 'feedback',        label: 'Feedback Analytics' },
      { key: 'gold-investment', label: 'Gold Investment' },
      { key: 'whatsapp',        label: 'WhatsApp Control' },
      { key: 'sms',             label: 'SMS Control' },
      { key: 'mail',            label: 'Mail Centre' },
      { key: 'blogs',           label: 'Curated Content' },
      { key: 'settings',        label: 'System Config' },
    ],
  },
  {
    group: 'Old Gold Operations',
    items: [
      { key: 'old-gold',                   label: 'Old Gold — Page Access' },
      { key: 'old-gold.view-branch',       label: 'View Branch Transactions' },
      { key: 'old-gold.view-all',          label: 'View All Transactions' },
      { key: 'old-gold.create',            label: 'Create Transaction' },
      { key: 'old-gold.edit',              label: 'Edit Transaction' },
      { key: 'old-gold.submit',            label: 'Submit Transaction' },
      { key: 'old-gold.approve',           label: 'Approve Transaction' },
      { key: 'old-gold.reject',            label: 'Reject Transaction' },
      { key: 'old-gold.melt',              label: 'Authorize Melting' },
      { key: 'old-gold.settle',            label: 'Settle Transaction' },
      { key: 'old-gold.override-valuation',label: 'Override Valuation Rules' },
      { key: 'old-gold.reverse-settlement',label: 'Reverse Settlements' },
      { key: 'old-gold.settings',          label: 'Manage Old Gold Settings' },
      { key: 'old-gold.manage-form',       label: 'Generate & Upload Buy-Back Form' },
    ],
  },
  {
    group: 'Gold Loan Operations',
    items: [
      { key: 'gold-loan',              label: 'Gold Loan — Page Access' },
      { key: 'gold-loan.view-branch',  label: 'View Branch Loans' },
      { key: 'gold-loan.view-all',     label: 'View All Loans' },
      { key: 'gold-loan.create',       label: 'Create Loan Request' },
      { key: 'gold-loan.edit',         label: 'Edit Loan Request' },
      { key: 'gold-loan.submit',       label: 'Submit Loan Request' },
      { key: 'gold-loan.approve',      label: 'Approve Loan Request' },
      { key: 'gold-loan.reject',       label: 'Reject Loan Request' },
      { key: 'gold-loan.mark-emi',     label: 'Mark EMI Paid / Missed' },
      { key: 'gold-loan.close',        label: 'Close Loan' },
      { key: 'gold-loan.manage-form',  label: 'Generate & Upload Pledge Form' },
      { key: 'gold-loan.export',       label: 'Export Loan Catalog' },
    ],
  },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

// ── Component ──────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [roles, setRoles]           = useState<CustomRole[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [editTarget, setEditTarget] = useState<CustomRole | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    sidebar_permissions: [] as string[],
  });

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try { setRoles(await getCustomRoles()); }
    catch (e: any) { showToast(e.message || 'Failed to load', 'danger'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', description: '', sidebar_permissions: [] });
    setShowForm(true);
  }

  function openEdit(r: CustomRole) {
    setEditTarget(r);
    setForm({ name: r.name, description: r.description ?? '', sidebar_permissions: [...r.sidebar_permissions] });
    setShowForm(true);
  }

  function togglePerm(key: string) {
    setForm(f => ({
      ...f,
      sidebar_permissions: f.sidebar_permissions.includes(key)
        ? f.sidebar_permissions.filter(k => k !== key)
        : [...f.sidebar_permissions, key],
    }));
  }

  function toggleGroup(keys: string[]) {
    const allSelected = keys.every(k => form.sidebar_permissions.includes(k));
    setForm(f => ({
      ...f,
      sidebar_permissions: allSelected
        ? f.sidebar_permissions.filter(k => !keys.includes(k))
        : [...new Set([...f.sidebar_permissions, ...keys])],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('Role name is required.', 'danger'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await updateCustomRole(editTarget._id, form);
        showToast('Role updated.', 'success');
      } else {
        await createCustomRole(form);
        showToast('Role created.', 'success');
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Failed to save', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteCustomRole(id);
      showToast('Role deleted.', 'success');
      setRoles(r => r.filter(x => x._id !== id));
    } catch (e: any) {
      showToast(e.message || 'Failed to delete', 'danger');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Role Management</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Create custom roles and configure their portal access permissions
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          New Role
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 bg-blue-50 border border-blue-100 rounded-2xl mb-8">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-px" />
        <p className="text-[11px] font-bold text-blue-700">
          Custom roles use the Admin Portal with restricted sidebar access. Assign them to users in the Access Control page. Role Management is always visible only to full Admins.
        </p>
      </div>

      {/* Roles list */}
      {loading ? (
        <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : roles.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-[2.5rem] p-24 text-center">
          <Shield className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">No custom roles yet.</p>
          <p className="text-slate-300 text-xs mt-1">Create a role to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {roles.map(role => {
            const expanded = expandedRole === role._id;
            return (
              <div key={role._id} className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
                {/* Role header */}
                <div className="flex items-center justify-between gap-4 px-7 py-5">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/20">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-slate-900">{role.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">slug: {role.slug}</p>
                      {role.description && <p className="text-[11px] text-slate-500 mt-0.5">{role.description}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                      {role.sidebar_permissions.length}/{ALL_KEYS.length} permissions
                    </span>
                    <button
                      onClick={() => setExpandedRole(expanded ? null : role._id)}
                      className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
                    >
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(role)} className="p-2 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(role._id)}
                      disabled={deleting === role._id}
                      className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      {deleting === role._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded: permissions grid */}
                {expanded && (
                  <div className="border-t border-slate-100 px-7 py-5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      {PERMISSION_GROUPS.map(g => (
                        <div key={g.group}>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{g.group}</p>
                          <div className="space-y-1">
                            {g.items.map(item => (
                              <div key={item.key} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${role.sidebar_permissions.includes(item.key) ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                <span className={`text-[11px] font-medium ${role.sidebar_permissions.includes(item.key) ? 'text-slate-800' : 'text-slate-400'}`}>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden mb-12">
            {/* Modal header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">{editTarget ? 'Edit Role' : 'Create New Role'}</h2>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">Configure name and portal access</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="px-8 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Name + Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Role Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Billing Manager"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Optional note about this role"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  />
                </div>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Sidebar Access Permissions</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, sidebar_permissions: [...ALL_KEYS] }))}
                      className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, sidebar_permissions: [] }))}
                      className="text-[10px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-wider"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  {PERMISSION_GROUPS.map(g => {
                    const groupKeys = g.items.map(i => i.key);
                    const allSelected = groupKeys.every(k => form.sidebar_permissions.includes(k));
                    const someSelected = groupKeys.some(k => form.sidebar_permissions.includes(k));
                    return (
                      <div key={g.group} className="bg-slate-50 rounded-2xl p-4">
                        {/* Group header with select-all */}
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{g.group}</p>
                          <button
                            type="button"
                            onClick={() => toggleGroup(groupKeys)}
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${allSelected ? 'bg-blue-600 text-white' : someSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`}
                          >
                            {allSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {g.items.map(item => {
                            const checked = form.sidebar_permissions.includes(item.key);
                            return (
                              <label key={item.key} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-slate-200 hover:border-slate-300'}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePerm(item.key)}
                                  className="w-3.5 h-3.5 rounded accent-blue-600"
                                />
                                <span className={`text-[11px] font-bold ${checked ? 'text-blue-700' : 'text-slate-600'}`}>{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-8 py-5 border-t border-slate-100 bg-slate-50/40">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {editTarget ? 'Save Changes' : 'Create Role'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-black hover:bg-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
