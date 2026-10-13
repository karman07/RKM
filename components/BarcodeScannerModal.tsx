'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
  /** Keep the camera open after each scan so many QR codes can be scanned in one go
      (multi-select / multi-item bills). The modal then shows a running count and a Done button. */
  continuous?: boolean;
}

const QR_CONFIG = { fps: 10, qrbox: { width: 240, height: 240 } };

export default function BarcodeScannerModal({ onScan, onClose, continuous = false }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [scanCount, setScanCount] = useState(0);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (camera: CameraDevice) => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (scanner.isScanning) {
      await scanner.stop().catch(() => {});
    }
    try {
      await scanner.start(
        camera.id,
        QR_CONFIG,
        (decodedText) => {
          if (continuous) {
            // Same code stays in frame for many frames — only count it again after a pause.
            const now = Date.now();
            const last = lastScanRef.current;
            if (last.code === decodedText && now - last.at < 2500) { lastScanRef.current.at = now; return; }
            lastScanRef.current = { code: decodedText, at: now };
            setScanCount((c) => c + 1);
            onScan(decodedText);
            return;
          }
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScan(decodedText);
        },
        () => {
          // ignore continuous scan failures
        }
      );
      setError(null);
    } catch {
      setError('Unable to access this camera');
    }
  }, [onScan, continuous]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const scanner = new Html5Qrcode('admin-reader');
      scannerRef.current = scanner;

      Html5Qrcode.getCameras()
        .then((devices) => {
          if (cancelled || devices.length === 0) return;
          setCameras(devices);
          const backIndex = devices.findIndex((d) => /back|rear|environment/i.test(d.label));
          const initialIndex = backIndex >= 0 ? backIndex : 0;
          setCameraIndex(initialIndex);
          startCamera(devices[initialIndex]);
        })
        .catch(() => setError('Camera permission denied'));
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const scanner = scannerRef.current;
      if (!scanner) return;
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      } else {
        scanner.clear();
      }
    };
  }, [startCamera]);

  const flipCamera = () => {
    if (cameras.length < 2) return;
    const nextIndex = (cameraIndex + 1) % cameras.length;
    setCameraIndex(nextIndex);
    startCamera(cameras[nextIndex]);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_200ms_ease-out]">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">Scan QR Code</h2>
          <div className="flex items-center gap-1">
            {cameras.length > 1 && (
              <button
                onClick={flipCamera}
                title="Switch camera"
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0113.657-4.657M20 15a8 8 0 01-13.657 4.657" />
                </svg>
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-6">
          <style dangerouslySetInnerHTML={{__html: `
            #admin-reader { border: none !important; }
            #admin-reader__scan_region {
              border-radius: 16px !important;
              overflow: hidden !important;
            }
            #admin-reader__scan_region video {
              border-radius: 16px !important;
            }
          `}} />
          <div id="admin-reader" className="w-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"></div>
          {error ? (
            <p className="text-center text-xs text-red-500 mt-5 font-bold">{error}</p>
          ) : (
            <p className="text-center text-[10px] text-slate-400 mt-5 font-black uppercase tracking-widest">
              Position QR code inside the camera frame
            </p>
          )}
          {continuous && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{scanCount} scanned</span>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[#5A0F1A] text-white text-xs font-black uppercase tracking-widest">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
