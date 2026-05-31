import React from 'react';
import { InventoryItem, staticUrl } from '../lib/api';

interface ViewItemModalProps {
  item: InventoryItem;
  onClose: () => void;
}

export default function ViewItemModal({ item, onClose }: ViewItemModalProps) {
  const product = typeof item.product_id === 'object' ? item.product_id : ({} as any);
  const img = staticUrl(product?.images?.[0]);

  const fmt = (n: number | undefined | null) => (n || 0).toLocaleString('en-IN');
  const fmtAmt = (n: number | undefined | null) => {
    const v = Math.abs(n || 0);
    return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'sold': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'reserved': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'damaged': return 'bg-red-50 text-red-700 border-red-200';
      case 'returned': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'stolen': return 'bg-stone-50 text-stone-700 border-stone-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_200ms_ease-out]">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col md:flex-row relative">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 bg-white/50 hover:bg-white backdrop-blur-md rounded-full flex items-center justify-center shadow-sm text-slate-600 transition-all"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* Left: Image & Barcode */}
        <div className="md:w-2/5 bg-slate-50 p-8 flex flex-col items-center justify-center border-r border-slate-100">
          <div className="w-full aspect-square rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden mb-6 flex items-center justify-center p-2 relative">
            {img ? (
              <img src={img} alt={product?.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <svg width="48" height="48" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            )}
            <span className={`absolute top-4 right-4 px-3 py-1 text-[10px] font-black uppercase tracking-widest border rounded-full shadow-sm backdrop-blur-md ${getStatusColor(item.status)}`}>
              {item.status}
            </span>
          </div>

          <div className="w-full bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
            {item.barcode_url ? (
              <img src={item.barcode_url} alt={item.barcode} className="h-16 mx-auto mb-2 mix-blend-multiply" />
            ) : (
              <div className="h-16 flex items-center justify-center mb-2">
                <svg width="40" height="40" className="text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4h4v16H4V4zm6 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h3v16h-3V4z" /></svg>
              </div>
            )}
            <code className="text-sm font-black text-slate-800 tracking-[0.2em]">{item.barcode}</code>
          </div>
        </div>

        {/* Right: Details */}
        <div className="md:w-3/5 p-8 flex flex-col">
          <div className="mb-6">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">{product?.name ?? 'Unknown Item'}</h2>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-lg">ID: {item.unique_item_code}</span>
              {product?.sku && <span className="px-3 py-1 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-lg">SKU: {product.sku}</span>}
              <span className="px-3 py-1 bg-[#7A1C2A]/10 text-[#7A1C2A] text-[10px] font-black uppercase tracking-widest rounded-lg">{product?.metal_type || 'Gold'} {product?.purity || ''}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Gross Weight</span>
                <span className="text-lg font-black text-slate-800">{product?.gross_weight || '—'} <span className="text-xs text-slate-400">g</span></span>
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 3v18m0-18l-3 3m3-3l3 3" /></svg>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Net Weight</span>
                <span className="text-lg font-black text-slate-800">{product?.net_weight || '—'} <span className="text-xs text-slate-400">g</span></span>
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Stone Weight</span>
                <span className="text-lg font-black text-slate-800">{product?.stone_weight || '0'} <span className="text-xs text-slate-400">g</span></span>
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-1">Current Selling Price</span>
              {item.pricing_breakdown && (item.pricing_breakdown.discount_amount > 0 || item.manager_discount > 0) ? (
                <div className="space-y-1">
                  <span className="text-sm line-through text-slate-400 block">
                    ₹{fmt(item.pricing_breakdown.final_price + item.pricing_breakdown.discount_amount)}
                  </span>
                  {item.pricing_breakdown.discount_amount > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-black text-amber-600">
                      <span className="flex items-center gap-1"><span>⚡</span><span>{item.admin_discount > 0 ? item.admin_discount : (product?.discount_percentage || 0)}% ADMIN OFF</span></span>
                      <span>-₹{fmtAmt(item.pricing_breakdown.discount_amount)}</span>
                    </div>
                  )}
                  {item.manager_discount > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-black text-blue-600">
                      <span className="flex items-center gap-1"><span>🏷</span><span>{item.manager_discount}% MANAGER OFF</span></span>
                      <span>-₹{fmtAmt(item.pricing_breakdown.final_price * item.manager_discount / 100)}</span>
                    </div>
                  )}
                  <span className="text-xl font-black text-emerald-700 block">₹{fmt(item.live_selling_price ?? item.selling_price)}</span>
                </div>
              ) : (
                <span className="text-xl font-black text-emerald-700">₹{fmt(item.live_selling_price ?? item.selling_price)}</span>
              )}
            </div>
          </div>

          {/* Detailed Pricing Breakdown if available */}
          {item.pricing_breakdown && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 mb-6 text-sm">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 border-b border-slate-200 pb-2">Pricing Breakdown</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm"><span className="text-slate-500">Metal Price</span><span className="font-bold text-slate-800">₹{fmt(item.pricing_breakdown.metal_price)}</span></div>
                <div className="flex justify-between items-center text-sm"><span className="text-slate-500">Making Charges</span><span className="font-bold text-slate-800">₹{fmt(item.pricing_breakdown.making_charges)}</span></div>
                <div className="flex justify-between items-center text-sm"><span className="text-slate-500">Stone Price</span><span className="font-bold text-slate-800">₹{fmt(item.pricing_breakdown.stone_price)}</span></div>
                
                {item.pricing_breakdown.discount_amount > 0 && (
                  <div className="flex justify-between items-center text-sm text-[#e11d48]">
                    <span className="font-medium">Admin Discount ({item.admin_discount > 0 ? item.admin_discount : (product?.discount_percentage || 0)}%)</span>
                    <span className="font-bold">-₹{fmt(item.pricing_breakdown.discount_amount)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center text-sm pb-4 border-b border-slate-200"><span className="text-slate-500">Tax Amount</span><span className="font-bold text-slate-800">₹{fmt(item.pricing_breakdown.tax_amount)}</span></div>
                
                <div className="flex justify-between items-center">
                  <span className="font-black tracking-widest uppercase text-slate-900 text-sm">FINAL PRICE</span>
                  <span className="font-black text-blue-600 text-xl">₹{fmt(item.pricing_breakdown.final_price)}</span>
                </div>

                {item.manager_discount > 0 && (
                  <div className="pt-3 mt-3 border-t border-slate-200 border-dashed space-y-2">
                    <div className="flex justify-between text-sm text-emerald-600"><span className="font-medium">Manager Discount</span><span className="font-bold">- {item.manager_discount}%</span></div>
                    <div className="flex justify-between items-center">
                      <span className="font-black tracking-widest uppercase text-emerald-700 text-sm">DISCOUNTED PRICE</span>
                      <span className="font-black text-emerald-700 text-xl">₹{fmt(item.live_selling_price ?? item.selling_price)}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-2"><span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Max Allowable Discount</span><span className="font-bold text-slate-500 text-xs">{item.max_manager_discount}%</span></div>
              </div>
            </div>
          )}

          {/* Meta Info */}
          <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-medium">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {typeof item.branch_id === 'object' ? (item.branch_id as any).name : 'Central Stock'}
            </div>
            {item.sale_reference && (
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Invoice: {item.sale_reference}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
