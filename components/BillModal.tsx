'use client';

import { staticUrl, type InventoryItem } from '@/lib/api';

interface BillModalProps {
  items: InventoryItem[];
  date: string;
  onClose: () => void;
}

const GREEN = '#1A6B3A';

export default function BillModal({ items, date, onClose }: BillModalProps) {
  const subtotal = items.reduce((acc, item) => acc + (item.selling_price || 0), 0);
  const gst = subtotal * 0.03;
  const total = subtotal + gst;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-2 md:p-4 print:p-0 print:bg-white overflow-y-auto">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: auto; margin: 0mm; }
        @media print {
          body { background: white; margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #printable-bill, #printable-bill * { visibility: visible; }
          #printable-bill {
            position: absolute; left: 0; top: 0;
            width: 780px !important; margin: 0; padding: 1.2cm;
            box-shadow: none !important; border: none !important;
          }
          .print-hidden { display: none !important; }
        }
      `}} />

      <div
        id="printable-bill"
        className="bg-white w-full max-w-4xl rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] animate-[fadeRise_400ms_ease-out] print:shadow-none print:rounded-none my-auto font-sans"
      >
        {/* ── Modal Header Controls (hidden on print) ── */}
        <div className="print-hidden px-8 md:px-12 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-[1.5rem] md:rounded-t-[2.5rem]">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Crafting Document...</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[11px] font-bold uppercase tracking-widest transition-all transform active:scale-95 shadow-lg"
              style={{ backgroundColor: GREEN }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              Print Bill
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-full hover:bg-white hover:shadow-md transition-all text-slate-400 hover:text-red-500"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Bill Content ── */}
        <div className="p-8 md:p-14 lg:p-16 print:p-0 relative bg-white rounded-b-[1.5rem] md:rounded-b-[2.5rem]">

          {/* Store Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-2" style={{ color: GREEN }}>
                RKM JEWELLERS
              </h1>
              <p className="text-[10px] md:text-[12px] font-bold text-slate-400 uppercase tracking-[0.6em] mb-4">ARTISAN EXECUTIVE</p>
              <div className="space-y-1 text-[11px] md:text-[12px] font-bold text-slate-500 uppercase tracking-widest">
                <p className="flex items-center gap-2"><span style={{ color: GREEN }}>MOB:</span> +91 88139 47793</p>
                <p className="flex items-center gap-2"><span style={{ color: GREEN }}>WEB:</span> WWW.RKMJEWELLERS.COM</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-2">INVOICE</h2>
              <p className="text-sm md:text-base font-medium text-slate-500">{date}</p>
            </div>
          </div>

          {/* Green Divider */}
          <div className="h-[4px] w-full mb-10" style={{ backgroundColor: GREEN }} />

          {/* Billed To + Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: GREEN }}>BILLED TO</p>
              <h3 className="text-2xl font-serif font-bold text-slate-900">
                {items[0]?.sold_customer_name || 'Valued Client'}
              </h3>
              <div className="space-y-1 text-slate-600 text-[13px] md:text-sm">
                {items[0]?.sold_customer_phone && <p className="font-bold">{items[0].sold_customer_phone}</p>}
                {items[0]?.sold_customer_email && <p>{items[0].sold_customer_email}</p>}
                <p className="text-slate-400 max-w-[300px] leading-relaxed">
                  {items[0]?.shipping_address
                    ? `${items[0].shipping_address}, ${items[0].shipping_city}, ${items[0].shipping_pincode}`
                    : 'Store Collection'}
                </p>
              </div>
            </div>
            <div className="md:text-right space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: GREEN }}>INVOICE DETAILS</p>
              <div className="space-y-2 text-[13px] md:text-sm">
                <p>
                  <span className="text-slate-400">Vault Record: </span>
                  <span className="font-bold text-slate-900">{items[0]?.unique_item_code}</span>
                </p>
                <p>
                  <span className="text-slate-400">Settlement: </span>
                  <span className="font-bold text-slate-900 uppercase">{items[0]?.payment_mode || 'Cash'}</span>
                </p>
                <p>
                  <span className="text-slate-400">Category: </span>
                  <span className="font-bold text-slate-900">{items[0]?.sale_channel || 'Store'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-16">
            <table className="w-full table-fixed">
              <thead>
                <tr
                  className="border-b-[3px] text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{ borderColor: GREEN, color: GREEN }}
                >
                  <th className="py-4 text-left w-[45%]">MASTERPIECE</th>
                  <th className="py-4 text-center w-[25%]">VAULT ID</th>
                  <th className="py-4 text-right w-[30%] pr-2">VALUATION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const imageUrl = item.image_url || product?.images?.[0];
                  return (
                    <tr key={i}>
                      <td className="py-6 pr-4">
                        <div className="flex items-center gap-4">
                          {imageUrl && (
                            <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50">
                              <img
                                src={staticUrl(imageUrl)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div>
                            <p className="text-lg md:text-xl font-serif font-bold text-slate-900 mb-1 leading-tight">
                              {product?.name || 'Handcrafted Masterpiece'}
                            </p>
                            <p className="text-xs text-slate-400 italic">Precious Artisan Jewellery</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-6 text-center text-[12px] font-bold text-slate-500 font-mono overflow-hidden text-ellipsis">
                        {item.unique_item_code}
                      </td>
                      <td className="py-6 text-right text-lg md:text-xl font-serif font-bold text-slate-900 whitespace-nowrap">
                        ₹{(item.selling_price || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex flex-col items-end gap-6 mb-20">
            <div className="w-full md:w-80 space-y-3 border-b border-slate-200 pb-4">
              <div className="flex justify-between text-sm md:text-base">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm md:text-base">
                <span className="text-slate-400">GST (3%)</span>
                <span className="font-bold text-slate-900">₹{Math.round(gst).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-end justify-end gap-6 mb-2">
                <span className="text-sm md:text-lg font-bold text-slate-400 tracking-widest uppercase">TOTAL</span>
                <span className="text-4xl md:text-5xl font-serif font-bold" style={{ color: GREEN }}>
                  ₹{Math.round(total).toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-[10px] md:text-[12px] font-medium text-slate-400 italic">Inclusive of 3% Artisan GST</p>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-10 border-t border-slate-200 text-center">
            <p className="text-[12px] md:text-[14px] font-medium text-slate-400 uppercase tracking-widest mb-3">
              © RKM Suite — Certified Record
            </p>
            <div
              className="flex items-center justify-center gap-4 text-[12px] md:text-[14px] font-bold uppercase tracking-[0.2em]"
              style={{ color: GREEN }}
            >
              <span>Authentic</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
              <span>Integrity</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
              <span>Secure Vault</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
