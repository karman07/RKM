'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle2, XCircle, Wallet, RefreshCw } from 'lucide-react';
import { getSmsStatus, getSmsBalance, getSmsStats, type SmsStats } from '@/lib/api';

function Spinner() {
  return <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 flex gap-4 items-start hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  manual_thank_you: 'Thank You (Manual)',
  sale_completed: 'Purchase Confirmation',
  sale_returned: 'Return Notice',
  otp: 'OTP',
  manual: 'Manual',
};

export default function SmsControlPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stats, setStats] = useState<SmsStats | null>(null);
  const [balance, setBalance] = useState<any>(null);
  const [balanceError, setBalanceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);

  async function loadStats() {
    setLoading(true);
    try {
      const status = await getSmsStatus();
      setEnabled(status.enabled);
      if (status.enabled) setStats(await getSmsStats());
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadBalance() {
    setLoadingBalance(true);
    setBalanceError('');
    try {
      setBalance(await getSmsBalance());
    } catch (e: any) {
      setBalanceError(e?.message || 'Failed to check balance');
    } finally {
      setLoadingBalance(false);
    }
  }

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { if (enabled) loadBalance(); }, [enabled]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SMS Control</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">MSG91 delivery stats for purchase confirmations, return notices and manual thank-you messages</p>
        </div>
        <button
          onClick={() => { loadStats(); }}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-500 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {!enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <MessageSquare size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-black text-amber-800">MSG91 is not configured</p>
            <p className="text-xs text-amber-700 mt-0.5">Set <code className="font-mono">MSG91_AUTH_KEY</code> (and optionally <code className="font-mono">MSG91_SENDER_ID</code>) in the backend environment to enable SMS.</p>
          </div>
        </div>
      )}

      {enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatCard icon={CheckCircle2} label="Sent" value={String(stats?.sentCount ?? 0)} color="#059669" />
            <StatCard icon={XCircle} label="Failed" value={String(stats?.failedCount ?? 0)} color="#dc2626" />
            <StatCard
              icon={Wallet}
              label="MSG91 Balance"
              value={loadingBalance ? '…' : balanceError ? '—' : (balance?.balance ?? balance?.data ?? JSON.stringify(balance ?? {})) as string}
              sub={balanceError || undefined}
              color="#263a5e"
            />
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Recent Messages</h3>
            </div>
            {(stats?.recent?.length ?? 0) === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">No SMS sent yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Phone', 'Trigger', 'Status', 'Reference', 'Sent At'].map(h => (
                      <th key={h} className="px-6 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats!.recent.map(log => (
                    <tr key={log._id} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 font-bold text-slate-800">{log.phone}</td>
                      <td className="px-6 py-3 text-slate-500">{TRIGGER_LABELS[log.trigger] ?? log.trigger}</td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${log.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {log.status}
                        </span>
                        {log.status === 'failed' && log.error && <p className="text-[10px] text-red-500 mt-0.5">{log.error}</p>}
                      </td>
                      <td className="px-6 py-3 text-slate-500 font-mono text-xs">{log.sale_reference || '—'}</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
