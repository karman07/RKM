'use client';

import { useState, useEffect } from 'react';
import {
  Send, Search, CheckCircle2, XCircle, AlertCircle, Info,
  ArrowRight, Clock, Lock, Unlock, Smartphone,
} from 'lucide-react';
import {
  getCustomers, waSendToCustomer, waListTemplatesV2,
  type Customer, type WaTemplateV2, type WaMessageCategory,
} from '@/lib/api';

const CATEGORY_META: Record<WaMessageCategory, { label: string; color: string; bg: string }> = {
  marketing:      { label: 'Marketing',      color: '#7c3aed', bg: '#f5f3ff' },
  utility:        { label: 'Utility',        color: '#1f63d8', bg: '#eef5ff' },
  authentication: { label: 'Authentication', color: '#0891b2', bg: '#ecfeff' },
  service:        { label: 'Service',        color: '#059669', bg: '#ecfdf5' },
};

const CUSTOMER_VARS = [
  { key: 'name', label: 'Full Name' }, { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' }, { key: 'city', label: 'City' },
  { key: 'saleReference', label: 'Sale Ref' }, { key: 'itemName', label: 'Item Name' },
  { key: 'amount', label: 'Amount' }, { key: 'branchName', label: 'Branch' },
  { key: 'shopName', label: 'Shop Name' }, { key: 'returnDeadline', label: 'Return Deadline' },
];

function Spinner() {
  return <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`app-toast ${type === 'success' ? 'app-toast-success' : 'app-toast-danger'}`}>
      {type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      <span className="flex-1">{msg}</span>
      <button className="app-toast-close" onClick={onClose}><XCircle size={16} /></button>
    </div>
  );
}

