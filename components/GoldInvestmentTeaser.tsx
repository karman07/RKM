import React from 'react';
import Link from 'next/link';
import { Gem, TrendingUp, ShieldCheck } from 'lucide-react';
import { THEME } from '../app/constants';

export default function GoldInvestmentTeaser() {
  return (
    <section className="py-32 px-6 lg:px-12 bg-[#FDFCFB] relative overflow-hidden border-t border-[#F2EEE8]">
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-[600px] h-[600px] rounded-full bg-emerald-100/20 blur-3xl opacity-60 z-0"></div>
      
      <div className="max-w-[1440px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        <div className="space-y-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#064E3B]/5 border border-[#064E3B]/10 rounded-full text-[11px] font-black uppercase tracking-[2px] text-[#064E3B]">
            <Gem size={14} className="animate-pulse" /> The RKM Promise
          </div>
          
          <h2 className="text-4xl md:text-6xl font-serif font-black text-slate-900 leading-tight">
            Systematic Gold <br/>
            <span className="text-[#064E3B] italic font-light">Investment Plan</span>
          </h2>
          
          <p className="text-slate-500 font-medium md:text-lg leading-relaxed max-w-xl">
            Secure your future by building wealth month by month. Accumulate value with guaranteed monthly interest and redeem it for exquisite RKM jewellery with exclusive maturity discounts.
          </p>

          <div className="grid grid-cols-2 gap-8 pt-4">
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#064E3B]">
                <TrendingUp size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm mt-2">Assured Returns</h4>
              <p className="text-xs text-slate-500 max-w-[200px]">Principal earns fixed monthly interest.</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#064E3B]">
                <ShieldCheck size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm mt-2">Zero Friction</h4>
              <p className="text-xs text-slate-500 max-w-[200px]">100% automated monthly Autopay.</p>
            </div>
          </div>

          <div className="pt-8">
            <Link 
              href="/gold-investment" 
              className="inline-flex items-center gap-3 px-8 py-4 bg-[#064E3B] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
            >
              Explore Plans <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        </div>

        <div className="relative h-[600px] w-full rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100 group">
          <div className="absolute inset-0 bg-[#064E3B]/10 z-10 transition-colors duration-500 group-hover:bg-transparent"></div>
          <img 
            src="https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=2670&auto=format&fit=crop" 
            alt="Gold Investment" 
            className="w-full h-full object-cover transform transition-transform duration-1000 scale-100 group-hover:scale-105"
          />
        </div>
      </div>
    </section>
  );
}
