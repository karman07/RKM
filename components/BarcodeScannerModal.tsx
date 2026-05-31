'use client';
import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerModal({ onScan, onClose }: Props) {
  useEffect(() => {
    // Delay slightly to ensure the #reader element is fully mounted
    const timer = setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 100 } },
        false
      );

      scanner.render(
        (decodedText) => {
          scanner.clear();
          onScan(decodedText);
        },
        (error) => {
          // ignore scan failures, they fire continuously
        }
      );

      // Cleanup
      return () => {
        scanner.clear().catch(e => console.log('Scanner cleanup error:', e));
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_200ms_ease-out]">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">Scan Barcode</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">
          {/* Global styles specifically to override html5-qrcode's ugly default UI */}
          <style dangerouslySetInnerHTML={{__html: `
            #reader { border: none !important; }
            #reader__dashboard_section_csr button {
              background: #7A1C2A !important;
              color: white !important;
              border: none !important;
              padding: 8px 16px !important;
              border-radius: 12px !important;
              font-size: 12px !important;
              font-weight: 900 !important;
              text-transform: uppercase !important;
              letter-spacing: 0.1em !important;
              cursor: pointer !important;
            }
            #reader__dashboard_section_swaplink {
              color: #7A1C2A !important;
              text-decoration: none !important;
              font-weight: 800 !important;
            }
            #reader__scan_region {
              border-radius: 16px !important;
              overflow: hidden !important;
            }
          `}} />
          <div id="reader" className="w-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"></div>
          <p className="text-center text-[10px] text-slate-400 mt-5 font-black uppercase tracking-widest">
            Position barcode inside the camera frame
          </p>
        </div>
      </div>
    </div>
  );
}
