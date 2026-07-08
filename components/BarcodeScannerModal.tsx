'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const QR_CONFIG = { fps: 10, qrbox: { width: 250, height: 100 } };

export default function BarcodeScannerModal({ onScan, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);
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
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const scanner = new Html5Qrcode('reader');
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
          <h2 className="text-lg font-black text-slate-900">Scan Barcode</h2>
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
            #reader { border: none !important; }
            #reader__scan_region {
              border-radius: 16px !important;
              overflow: hidden !important;
            }
            #reader__scan_region video {
              border-radius: 16px !important;
            }
          `}} />
          <div id="reader" className="w-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"></div>
          {error ? (
            <p className="text-center text-xs text-red-500 mt-5 font-bold">{error}</p>
          ) : (
            <p className="text-center text-[10px] text-slate-400 mt-5 font-black uppercase tracking-widest">
              Position barcode inside the camera frame
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
