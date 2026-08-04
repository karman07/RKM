'use client';

import { CheckCircle2 } from 'lucide-react';
import type { RedemptionPreview, RedemptionType } from '@/lib/api';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

interface Props {
  preview: RedemptionPreview | null;
  loading: boolean;
  error: string;
  choice: RedemptionType | null;
  onChoose: (type: RedemptionType) => void;
}

/**
 * Side-by-side Cash Benefit vs Gold Conversion comparison — the customer picks exactly
 * one option before the sale is finalized. Numbers come straight from the backend's
 * /redeem/preview quote so they always match what redeemFromSubscription will actually save.
 * Choosing Gold Conversion forgoes interest — only the principal paid so far converts to grams.
 */
export default function RedemptionComparisonPanel({ preview, loading, error, choice, onChoose }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-600 font-bold py-3">
        <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
        Computing redemption options…
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-red-600 font-bold py-2">{error}</p>;
  }
  if (!preview) return null;

  const { cashBenefitOption, goldConversionOption } = preview;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Choose Redemption Option</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Option 1 — Cash Benefit */}
        <button type="button" onClick={() => onChoose('cash_benefit')}
          className={`text-left rounded-xl border-2 p-4 transition-all ${choice === 'cash_benefit' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-900">Cash Benefit</p>
            {choice === 'cash_benefit' && <CheckCircle2 size={14} className="text-amber-600" />}
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-slate-400">Investment Amount Used</span><span className="font-bold">₹{fmt(cashBenefitOption.investmentAmountUsed)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Cash Benefit</span><span className="font-bold text-amber-700">− ₹{fmt(cashBenefitOption.cashBenefitAmount || 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Remaining Amount</span><span className="font-bold">₹{fmt(cashBenefitOption.remainingAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">GST</span><span className="font-bold">+ ₹{fmt(cashBenefitOption.gstAmount)}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-100"><span className="font-black text-slate-900">Final Payable</span><span className="font-black text-slate-900">₹{fmt(cashBenefitOption.finalPayableAmount)}</span></div>
          </div>
        </button>

        {/* Option 2 — Gold Conversion */}
        <button type="button" onClick={() => onChoose('gold_conversion')}
          className={`text-left rounded-xl border-2 p-4 transition-all ${choice === 'gold_conversion' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-900">Gold Conversion</p>
            {choice === 'gold_conversion' && <CheckCircle2 size={14} className="text-amber-600" />}
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-slate-400">Principal Remaining</span><span className="font-bold">₹{fmt(goldConversionOption.principalRemaining || 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Gold Owned (at live rate)</span><span className="font-bold">{(goldConversionOption.ownedGrams || 0).toFixed(2)}g</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Matched Gold</span><span className="font-bold">{(goldConversionOption.matchedGrams || 0).toFixed(2)}g of {(goldConversionOption.productGoldWeightGrams || 0).toFixed(2)}g</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Gold Value Waived</span><span className="font-bold text-amber-700">− ₹{fmt(goldConversionOption.waivedGoldCost || 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Making Charges Waived</span><span className="font-bold text-amber-700">− ₹{fmt(goldConversionOption.waivedMakingCharges || 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Shortfall Gold (paid in full)</span><span className="font-bold">{(goldConversionOption.shortfallGrams || 0).toFixed(2)}g</span></div>
            <div className="flex justify-between"><span className="text-slate-400">GST (on full pre-waiver value)</span><span className="font-bold">+ ₹{fmt(goldConversionOption.gstAmount)}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-100"><span className="font-black text-slate-900">Final Payable</span><span className="font-black text-slate-900">₹{fmt(goldConversionOption.finalPayableAmount)}</span></div>
          </div>
        </button>
      </div>
      {!choice && <p className="text-[10px] text-red-500 font-bold">Select one redemption option to continue.</p>}
    </div>
  );
}
