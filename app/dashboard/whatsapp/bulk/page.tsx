'use client';

import { useState, useEffect } from 'react';
import { Layers, Search, CheckCircle2, XCircle, AlertCircle, Lock } from 'lucide-react';
import {
  getCustomers, waSendBulk, waListTemplatesV2,
  type Customer, type WaTemplateV2,
} from '@/lib/api';

function Spinner() {
  return <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`app-toast ${type === 'success' ? 'app-toast-success' : 'app-toast-danger'}`}>
      {type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      <span>{msg}</span>
      <button className="app-toast-close" onClick={onClose}><XCircle size={16} /></button>
    </div>
  );
}

export default function BulkPage() {
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [templates,  setTemplates]  = useState<WaTemplateV2[]>([]);
  const [selected,   setSelected]   = useState<string[]>([]);
  const [search,     setSearch]     = useState('');
  const [templateName, setTemplate] = useState('');
  const [params,     setParams]     = useState('');
  const [sending,    setSending]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    Promise.all([getCustomers(1, 300), waListTemplatesV2('APPROVED')])
      .then(([custs, tpls]) => { setCustomers(custs.data); setTemplates(tpls); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function selectAll() { setSelected(filtered.map(c => c._id)); }
  function clearAll()  { setSelected([]); }

  async function handleSend() {
    if (!selected.length || !templateName.trim()) return;
    setSending(true);
    try {
      const paramsArr = params.trim() ? params.split(',').map(s => s.trim()).filter(Boolean) : [];
      const res = await waSendBulk({ customerIds: selected, templateName, params: paramsArr });
      setToast({ msg: `✓ Queued ${res.queued} messages · ${res.skipped} skipped (not opted-in)`, type: 'success' });
      setSelected([]); setParams('');
    } catch (e: any) {
      setToast({ msg: e.message || 'Bulk send failed', type: 'error' });
    } finally { setSending(false); }
  }

  const approvedTemplate = templates.find(t => t.name === templateName);

  return (
    <div className="space-y-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div>
        <h2 className="text-xl font-black text-slate-900">Bulk Send</h2>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
          Send one template to many customers · 1.2 s throttle between each message
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        {/* Customer multi-select */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Recipients</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">{selected.length} of {customers.length} selected</p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">All</button>
              <button onClick={clearAll}  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">Clear</button>
            </div>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input placeholder="Filter customers…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pro-scrollbar">
            {loading ? <div className="col-span-2 flex justify-center py-8"><Spinner /></div> :
              filtered.map(c => {
                const checked = selected.includes(c._id);
                return (
                  <button key={c._id} onClick={() => toggle(c._id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${checked ? 'border-blue-200 bg-blue-50/60' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {checked && <CheckCircle2 size={11} className="text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-700 truncate">{c.name}</p>
                      <p className="text-[9px] text-slate-400 font-bold">{c.phone || '—'}</p>
                    </div>
                  </button>
                );
              })
            }
          </div>
        </div>

        {/* Form */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5 h-fit">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Message</h3>

          {selected.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
              <Layers size={14} className="text-blue-600 shrink-0" />
              <p className="text-[11px] font-black text-blue-700">{selected.length} recipients selected</p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Template *</label>
          {templates.length > 0 ? (
            <select value={templateName} onChange={e => setTemplate(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
              <option value="">— select approved template —</option>
              {templates.map(t => <option key={t._id} value={t.name}>{t.name} ({t.category})</option>)}
            </select>
          ) : (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2 items-center">
              <Lock size={14} className="text-red-400 shrink-0" />
              <p className="text-[10px] text-red-600 font-bold">No approved templates. Create and submit templates from the Templates tab.</p>
            </div>
          )}
            {approvedTemplate?.components?.find(c => c.type === 'BODY')?.text && (
              <div className="mt-2 p-2.5 bg-slate-50 rounded-lg">
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed line-clamp-3">
                  {approvedTemplate?.components.find(c => c.type === 'BODY')?.text}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Shared Params <span className="text-slate-300 font-medium normal-case">(comma-separated)</span></label>
            <input placeholder="param1, param2, …" value={params} onChange={e => setParams(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
            <p className="text-[10px] text-slate-300 mt-1 font-medium">Same params sent to all recipients</p>
          </div>

          <button onClick={handleSend} disabled={!selected.length || !templateName.trim() || sending}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:pointer-events-none">
            {sending ? <><Spinner /><span>Sending…</span></> : <><Layers size={16} /><span>Send to {selected.length || '?'} Customers</span></>}
          </button>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start">
            <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
              Customers not opted-in will be silently skipped. Cost accrues per opted-in message.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
