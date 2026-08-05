'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  getPendingInvestmentPayments, reviewInvestmentPayment,
  type PendingInvestmentPayment,
} from '@/lib/api';
import Modal from '@/components/Modal';

export default function InvestmentApprovalsPage() {
  const [items, setItems]     = useState<PendingInvestmentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  const [rejectTarget, setRejectTarget] = useState<PendingInvestmentPayment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      setItems(await getPendingInvestmentPayments());
    } catch (e: any) {
      showToast(e.message || 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(item: PendingInvestmentPayment) {
    setBusyId(item.entryId);
    try {
      await reviewInvestmentPayment(item.subscriptionId, item.entryId, { action: 'approve' });
      showToast(`Payment approved for ${item.customerName}`, 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to approve', 'danger');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusyId(rejectTarget.entryId);
    try {
      await reviewInvestmentPayment(rejectTarget.subscriptionId, rejectTarget.entryId, {
        action: 'reject',
        rejectionReason: rejectReason.trim(),
      });
      showToast(`Payment rejected for ${rejectTarget.customerName}`, 'success');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to reject', 'danger');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.customerName.toLowerCase().includes(q) ||
      (i.customerPhone || '').includes(q) ||
      i.submittedByName.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Investment Approvals</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Cash payments collected by sales, awaiting your review
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {items.length} Pending
          </div>
        )}
      </div>

      <div className="mb-8 relative group max-w-md">
        <input
          type="text"
          placeholder="Search by customer, phone, or sales rep..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-5 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Customer', 'Plan', 'Month', 'Note', 'Submitted By', 'Submitted', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-5 h-16 bg-white" />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center text-slate-400 italic text-sm">
                    No payments awaiting approval.
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={item.entryId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900">{item.customerName}</p>
                      {item.customerPhone && <p className="text-[10px] text-slate-400">{item.customerPhone}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-bold text-slate-500">{item.planName || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-slate-900">#{item.month}</span>
                    </td>
                    <td className="px-6 py-4 max-w-[200px]">
                      <p className="text-[11px] text-slate-500 truncate italic">{item.note ? `"${item.note}"` : '—'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-bold text-slate-600">{item.submittedByName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[10px] text-slate-400">{new Date(item.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(item)}
                          disabled={busyId === item.entryId}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white text-[10px] font-black transition-all border border-emerald-100 hover:border-emerald-600 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setRejectTarget(item); setRejectReason(''); }}
                          disabled={busyId === item.entryId}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white text-[10px] font-black transition-all border border-red-100 hover:border-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!rejectTarget} onClose={() => { setRejectTarget(null); setRejectReason(''); }} title="Reject Payment">
        {rejectTarget && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl border bg-red-50 border-red-100">
              <p className="text-sm font-black text-slate-900">{rejectTarget.customerName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-black text-slate-900">Month #{rejectTarget.month}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">• collected by {rejectTarget.submittedByName}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Reason (required)</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this payment is being rejected..."
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 resize-none transition-all"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || busyId === rejectTarget.entryId}
                className="flex-1 bg-red-600 text-white text-[11px] font-black uppercase rounded-2xl shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {busyId === rejectTarget.entryId ? 'Processing...' : 'Reject Payment'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
