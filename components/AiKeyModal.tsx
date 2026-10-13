'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { getAiKeyStatus, saveAiKey, removeAiKey, type AiKeyStatus } from '@/lib/api';

export default function AiKeyModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: (s: AiKeyStatus) => void }) {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!open) return;
    setKey(''); setError(''); setDone('');
    getAiKeyStatus().then(setStatus).catch(e => setError(e.message));
  }, [open]);

  async function save() {
    setBusy(true); setError(''); setDone('');
    try {
      const s = await saveAiKey(key.trim());
      setStatus(s); setKey(''); setDone('Key verified and saved.');
      onChanged?.(s);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save key'); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('Remove the saved key? The AI assistant will stop working unless a key is set on the server.')) return;
    setBusy(true); setError(''); setDone('');
    try { const s = await removeAiKey(); setStatus(s); setDone('Saved key removed.'); onChanged?.(s); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to remove key'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Claude API key">
      <div className="space-y-4">
        <div className={`p-3 rounded-xl border text-xs font-bold ${status?.configured ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
          {!status ? 'Checking…'
            : status.configured
              ? `Active key ending …${status.last4} (${status.source === 'database' ? `saved in admin${status.updated_by ? ` by ${status.updated_by}` : ''}` : 'from server environment'})`
              : 'No key configured — the AI assistant is disabled.'}
        </div>

        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold">{error}</div>}
        {done && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">{done}</div>}

        <label className="block text-xs font-bold text-slate-600">
          {status?.configured ? 'Replace with a new key' : 'Anthropic API key'}
          <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={e => setKey(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono" />
        </label>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Get a key from console.anthropic.com. It is tested with Anthropic before saving, stored encrypted, and never shown again. A key saved here takes priority over the server environment variable.
        </p>

        <div className="flex justify-between gap-3 pt-1">
          {status?.source === 'database'
            ? <button disabled={busy} onClick={remove} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-50">Remove saved key</button>
            : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100">Close</button>
            <button disabled={busy || !key.trim()} onClick={save} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & save'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
