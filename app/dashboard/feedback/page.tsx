'use client';

import { useState, useEffect } from 'react';
import { getFeedbacks, Feedback } from '@/lib/api';

export default function FeedbackDashboard() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  // Base Color - Now BLUE
  const baseBlue = '#263A5E';

  useEffect(() => {
    getFeedbacks().then(res => {
      setFeedbacks(res.data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center py-40">
        <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-6 text-[10px] font-black text-slate-300 uppercase tracking-[0.25em]">Loading Registry...</p>
      </div>
    );
  }

  const total = feedbacks.length;
  const conversions = feedbacks.filter(f => f.type === 'conversion');
  const nonConversions = feedbacks.filter(f => f.type === 'non-conversion');
  
  const onlineCount = feedbacks.filter(f => f.channel === 'online').length;
  const storeCount = total - onlineCount;
  
  const conversionRate = total > 0 ? Math.round((conversions.length / total) * 100) : 0;
  const wowCount = conversions.filter(f => f.overallExperience === 'Wow' || f.overallExperience === 'Good').length;
  const wowScore = conversions.length > 0 ? Math.round((wowCount / conversions.length) * 100) : 0;

  const reasonCounts: Record<string, number> = {};
  nonConversions.forEach(f => {
    const r = f.notPurchaseReason === 'Other' ? (f.notPurchaseReasonOther || 'Other') : (f.notPurchaseReason || 'Unknown');
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-700 font-sans selection:bg-blue-100">
      
      {/* ── Header ── */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold text-slate-900 mb-2 tracking-tight">Customer Feedbacks</h1>
          <div className="flex items-center gap-3">
             <div className="h-0.5 w-10 bg-blue-600"></div>
             <p className="text-[10px] font-black tracking-[0.3em] uppercase text-blue-600">
               Multi-Channel Acquisition Intelligence
             </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="px-6 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-sm transition-all hover:border-slate-200">
            STORE: {storeCount}
          </div>
          <div className="px-6 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-600 shadow-sm transition-all hover:border-blue-200">
            ONLINE: {onlineCount}
          </div>
        </div>
      </div>

      {/* ── KPI Grid - Transparent Glass Style ── */}
      {total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Total Registries', value: total, color: '#0F172A' },
            { label: 'Conversion Rate', value: `${conversionRate}%`, color: '#263A5E' },
            { label: 'Experience Score', value: `${wowScore}%`, color: '#263A5E' },
            { label: 'Top Logic Gap', value: topReason, color: '#64748B', isText: true },
          ].map((kpi, idx) => (
            <div key={idx} className="bg-white/40 backdrop-blur-sm border border-slate-100 p-6 rounded-[2rem] transition-all hover:shadow-xl hover:border-slate-200">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mb-2">{kpi.label}</p>
              <p className="text-3xl font-serif font-bold truncate" style={{ color: kpi.color }}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {feedbacks.length === 0 ? (
        <div className="text-center py-40 bg-white/20 border border-dashed border-slate-200 rounded-[3rem]">
          <h2 className="text-lg font-bold text-slate-200 uppercase tracking-widest font-serif">Registry Empty</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {feedbacks.map(fb => (
            <div key={fb._id} className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-between hover:shadow-2xl transition-all duration-500 group hover:border-blue-100">
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${fb.type === 'conversion' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
                      {fb.type === 'conversion' ? 'Purchased' : 'Non-Purchase'}
                    </span>
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${fb.channel === 'online' ? 'border-blue-200 text-blue-600 bg-blue-50/30' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>
                      {fb.channel === 'online' ? 'Web' : 'Store'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-300">
                    {new Date(fb.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-serif font-bold text-slate-900 mb-1">
                    {fb.title}. {fb.name || 'Anonymous'}
                  </h3>
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                    <span>{fb.mobile}</span>
                    <span className="w-1 h-1 rounded-full bg-blue-600"></span>
                    <span className="truncate max-w-[150px]">{fb.email}</span>
                  </div>
                </div>

                {/* Response Matrix */}
                <div className="grid grid-cols-1 gap-4">
                  
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <div className="bg-slate-50/40 p-3 rounded-2xl border border-slate-100">
                      <p className="text-[8px] opacity-40 mb-1">Gender / DOB</p>
                      {fb.gender} {fb.dob && `• ${fb.dob}`}
                    </div>
                    <div className="bg-slate-50/40 p-3 rounded-2xl border border-slate-100">
                      <p className="text-[8px] opacity-40 mb-1">Origin</p>
                      <span className="truncate block">{fb.country || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50/50 rounded-3xl p-5 border border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-4">Registry Particulars</p>
                    
                    {fb.type === 'conversion' ? (
                      <div className="space-y-3">
                        {[
                          { l: 'Overall Exp', v: fb.overallExperience },
                          { l: 'Staff Help', v: fb.staffHelpfulness },
                          { l: 'Visit Again', v: fb.visitAgain },
                          { l: 'Recommend', v: fb.recommend }
                        ].map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-bold">{item.l}:</span>
                            <strong className="text-slate-900">{item.v || '-'}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-start text-xs gap-4">
                          <span className="text-slate-400 font-bold">Reason:</span>
                          <strong className="text-slate-900 text-right">{fb.notPurchaseReason === 'Other' ? fb.notPurchaseReasonOther : fb.notPurchaseReason || '-'}</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs gap-4">
                          <span className="text-slate-400 font-bold">Category:</span>
                          <strong className="text-slate-900 text-right truncate">{fb.categoryLookingFor}</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs gap-4">
                          <span className="text-slate-400 font-bold">Material:</span>
                          <strong className="text-slate-900 text-right truncate">{fb.typeLookingFor}</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs gap-4">
                          <span className="text-slate-400 font-bold">Price Band:</span>
                          <strong className="text-slate-900 text-right">{fb.priceBand || '-'}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  {fb.address && (
                    <div className="text-[10px] text-slate-400 font-bold leading-relaxed px-2 border-l-2 border-blue-600/20">
                      <p className="uppercase tracking-widest text-[8px] mb-1 opacity-60">Full Postal Identity</p>
                      {fb.address}, {fb.district}, {fb.state}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Meta */}
              <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between items-center">
                 <div className="text-[9px] font-black uppercase tracking-tighter text-slate-200">
                    Protocol Verified Response
                 </div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                    {fb.channel === 'online' ? (
                       <span className="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">WEB_SYS</span>
                    ) : (
                       <span className="bg-slate-50 px-3 py-1 rounded-lg">STORE_{fb.storeCode}</span>
                    )}
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
