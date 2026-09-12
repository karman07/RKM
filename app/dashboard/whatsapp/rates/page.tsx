'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Info, RefreshCw, Activity } from 'lucide-react';
import { waGetRateCard, type WaRateCard, type WaMessageCategory } from '@/lib/api';

const CATEGORY_META: Record<WaMessageCategory, { label: string; color: string; bg: string; desc: string }> = {
  marketing:      { label: 'Marketing',      color: '#263a5e', bg: '#e3e8f4', desc: 'Promotional messages — sale alerts, offers, product launches.' },
  utility:        { label: 'Utility',        color: '#4c6291', bg: '#e3e8f4', desc: 'Transactional updates — sale confirmations, receipts, order tracking.' },
  authentication: { label: 'Authentication', color: '#7186b5', bg: '#f2f4fa', desc: 'OTP and identity verification messages.' },
  service:        { label: 'Service',        color: '#059669', bg: '#ecfdf5', desc: 'Customer-initiated conversations (inbound replies) — free in most regions.' },
};

function Spinner() {
  return <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

export default function RatesPage() {
  const [rateCard, setRateCard] = useState<(WaRateCard & { usdToInr: number; ratesInr: Record<WaMessageCategory, number> }) | null>(null);
  const [loading,  setLoading]  = useState(true);

  async function load() {
    setLoading(true);
    try { setRateCard(await waGetRateCard() as any); }
    catch { /**/ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Rate Card</h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">Per-conversation pricing · loaded live from your .env</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rateCard ? (
        <>
          {/* Conversion banner */}
          <div className="flex items-center gap-3 px-5 py-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/20">
            <DollarSign size={20} className="shrink-0" />
            <div>
              <p className="text-sm font-black">1 USD = ₹{rateCard.usdToInr}</p>
              <p className="text-[10px] text-blue-200 font-medium">Change rate via WHATSAPP_USD_TO_INR in .env</p>
            </div>
          </div>

          {/* Rate cards */}
          <div className="space-y-4">
            {(Object.keys(rateCard.rates) as WaMessageCategory[]).map(cat => {
              const m    = CATEGORY_META[cat] ?? CATEGORY_META.utility;
              const usd  = rateCard.rates[cat];
              const inrAmt = rateCard.ratesInr?.[cat] ?? usd * rateCard.usdToInr;

              return (
                <div key={cat} className="bg-white border border-slate-100 rounded-2xl p-5 flex gap-5 items-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.bg }}>
                    <DollarSign size={22} style={{ color: m.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: m.color }}>{m.label}</p>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">{m.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-slate-900">₹{inrAmt.toFixed(4)}</p>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">${usd.toFixed(5)} USD · per conversation</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 items-start">
            <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-700 font-bold leading-relaxed">{rateCard.note}</p>
          </div>

          {/* env snippet */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Update Rates in .env</p>
            <pre className="p-4 bg-slate-950 text-green-400 rounded-xl text-[11px] font-mono overflow-x-auto leading-6">
{`WHATSAPP_COST_MARKETING_USD=${rateCard.rates.marketing}
WHATSAPP_COST_UTILITY_USD=${rateCard.rates.utility}
WHATSAPP_COST_AUTH_USD=${rateCard.rates.authentication}
WHATSAPP_COST_SERVICE_USD=${rateCard.rates.service}

WHATSAPP_USD_TO_INR=${rateCard.usdToInr}`}
            </pre>
            <p className="text-[10px] text-slate-400 font-medium mt-3">Restart the backend server after changing these values.</p>
          </div>
        </>
      ) : (
        <div className="py-16 text-center bg-white border border-slate-100 rounded-2xl">
          <Activity size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-bold">Could not load rate card — backend may be offline</p>
        </div>
      )}
    </div>
  );
}
