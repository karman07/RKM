'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Mail, Send, FileText, Settings, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Plus, Pencil, Trash2, Star, Inbox, Zap,
  MessageCircle, Bell,
} from 'lucide-react';
import {
  getEmailLogs, getEmailStats, getEmailStatus, sendEmail, sendTestEmail,
  updateSettings, getSettings, listEmailTemplates, createEmailTemplate,
  updateEmailTemplate, deleteEmailTemplate, activateEmailTemplate,
  type EmailLog, type EmailStats, type EmailStatus, type EmailTemplate,
} from '@/lib/api';
import EmailTemplateEditor from '@/components/EmailTemplateEditor';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  sale_completed: { label: 'Purchase', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100',   dot: 'bg-blue-500'   },
  sale_returned:  { label: 'Return',   color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100', dot: 'bg-amber-500' },
  sale_reserved:  { label: 'Reserved', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500' },
  feedback:       { label: 'Feedback', color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-100',  dot: 'bg-green-500'  },
  manual:         { label: 'Manual',   color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  dot: 'bg-slate-400'  },
};

const TYPE_LABELS: Record<string, string> = {
  sale_completed: 'Purchase Confirmation',
  sale_returned:  'Return Acknowledgement',
  sale_reserved:  'Reservation Notice',
  feedback:       'Feedback Request',
  custom:         'Custom',
};

const STATUS_CFG = {
  sent:    { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  failed:  { icon: XCircle,     color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-100',     dot: 'bg-red-500'     },
  pending: { icon: AlertCircle, color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100',   dot: 'bg-amber-500'   },
};

type Tab = 'history' | 'compose' | 'templates' | 'settings';

function fmtDate(iso: string) {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function Spin({ size = 16 }: { size?: number }) {
  return <div style={{ width: size, height: size }} className="border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />;
}

function Toast({ msg, ok, onClose }: { msg: string; ok: boolean; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-sm font-bold animate-in slide-in-from-bottom-4 duration-300 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
      {msg}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MailPage() {
  const [tab, setTab] = useState<Tab>('history');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => setToast({ msg, ok }), []);

  // ── History state ────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterTrigger, setFilterTrigger] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Compose state ────────────────────────────────────────────────────────
  const [cTo, setCTo] = useState('');
  const [cName, setCName] = useState('');
  const [cSubject, setCSubject] = useState('');
  const [cBody, setCBody] = useState('');
  const [sending, setSending] = useState(false);

  // ── Templates state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(true);
  const [editingTpl, setEditingTpl] = useState<Partial<EmailTemplate> | null>(null);
  const [isNewTpl, setIsNewTpl] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplFilterType, setTplFilterType] = useState('');

  // ── Settings state ───────────────────────────────────────────────────────
  const [waEnabled, setWaEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailTriggers, setEmailTriggers] = useState({ sale_completed: true, sale_returned: true, sale_reserved: false });
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadHistory();
    getEmailStats().then(setStats).catch(() => {});
    getEmailStatus().then(setEmailStatus).catch(() => {});
    getSettings().then(s => {
      setWaEnabled((s as any).whatsapp_notifications_enabled !== false);
      setEmailEnabled((s as any).email_notifications_enabled !== false);
      setEmailTriggers((s as any).email_triggers ?? { sale_completed: true, sale_returned: true, sale_reserved: false });
    }).catch(() => {});
  }, []);

  useEffect(() => { loadHistory(); }, [page, filterTrigger, filterStatus]);
  useEffect(() => { if (tab === 'templates') loadTemplates(); }, [tab, tplFilterType]);

  async function loadHistory() {
    setLogsLoading(true);
    try {
      const res = await getEmailLogs(page, 25, filterTrigger || undefined, filterStatus || undefined);
      setLogs(res.data); setTotalPages(res.total_pages);
    } finally { setLogsLoading(false); }
  }

  async function loadTemplates() {
    setTplLoading(true);
    try { setTemplates(await listEmailTemplates(tplFilterType || undefined)); }
    finally { setTplLoading(false); }
  }

  // ── Email preview in iframe ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedLog || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (doc) { doc.open(); doc.write(selectedLog.html || '<p style="padding:32px;font-family:sans-serif;color:#64748b;">No content</p>'); doc.close(); }
  }, [selectedLog]);

  // ── Compose ──────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!cTo || !cSubject || !cBody) return;
    setSending(true);
    try {
      const res = await sendEmail({ to: cTo, to_name: cName || cTo, subject: cSubject, body: cBody });
      if (res.success) {
        showToast('Email sent successfully!');
        setCTo(''); setCName(''); setCSubject(''); setCBody('');
        loadHistory(); getEmailStats().then(setStats).catch(() => {});
      } else { showToast(res.error ?? 'Failed to send', false); }
    } catch { showToast('Network error', false); }
    finally { setSending(false); }
  }

  // ── Template actions ─────────────────────────────────────────────────────
  async function handleSaveTemplate(data: Partial<EmailTemplate>) {
    setTplSaving(true);
    try {
      if (isNewTpl) {
        await createEmailTemplate(data);
        showToast('Template created!');
      } else {
        await updateEmailTemplate(data._id!, data);
        showToast('Template saved!');
      }
      setEditingTpl(null);
      loadTemplates();
    } catch { showToast('Failed to save template', false); }
    finally { setTplSaving(false); }
  }

  async function handleActivate(id: string) {
    try { await activateEmailTemplate(id); showToast('Set as active!'); loadTemplates(); }
    catch { showToast('Failed to activate', false); }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template permanently?')) return;
    try { await deleteEmailTemplate(id); showToast('Template deleted'); loadTemplates(); }
    catch { showToast('Failed to delete', false); }
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    setSettingsSaving(true);
    try {
      await updateSettings({
        whatsapp_notifications_enabled: waEnabled,
        email_notifications_enabled: emailEnabled,
        email_triggers: emailTriggers,
      } as any);
      showToast('Settings saved!');
    }
    catch { showToast('Failed to save', false); }
    finally { setSettingsSaving(false); }
  }

  async function handleTestSend() {
    if (!testTo) return;
    setTestSending(true);
    try {
      const res = await sendTestEmail(testTo);
      showToast(res.success ? 'Test email sent! Check your inbox.' : (res.error ?? 'Failed'), res.success);
    } catch { showToast('Network error', false); }
    finally { setTestSending(false); }
  }

  const tabItems: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'history',   label: 'History',   icon: Inbox },
    { key: 'compose',   label: 'Compose',   icon: Send },
    { key: 'templates', label: 'Templates', icon: FileText },
    { key: 'settings',  label: 'Settings',  icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/20 flex-shrink-0">
          <Mail size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-slate-900 uppercase tracking-[0.1em]">Mail Centre</h1>
          <p className="text-[10px] text-slate-400 font-medium truncate">
            {emailStatus?.configured ? `Mailgun connected · ${emailStatus.from_email}` : 'Mailgun not configured — add keys to .env'}
          </p>
        </div>

        {stats && (
          <div className="hidden lg:flex items-center gap-2">
            {[
              { label: 'Sent',   val: stats.sent,   cls: 'bg-blue-50 text-blue-700 border-blue-100' },
              { label: 'Failed', val: stats.failed, cls: 'bg-red-50 text-red-600 border-red-100' },
              { label: 'Total',  val: stats.total,  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
            ].map(p => (
              <div key={p.label} className={`px-3 py-1.5 rounded-xl border text-center ${p.cls}`}>
                <p className="text-base font-black leading-none">{p.val}</p>
                <p className="text-[8px] font-black uppercase tracking-widest mt-0.5">{p.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">
          {tabItems.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${tab === key ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'}`}>
              <Icon size={12} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════ HISTORY */}
      {tab === 'history' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 xl:w-80 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-50 space-y-2">
              <select value={filterTrigger} onChange={e => { setFilterTrigger(e.target.value); setPage(1); }}
                className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                <option value="">All Types</option>
                {Object.entries(TRIGGER_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
              <div className="flex gap-2">
                {['', 'sent', 'failed'].map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-blue-200'}`}>
                    {s || 'All'}
                  </button>
                ))}
                <button onClick={loadHistory} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-200 text-slate-400 hover:text-blue-600 transition-all">
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {logsLoading ? (
                <div className="flex justify-center py-16"><Spin size={24} /></div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center py-20 px-6 text-center gap-3">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                    <Inbox size={22} className="text-blue-300" />
                  </div>
                  <p className="text-xs font-bold text-slate-400">No emails yet</p>
                </div>
              ) : logs.map(log => {
                const s = STATUS_CFG[log.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                const tm = TRIGGER_META[log.trigger] ?? TRIGGER_META.manual;
                const active = selectedLog?._id === log._id;
                return (
                  <button key={log._id} onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-3.5 border-b border-slate-50 transition-all ${active ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className={`text-[12px] font-black truncate flex-1 ${active ? 'text-blue-700' : 'text-slate-900'}`}>{log.to_name || log.to}</p>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">{fmtDate(log.createdAt)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mb-2">{log.subject}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                      <span className={`text-[9px] font-black uppercase tracking-wide ${s.color}`}>{log.status}</span>
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${tm.bg} ${tm.color} border ${tm.border}`}>{tm.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="text-[11px] font-bold text-slate-400 disabled:opacity-30 hover:text-blue-600 transition-colors">← Prev</button>
                <span className="text-[10px] text-slate-400 font-medium">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="text-[11px] font-bold text-slate-400 disabled:opacity-30 hover:text-blue-600 transition-colors">Next →</button>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {selectedLog ? (<>
              <div className="px-7 py-5 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-black text-slate-900 mb-2">{selectedLog.subject}</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-black flex-shrink-0">
                        {(selectedLog.to_name || selectedLog.to).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[12px] font-bold text-slate-700">{selectedLog.to_name}</span>
                      <span className="text-[11px] text-slate-400">&lt;{selectedLog.to}&gt;</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-slate-400">{new Date(selectedLog.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(() => { const s = STATUS_CFG[selectedLog.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending; const Icon = s.icon; return (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wide ${s.bg} ${s.color} ${s.border}`}>
                        <Icon size={11} /> {selectedLog.status}
                      </span>
                    ); })()}
                    {(() => { const tm = TRIGGER_META[selectedLog.trigger] ?? TRIGGER_META.manual; return (
                      <span className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold ${tm.bg} ${tm.color} ${tm.border}`}>{tm.label}</span>
                    ); })()}
                  </div>
                </div>
                {selectedLog.sale_reference && (
                  <p className="mt-2 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 inline-block">
                    Ref: {selectedLog.sale_reference}
                  </p>
                )}
                {selectedLog.error && (
                  <div className="mt-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
                    <XCircle size={13} className="text-red-500 flex-shrink-0" />
                    <p className="text-[11px] font-bold text-red-700">{selectedLog.error}</p>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-hidden bg-slate-50/60">
                <iframe ref={iframeRef} className="w-full h-full border-0" title="email-preview" sandbox="allow-same-origin" />
              </div>
            </>) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-12 text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center">
                  <Mail size={32} className="text-blue-200" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-400">Select an email to preview</p>
                  <p className="text-xs text-slate-300 mt-1">Click any message in the list</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════ COMPOSE */}
      {tab === 'compose' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Send size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">New Email</p>
                  <p className="text-[10px] text-blue-200">Send a custom message to a customer</p>
                </div>
              </div>
              <div className="p-7 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <F label="To Email *"><input type="email" value={cTo} onChange={e => setCTo(e.target.value)} placeholder="customer@example.com" className={inp} /></F>
                  <F label="Customer Name"><input type="text" value={cName} onChange={e => setCName(e.target.value)} placeholder="Full name" className={inp} /></F>
                </div>
                <F label="Subject *"><input type="text" value={cSubject} onChange={e => setCSubject(e.target.value)} placeholder="Email subject line" className={inp} /></F>
                <F label="Message *"><textarea value={cBody} onChange={e => setCBody(e.target.value)} rows={8} placeholder="Write your message here…" className={`${inp} resize-none`} /></F>
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button onClick={() => { setCTo(''); setCName(''); setCSubject(''); setCBody(''); }}
                    className="px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">Clear</button>
                  <button onClick={handleSend} disabled={sending || !cTo || !cSubject || !cBody}
                    className="px-8 py-2.5 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2 active:scale-95">
                    {sending ? <><Spin size={13} /> Sending…</> : <><Send size={12} /> Send Email</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ TEMPLATES */}
      {tab === 'templates' && (
        <div className="flex flex-1 overflow-hidden">
          {editingTpl !== null ? (
            /* ── Full visual editor ─── */
            <div className="flex-1 overflow-hidden">
              <EmailTemplateEditor
                template={editingTpl}
                isNew={isNewTpl}
                saving={tplSaving}
                onSave={handleSaveTemplate}
                onCancel={() => setEditingTpl(null)}
              />
            </div>
          ) : (
            /* ── Template list ─── */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
                <p className="text-sm font-black text-slate-900 flex-1">Email Templates</p>
                <select value={tplFilterType} onChange={e => setTplFilterType(e.target.value)}
                  className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 transition-all">
                  <option value="">All Types</option>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={() => { setIsNewTpl(true); setEditingTpl({}); }}
                  className="flex items-center gap-2 px-5 py-2 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95">
                  <Plus size={13} /> New Template
                </button>
              </div>

              {tplLoading ? (
                <div className="flex justify-center py-20"><Spin size={28} /></div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center">
                    <FileText size={32} className="text-blue-200" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-400">No templates yet</p>
                    <p className="text-xs text-slate-300 mt-1">Create templates to customise your automated emails</p>
                  </div>
                  <button onClick={() => { setIsNewTpl(true); setEditingTpl({}); }}
                    className="flex items-center gap-2 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 transition-all">
                    <Plus size={13} /> Create First Template
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  {Object.entries(TYPE_LABELS).map(([type, typeLabel]) => {
                    const group = templates.filter(t => t.type === type);
                    if (group.length === 0) return null;
                    const tm = TRIGGER_META[type];
                    return (
                      <div key={type} className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2 h-2 rounded-full ${tm?.dot ?? 'bg-slate-300'}`} />
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{typeLabel}</p>
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="text-[9px] text-slate-300 font-bold">{group.length} template{group.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-3">
                          {group.map(tpl => (
                            <div key={tpl._id}
                              className={`bg-white rounded-2xl border p-5 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-600/5 transition-all group ${tpl.is_active ? 'border-blue-200 shadow-sm shadow-blue-600/8' : 'border-slate-100'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <p className="text-sm font-black text-slate-900 truncate">{tpl.name}</p>
                                    {tpl.is_active && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-[9px] font-black uppercase tracking-wide flex-shrink-0">
                                        <Zap size={8} /> Active
                                      </span>
                                    )}
                                    {tpl.template_config && (
                                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-md text-[9px] font-bold">Visual</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 font-medium truncate mb-1">{tpl.subject}</p>
                                  {tpl.description && <p className="text-[10px] text-slate-400 truncate">{tpl.description}</p>}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {!tpl.is_active && (
                                    <button onClick={() => handleActivate(tpl._id)} title="Set as active"
                                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-100 hover:border-blue-600 transition-all">
                                      <Star size={13} />
                                    </button>
                                  )}
                                  <button onClick={() => { setIsNewTpl(false); setEditingTpl(tpl); }}
                                    className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-200 transition-all">
                                    <Pencil size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteTemplate(tpl._id)}
                                    className="p-2 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-3">
                                <span className="text-[9px] font-mono text-slate-400">
                                  Updated {new Date(tpl.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                {(tpl.variables?.length ?? 0) > 0 && (
                                  <span className="text-[9px] font-bold text-slate-400">· {tpl.variables.length} variable{tpl.variables.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ SETTINGS */}
      {tab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className={`rounded-2xl p-5 border flex items-center gap-4 ${emailStatus?.configured ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${emailStatus?.configured ? 'bg-blue-100' : 'bg-amber-100'}`}>
                {emailStatus?.configured ? <CheckCircle2 size={20} className="text-blue-600" /> : <AlertCircle size={20} className="text-amber-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${emailStatus?.configured ? 'text-blue-800' : 'text-amber-800'}`}>
                  {emailStatus?.configured ? 'Mailgun Connected' : 'Mailgun Not Configured'}
                </p>
                <p className={`text-[11px] mt-0.5 font-medium ${emailStatus?.configured ? 'text-blue-600' : 'text-amber-600'}`}>
                  {emailStatus?.configured ? `Sending as: ${emailStatus.from_name} <${emailStatus.from_email}>` : 'Set MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM_EMAIL in backend .env'}
                </p>
              </div>
            </div>

            {/* ── Channel toggles ── */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-black text-slate-900">Notification Channels</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Enable or disable each channel independently — customers can receive from one or both</p>
              </div>

              {/* Both-off warning */}
              {!waEnabled && !emailEnabled && (
                <div className="flex items-center gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-2xl">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                  <p className="text-[12px] font-bold text-red-700">Both channels are off — customers will not receive any notifications on purchase or return.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* WhatsApp card */}
                <div className={`rounded-2xl border-2 p-5 transition-all ${waEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/30'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${waEnabled ? 'bg-blue-100' : 'bg-slate-100'}`}>
                        <MessageCircle size={20} className={waEnabled ? 'text-blue-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-[13px] font-black text-slate-900">WhatsApp</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${waEnabled ? 'text-blue-600' : 'text-slate-400'}`}>
                          {waEnabled ? 'Active' : 'Blocked'}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setWaEnabled(v => !v)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${waEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${waEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {waEnabled
                      ? 'Purchase confirmations, return notices and reservations sent via WhatsApp.'
                      : 'No WhatsApp messages will be sent for any sale events.'}
                  </p>
                </div>

                {/* Email card */}
                <div className={`rounded-2xl border-2 p-5 transition-all ${emailEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/30'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${emailEnabled ? 'bg-blue-100' : 'bg-slate-100'}`}>
                        <Mail size={20} className={emailEnabled ? 'text-blue-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-[13px] font-black text-slate-900">Email</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${emailEnabled ? 'text-blue-600' : 'text-slate-400'}`}>
                          {emailEnabled ? 'Active' : 'Blocked'}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setEmailEnabled(v => !v)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${emailEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${emailEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {emailEnabled
                      ? 'Purchase confirmations and return acknowledgements sent via email.'
                      : 'No emails will be sent for any sale events.'}
                  </p>
                </div>
              </div>

              {/* Summary pill */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <Bell size={13} className="text-slate-400" />
                <p className="text-[11px] font-bold text-slate-500">
                  {waEnabled && emailEnabled && 'Sending via WhatsApp and Email — customers receive both'}
                  {waEnabled && !emailEnabled && 'Sending via WhatsApp only'}
                  {!waEnabled && emailEnabled && 'Sending via Email only'}
                  {!waEnabled && !emailEnabled && 'All notifications are blocked'}
                </p>
              </div>
            </div>

            <SC title="Email Triggers" subtitle="Which events automatically send emails to customers">
              <div className="divide-y divide-slate-50">
                {[
                  { key: 'sale_completed', label: 'Purchase Confirmation', desc: 'Fired when a sale is completed' },
                  { key: 'sale_returned',  label: 'Return Acknowledgement', desc: 'Fired when a return is recorded' },
                  { key: 'sale_reserved',  label: 'Reservation Notice',    desc: 'Fired when an item is reserved' },
                ].map(t => (
                  <div key={t.key} className="flex items-center justify-between py-3.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{t.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t.desc}</p>
                    </div>
                    <button onClick={() => setEmailTriggers(p => ({ ...p, [t.key]: !p[t.key as keyof typeof p] }))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${emailTriggers[t.key as keyof typeof emailTriggers] ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${emailTriggers[t.key as keyof typeof emailTriggers] ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </SC>

            <SC title="Test Email" subtitle="Send a sample purchase confirmation to verify your Mailgun setup">
              <div className="flex gap-3">
                <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com" className={`${inp} flex-1`} />
                <button onClick={handleTestSend} disabled={testSending || !testTo}
                  className="px-6 py-3 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-all whitespace-nowrap flex items-center gap-2 active:scale-95 shadow-lg shadow-blue-600/20">
                  {testSending ? <><Spin size={12} /> Sending…</> : 'Send Test'}
                </button>
              </div>
            </SC>

            <div className="flex justify-end pt-1">
              <button onClick={handleSaveSettings} disabled={settingsSaving}
                className="px-8 py-3 text-[11px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-95">
                {settingsSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const inp = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SC({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50">
        <p className="text-sm font-black text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}