export default function SendPage() {
  const [customers,      setCustomers]      = useState<Customer[]>([]);
  const [approvedTpls,   setApproved]       = useState<WaTemplateV2[]>([]);
  const [otherTpls,      setOther]          = useState<WaTemplateV2[]>([]);
  const [search,         setSearch]         = useState('');
  const [selectedId,     setSelectedId]     = useState('');
  const [selectedTpl,    setSelectedTpl]    = useState('');
  const [paramOverrides, setParamOverrides] = useState<Record<string, string>>({});
  const [category,       setCategory]       = useState<WaMessageCategory>('utility');
  const [sending,        setSending]        = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    Promise.all([getCustomers(1, 300), waListTemplatesV2()])
      .then(([custs, tpls]) => {
        setCustomers(custs.data);
        setApproved(tpls.filter(t => t.status === 'APPROVED'));
        setOther(tpls.filter(t => t.status !== 'APPROVED'));
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase())
  );
  const recipient = customers.find(c => c._id === selectedId);
  const template  = approvedTpls.find(t => t.name === selectedTpl);
  const varMapping = template?.variableMapping ?? {};
  const body       = template?.components.find(c => c.type === 'BODY')?.text ?? '';
  const header     = template?.components.find(c => c.type === 'HEADER');
  const buttons    = template?.components.find(c => c.type === 'BUTTONS');

  // Count variables in body
  const varCount = Math.max(
    ...(body.match(/\{\{\d+\}\}/g)?.map(m => parseInt(m.replace(/[{}]/g, ''))) ?? [0])
  );

  function buildParams(): string[] {
    return Array.from({ length: Math.max(varCount, 0) }, (_, i) => {
      const pos = String(i + 1);
      // Use override first, then auto from customer
      if (paramOverrides[pos]) return paramOverrides[pos];
      const field = varMapping[pos];
      if (!field || !recipient) return '';
      return (recipient as any)[field] ?? '';
    });
  }

  function renderPreview(text: string): string {
    const params = buildParams();
    let result = text;
    params.forEach((v, i) => {
      result = result.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'),
        v ? `<mark class="bg-green-100 text-green-800 px-0.5 rounded">${v}</mark>` : `<mark class="bg-red-100 text-red-700 px-0.5 rounded">[${varMapping[String(i+1)] ?? `param ${i+1}`}]</mark>`
      );
    });
    return result;
  }

  async function handleSend() {
    setError('');
    if (!selectedId) { setError('Please select a recipient'); return; }
    if (!selectedTpl) { setError('Please select an approved template'); return; }
    if (!template)   { setError('Template not found'); return; }

    setSending(true);
    try {
      const params = buildParams();
      const res = await waSendToCustomer(selectedId, {
        templateName: selectedTpl,
        params,
        category,
      });
      if (res.queued) {
        setToast({ msg: `✓ Message queued for ${recipient?.name}`, type: 'success' });
        setSelectedId(''); setSelectedTpl(''); setParamOverrides({});
      } else {
        setError(res.message || 'Message could not be queued');
      }
    } catch (e: any) {
      const msg = e.message || 'Failed to send';
      setError(msg);
      setToast({ msg, type: 'error' });
    } finally { setSending(false); }
  }

  return (
    <div className="space-y-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div>
        <h2 className="text-xl font-black text-slate-900">Send to Customer</h2>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
          Select an <span className="text-green-600 font-black">APPROVED</span> template and a recipient to queue a message
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-2xl animate-[fadeRise_200ms_ease-out]">
          <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black text-red-700">Cannot send message</p>
            <p className="text-xs text-red-500 font-medium mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-300 hover:text-red-500 transition-colors">
            <XCircle size={16} />
          </button>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-6">
        {/* Step 1: Template */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">1</div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Select Template</h3>
              <p className="text-[10px] text-slate-400 font-medium">Must be APPROVED by Meta</p>
            </div>
          </div>

          {/* Approved templates */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-green-600 flex items-center gap-1">
              <Unlock size={9} /> Approved Templates ({approvedTpls.length})
            </p>
            {loading ? <div className="flex justify-center py-4"><Spinner /></div> :
              approvedTpls.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-black text-amber-700">No approved templates yet</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Create and submit templates in the Templates tab. Meta reviews within 24h.</p>
                </div>
              ) : approvedTpls.map(t => (
                <button key={t._id} onClick={() => { setSelectedTpl(t.name); setParamOverrides({}); }}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${selectedTpl === t.name ? 'border-green-300 bg-green-50/60' : 'border-slate-100 hover:border-green-200 hover:bg-green-50/30'}`}>
                  <CheckCircle2 size={14} className={`mt-0.5 shrink-0 ${selectedTpl === t.name ? 'text-green-500' : 'text-slate-200'}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-700 font-mono truncate">{t.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold">{t.category} · {t.language}</p>
                    {t.components.find(c => c.type === 'BODY')?.text && (
                      <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {t.components.find(c => c.type === 'BODY')?.text}
                      </p>
                    )}
                  </div>
                </button>
              ))
            }
          </div>

          {/* Other templates (disabled) */}
          {otherTpls.length > 0 && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1 mt-2">
                <Lock size={9} /> Pending / Rejected / Disabled ({otherTpls.length})
              </p>
              {otherTpls.map(t => (
                <div key={t._id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed">
                  <Clock size={13} className="text-slate-300 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-400 font-mono truncate">{t.name}</p>
                    <p className="text-[9px] text-slate-300 font-bold">{t.status}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Step 2: Recipient */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">2</div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Select Recipient</h3>
              <p className="text-[10px] text-slate-400 font-medium">Must be opted-in to WhatsApp</p>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input placeholder="Name, phone, email…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
          </div>

          <div className="space-y-1.5 max-h-[370px] overflow-y-auto pro-scrollbar">
            {loading ? <div className="flex justify-center py-8"><Spinner /></div> :
              filtered.length === 0 ? <p className="text-center text-slate-300 py-8 text-sm">No customers found</p> :
              filtered.map(c => (
                <button key={c._id} onClick={() => setSelectedId(c._id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all ${selectedId === c._id ? 'border-blue-200 bg-blue-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-black text-[12px] flex items-center justify-center shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-700 truncate">{c.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold">{c.phone || c.email || '—'}</p>
                  </div>
                  {selectedId === c._id && <CheckCircle2 size={14} className="text-blue-500 shrink-0" />}
                </button>
              ))
            }
          </div>
        </div>

        {/* Step 3: Review & send */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">3</div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Review & Send</h3>
              <p className="text-[10px] text-slate-400 font-medium">Auto-fill from customer data</p>
            </div>
          </div>

          {/* Recipient pill */}
          {recipient && (
            <div className="flex items-center gap-2.5 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-[12px] flex items-center justify-center shrink-0">
                {recipient.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-blue-700">{recipient.name}</p>
                <p className="text-[9px] text-blue-500/70 font-bold">{recipient.phone}</p>
              </div>
            </div>
          )}

          {/* Template preview with filled vars */}
          {template && body && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Message Preview</p>
              {header?.format === 'IMAGE' && header.mediaUrl && (
                <img src={header.mediaUrl} className="w-full h-24 object-cover rounded-xl" alt="Header" />
              )}
              {header?.format === 'TEXT' && header.text && (
                <p className="text-xs font-black text-slate-700 px-3 pt-2">{header.text}</p>
              )}
              <div className="px-3 py-2.5 bg-[#ECE5DD] rounded-xl">
                <p className="text-[11px] text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderPreview(body) }} />
              </div>
              {template.components.find(c => c.type === 'FOOTER')?.text && (
                <p className="text-[9px] text-slate-400 italic px-3">
                  {template.components.find(c => c.type === 'FOOTER')?.text}
                </p>
              )}
            </div>
          )}

          {/* Parameter overrides */}
          {varCount > 0 && template && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Parameter Overrides <span className="text-slate-300 font-medium normal-case">(auto-filled from customer data)</span></p>
              {Array.from({ length: varCount }, (_, i) => {
                const pos   = String(i + 1);
                const field = varMapping[pos];
                const auto  = field && recipient ? (recipient as any)[field] ?? '' : '';
                const label = CUSTOMER_VARS.find(v => v.key === field)?.label ?? `Param ${i + 1}`;
                return (
                  <div key={pos}>
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1">
                      {'{'}{'{'}{i + 1}{'}'}{'}'} — {label}
                    </label>
                    <input
                      value={paramOverrides[pos] ?? auto}
                      onChange={e => setParamOverrides(prev => ({ ...prev, [pos]: e.target.value }))}
                      placeholder={auto || label}
                      className={`w-full px-3 py-2 border rounded-xl text-[11px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none ${auto && !paramOverrides[pos] ? 'border-green-200 bg-green-50/30 text-green-700' : 'border-slate-200'}`}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Billing category */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Billing Category</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CATEGORY_META) as WaMessageCategory[]).map(cat => {
                const m = CATEGORY_META[cat];
                return (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`p-2 rounded-xl border text-left transition-all ${category === cat ? '' : 'border-slate-100 hover:border-slate-200'}`}
                    style={category === cat ? { background: m.bg, borderColor: `${m.color}50`, color: m.color } : {}}>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={category === cat ? { color: m.color } : { color: '#94a3b8' }}>{m.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Send button */}
          <button onClick={handleSend}
            disabled={!selectedId || !selectedTpl || sending || approvedTpls.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:pointer-events-none">
            {sending ? <><Spinner /><span>Sending…</span></> : <><Send size={16} /><span>Queue Message</span></>}
          </button>

          {approvedTpls.length === 0 && !loading && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2 items-start">
              <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-red-600 font-bold leading-relaxed">
                No approved templates. Go to the <strong>Templates</strong> tab to create and submit templates for Meta review.
              </p>
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start">
            <Info size={13} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
              Customers not opted-in will be skipped. 60-second deduplication per template per customer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
