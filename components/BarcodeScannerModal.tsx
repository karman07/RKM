'use client';
import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerModal({ onScan, onClose }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        'cashier-reader',
        { fps: 10, qrbox: { width: 260, height: 110 } },
        false
      );
      scanner.render(
        (decodedText) => { scanner.clear(); onScan(decodedText); },
        (_error) => { /* ignore continuous scan failures */ }
      );
      return () => { scanner.clear().catch(() => {}); };
    }, 100);
    return () => clearTimeout(timer);
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A0F1A]/10 flex items-center justify-center">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h2 className="text-lg font-black text-slate-900">Scan Barcode</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <style dangerouslySetInnerHTML={{ __html: `
            #cashier-reader { border: none !important; }
            #cashier-reader__dashboard_section_csr button {
              background: #7A1C2A !important; color: white !important;
              border: none !important; padding: 8px 16px !important;
              border-radius: 12px !important; font-size: 12px !important;
              font-weight: 900 !important; text-transform: uppercase !important;
              letter-spacing: 0.1em !important; cursor: pointer !important;
            }
            #cashier-reader__dashboard_section_swaplink { color: #7A1C2A !important; text-decoration: none !important; font-weight: 800 !important; }
            #cashier-reader__scan_region { border-radius: 16px !important; overflow: hidden !important; }
          ` }} />
          <div id="cashier-reader" className="w-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200" />
          <p className="text-center text-[10px] text-slate-400 mt-5 font-black uppercase tracking-widest">
            Position barcode inside the camera frame
          </p>
        </div>
      </div>
    </div>
  );
}
