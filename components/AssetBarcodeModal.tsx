'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { toPng } from 'html-to-image';
import Modal from '@/components/Modal';
import type { InventoryItem } from '@/lib/api';

interface AssetBarcodeModalProps {
  open: boolean;
  mode: 'single' | 'bulk';
  singleItem: InventoryItem | null;
  bulkItems: InventoryItem[];
  onClose: () => void;
}

// Fixed label layout — matches the LP 46 Lite's actual die-cut stock (65 x 13mm). This has to
// match both the physical label and whatever media size is configured in the printer's OS
// driver — a mismatch there is what causes content to print across several physical labels
// instead of one, since the driver has its own fixed page geometry that the browser's @page
// size can't override on its own (see the print button's hint text below). No editor, no
// drag/resize, no item details — just the system-generated barcode, full-bleed on the label.
const LABEL_W_MM = 65;
const LABEL_H_MM = 13;
const PNG_EXPORT_DPI = 600;

/**
 * Renders the barcode onto a canvas via jsbarcode, generated locally rather than fetched as a
 * raster image from an external service. Deliberately canvas, not SVG: jsbarcode's SVG
 * renderer sizes itself using getBBox(), which returns nothing on an element that's ever been
 * under `display:none` (exactly how the print wrapper below hides itself on screen) — the
 * barcode would render but come out with a zero-size viewBox, i.e. invisible. Canvas drawing
 * is plain pixel manipulation via the 2D context; it doesn't depend on layout/visibility at
 * all, so it can't go blank just because the element isn't currently on screen. Drawn at a
 * generously high native pixel size and scaled down with `object-fit: contain`, so it stays
 * crisp — same principle as a high source resolution mattering more than final display size.
 */
function BarcodeCanvas({ text }: { text: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    JsBarcode(canvas, text || ' ', {
      format: 'CODE128',
      displayValue: false,
      margin: 10,
      width: 6,   // module width in native canvas px
      height: 300,
      lineColor: '#000000',
      background: '#ffffff',
    });
  }, [text]);

  return <canvas ref={canvasRef} className="w-full h-full block" style={{ objectFit: 'contain' }} />;
}

/** The label's contents, shared verbatim between the on-screen preview, print output and PNG
    export — only the outer wrapper's size differs between them. */
function LabelContents({ item }: { item: InventoryItem }) {
  return (
    <div className="w-full h-full p-[1mm] box-border bg-white">
      <BarcodeCanvas text={item.barcode} />
    </div>
  );
}

function LabelCard({ item, cardRef }: { item: InventoryItem; cardRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={cardRef}
      className="single-label-card relative"
      style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
    >
      <LabelContents item={item} />
    </div>
  );
}

export default function AssetBarcodeModal({ open, mode, singleItem, bulkItems, onClose }: AssetBarcodeModalProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!open) return null;

  const previewItem = mode === 'single' ? singleItem : bulkItems[0] ?? null;
  const canPrint = mode === 'single' ? !!singleItem : bulkItems.length > 0;

  async function handleDownloadPng() {
    const node = exportRef.current;
    if (!node || !previewItem || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(node, { pixelRatio: PNG_EXPORT_DPI / 96, backgroundColor: '#ffffff', cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `label-${previewItem.barcode}.png`;
      a.click();
    } catch {
      // Swallowed — the button just stops spinning and the admin can retry.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
          /* The print sheet is portaled to be a direct child of <body> (see below) specifically
             so this can be a plain display:none on every OTHER direct child — no visibility or
             height tricks needed. Those were tried first and both failed for real reasons: a
             height:0-then-auto override broke Chrome's print rasterizer (barcodes came out
             blank), and hiding via visibility alone still let elements sized by top/bottom
             insets (e.g. the modal's "fixed inset-0" backdrop) keep their full-viewport box and
             pad out extra blank pages. display:none removes a box from layout outright, so
             neither failure mode applies. */
          body > *:not(.print-labels-sheet) { display: none !important; }
          .print-labels-sheet {
            position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
            display: block !important; background: white !important;
          }
          .single-label-card, .single-label-card * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .single-label-card {
            width: ${LABEL_W_MM}mm !important; height: ${LABEL_H_MM}mm !important; position: relative !important;
            overflow: hidden !important; margin: 0 !important; padding: 0 !important; border: none !important;
            break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid;
          }
          .single-label-card:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <Modal
        open={open}
        onClose={onClose}
        title={mode === 'bulk' ? `Print Labels — ${bulkItems.length} Item${bulkItems.length !== 1 ? 's' : ''}` : 'Asset Barcode View'}
      >
        {!previewItem ? (
          <p className="py-10 text-center text-sm font-bold text-slate-400">No item to preview.</p>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-slate-50/50 rounded-[2rem] border border-slate-100">
            <div
              className="bg-white border border-slate-200 rounded-md shadow-inner overflow-hidden"
              style={{ width: LABEL_W_MM * 6, height: LABEL_H_MM * 6 }}
            >
              <LabelContents item={previewItem} />
            </div>

            {mode === 'bulk' ? (
              <p className="mt-6 text-[11px] font-bold text-slate-500 text-center">
                Previewing <span className="font-black text-slate-900">{previewItem.barcode}</span> — printing will produce one label per selected item ({bulkItems.length} total). Download only saves the item shown above.
              </p>
            ) : (
              <>
                <p className="mt-6 text-2xl font-black text-slate-900 tracking-widest uppercase">{previewItem.barcode}</p>
                <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scan using hardware scanner</p>
              </>
            )}

            <p className="mt-6 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center leading-relaxed">
              First time printing on this printer? Click <span className="font-black">&quot;Print using system dialog…&quot;</span> in the print window (not Chrome&apos;s quick print), then under Paper Size choose <span className="font-black">Manage Custom Sizes…</span> and add an exact {LABEL_W_MM}mm × {LABEL_H_MM}mm size for this printer. Without that, the printer driver may use its own default page length and print one label&apos;s content across several physical labels.
            </p>

            <div className="w-full mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => window.print()}
                disabled={!canPrint}
                className="flex-1 min-w-[140px] py-4 rounded-2xl bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
                {mode === 'bulk' ? `Print ${bulkItems.length} Label${bulkItems.length !== 1 ? 's' : ''}` : 'Print Piece Label'}
              </button>
              <button
                onClick={handleDownloadPng}
                disabled={downloading}
                className="flex-1 min-w-[140px] py-4 rounded-2xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {downloading ? 'Exporting…' : 'Download PNG'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 min-w-[100px] py-4 rounded-2xl bg-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Print wrapper — each item gets its own label, one per page. Kept off-screen via
          position rather than display:none (see BarcodeCanvas above for why); the @media
          print rule repositions it into view only when actually printing. Portaled to a direct
          child of <body> (rather than rendered in place, deep inside the modal/page tree) so
          the print CSS above can hide "every other direct child of body" with a single,
          unambiguous display:none — see the comment on that rule for why. */}
      {createPortal(
        <div className="print-labels-sheet" style={{ position: 'fixed', left: -99999, top: 0 }} aria-hidden="true">
          {mode === 'single' && singleItem ? (
            <LabelCard item={singleItem} />
          ) : (
            bulkItems.map(item => <LabelCard key={item._id} item={item} />)
          )}
        </div>,
        document.body
      )}

      {/* Off-screen clean copy of the previewed label for PNG export — kept in normal layout
          flow (shifted off the visible page, not display:none) since html-to-image needs the
          node to actually be laid out to rasterize it. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        {previewItem && <LabelCard item={previewItem} cardRef={exportRef} />}
      </div>
    </>
  );
}
