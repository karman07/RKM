'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import Modal from '@/components/Modal';
import Matrix2D, { build2DMatrix, layout2D, type Code2D } from '@/components/Matrix2D';
import type { InventoryItem, Product } from '@/lib/api';

interface AssetBarcodeModalProps {
  open: boolean;
  mode: 'single' | 'bulk';
  singleItem: InventoryItem | null;
  bulkItems: InventoryItem[];
  onClose: () => void;
}

/*
 * Fold tag label — three partitions, every dimension adjustable.
 *
 *   |<-- zone 1 -->|<-- zone 2 -->|<-- zone 3 -->|
 *   |  code + item |   item       |   blank      |      default 35 | 35 | 30 mm, 15 mm high
 *   |  code (text) |   details    |   (still     |
 *   |              |              |    part of   |
 *   |              |              |    the tag)  |
 *
 * The tag folds at the two zone boundaries. The code is centred in zone 1, the details fill zone 2,
 * zone 3 stays blank. Unprintable edges (what the printer can't reach) are set separately, so the
 * panel shows exactly how much of the tag is total area and how much is printable.
 *
 * All positions are absolute millimetres, so the preview, the print output and the PNG export are
 * the same drawing at different scales. The 2D code is sized in whole printer dots (see Matrix2D).
 */

type FieldKey = 'name' | 'weight' | 'stoneWt' | 'huid' | 'grade' | 'lmc';
type Dpi = 203 | 300 | 600;

interface LabelLayout {
  heightMm: number;
  zone1Mm: number;       // code block
  zone2Mm: number;       // details block
  zone3Mm: number;       // blank block
  edgeXMm: number;       // unprintable margin, left and right edges of the tag
  edgeYMm: number;       // unprintable margin, top and bottom edges of the tag
  creaseMm: number;      // clearance kept on each side of a fold line
  codeType: Code2D;
  codeSizeMm: number;    // 0 = automatic (as large as fits)
  showCodeText: boolean; // item code printed under the code
  fontMm: number;        // 0 = automatic
  fields: FieldKey[];
  printerDpi: Dpi;
  foldMarks: boolean;    // print thin fold lines on the tag
  guides: boolean;       // on-screen guides in the preview (never printed)
}

const RANGE = {
  heightMm: { min: 8, max: 40, step: 0.5 },
  zone1Mm: { min: 10, max: 80, step: 0.5 },
  zone2Mm: { min: 10, max: 80, step: 0.5 },
  zone3Mm: { min: 0, max: 80, step: 0.5 },
  edgeXMm: { min: 0, max: 6, step: 0.1 },
  edgeYMm: { min: 0, max: 6, step: 0.1 },
  creaseMm: { min: 0, max: 4, step: 0.1 },
  codeSizeMm: { min: 4, max: 30, step: 0.5 },
  fontMm: { min: 1, max: 6, step: 0.1 },
} as const;

const FIELD_META: Record<FieldKey, string> = {
  name: 'Name', weight: 'GWT / NWT', stoneWt: 'Stone wt', huid: 'HUID', grade: 'Grade', lmc: 'LMC / DIS',
};
const FIELD_ORDER: FieldKey[] = ['name', 'weight', 'stoneWt', 'huid', 'grade', 'lmc'];

const DEFAULT_LAYOUT: LabelLayout = {
  heightMm: 15, zone1Mm: 35, zone2Mm: 35, zone3Mm: 30,
  edgeXMm: 0, edgeYMm: 0, creaseMm: 0.5,
  codeType: 'datamatrix', codeSizeMm: 0, showCodeText: true,
  fontMm: 0, fields: ['name', 'weight', 'huid', 'grade', 'lmc'],
  printerDpi: 203, foldMarks: false, guides: true,
};
const ROLL_LAYOUT: Partial<LabelLayout> = { heightMm: 13, zone1Mm: 14, zone2Mm: 51, zone3Mm: 0, edgeXMm: 1, edgeYMm: 0.8 };

const STORAGE_KEY = 'rkm-asset-label-layout-v2';
const PNG_EXPORT_DPI = 600;

const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function normalize(p: Partial<LabelLayout>, base: LabelLayout): LabelLayout {
  const m = { ...base, ...p };
  const fields = Array.isArray(m.fields) ? FIELD_ORDER.filter(f => (m.fields as FieldKey[]).includes(f)) : base.fields;
  const size = num(m.codeSizeMm, 0);
  return {
    heightMm: clamp(num(m.heightMm, base.heightMm), RANGE.heightMm),
    zone1Mm: clamp(num(m.zone1Mm, base.zone1Mm), RANGE.zone1Mm),
    zone2Mm: clamp(num(m.zone2Mm, base.zone2Mm), RANGE.zone2Mm),
    zone3Mm: clamp(num(m.zone3Mm, base.zone3Mm), RANGE.zone3Mm),
    edgeXMm: clamp(num(m.edgeXMm, base.edgeXMm), RANGE.edgeXMm),
    edgeYMm: clamp(num(m.edgeYMm, base.edgeYMm), RANGE.edgeYMm),
    creaseMm: clamp(num(m.creaseMm, base.creaseMm), RANGE.creaseMm),
    codeType: m.codeType === 'qrcode' ? 'qrcode' : 'datamatrix',
    codeSizeMm: size <= 0 ? 0 : clamp(size, RANGE.codeSizeMm),
    showCodeText: !!m.showCodeText,
    fontMm: num(m.fontMm, 0) <= 0 ? 0 : clamp(num(m.fontMm, 0), RANGE.fontMm),
    fields,
    printerDpi: ([203, 300, 600] as number[]).includes(Number(m.printerDpi)) ? (Number(m.printerDpi) as Dpi) : base.printerDpi,
    foldMarks: !!m.foldMarks,
    guides: !!m.guides,
  };
}

function loadSavedLayout(): LabelLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw), DEFAULT_LAYOUT) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT; // unreadable or unavailable storage
  }
}

const totalW = (l: LabelLayout) => round1(l.zone1Mm + l.zone2Mm + l.zone3Mm);

/** Total vs printable area, in mm. Printable = the tag minus the unprintable edges; content = the part
    of it that holds the code and details (zones 1 + 2); blank = the part of zone 3 inside the printable area. */
function areas(l: LabelLayout) {
  const W = totalW(l), H = l.heightMm;
  const pw = Math.max(0, W - 2 * l.edgeXMm), ph = Math.max(0, H - 2 * l.edgeYMm);
  const contentW = Math.max(0, Math.min(l.zone1Mm + l.zone2Mm, W - l.edgeXMm) - l.edgeXMm);
  const blankW = Math.max(0, pw - contentW);
  const total = W * H, printable = pw * ph;
  return { W, H, pw, ph, total, printable, content: contentW * ph, blank: blankW * ph, unprintable: total - printable };
}

/** Geometry of everything drawn on the tag, in label coordinates (mm). */
function geometry(item: InventoryItem, l: LabelLayout) {
  const H = l.heightMm, ph = H - 2 * l.edgeYMm;

  // zone 1: code centred in the block, item code underneath
  const z1x0 = l.edgeXMm, z1x1 = l.zone1Mm;
  const cx = (z1x0 + z1x1) / 2;
  const codeLen = Math.max(8, (item.barcode || '').length);
  const codeFont = l.showCodeText
    ? Math.min(Math.max(1.2, Math.min((z1x1 - z1x0 - l.creaseMm) / (codeLen * 0.6), ph * 0.17)), 3.2)
    : 0;
  const textH = l.showCodeText ? codeFont * 1.3 : 0;
  const gap = l.showCodeText ? 0.3 : 0;
  const availH = Math.max(1, ph - textH - gap);
  const availW = Math.max(1, 2 * Math.min(cx - z1x0, z1x1 - l.creaseMm - cx));
  const fitSize = Math.min(availH, availW);
  const box = l.codeSizeMm > 0 ? Math.min(l.codeSizeMm, fitSize) : fitSize;
  const codeBox = { x: cx - box / 2, y: l.edgeYMm + (availH - box) / 2, w: box, h: box };
  const codeText = { x: z1x0, y: l.edgeYMm + availH + gap, w: z1x1 - z1x0, h: textH };

  // zone 2: details, rows share the printable height evenly
  const dx = l.zone1Mm + l.creaseMm;
  const dw = Math.max(1, l.zone2Mm - 2 * l.creaseMm - (l.zone3Mm === 0 ? l.edgeXMm : 0));
  return { H, ph, codeBox, codeText, codeFont, details: { x: dx, y: l.edgeYMm, w: dw, h: ph } };
}

function itemRows(item: InventoryItem, fields: FieldKey[]): [string, string][] {
  const product = typeof item.product_id === 'object' ? (item.product_id as Product) : null;
  const lmc = product?.making_charge_rate ?? product?.fixed_making_charge ?? 0;
  const dis = product?.discount_percentage ?? item.admin_discount ?? 0;
  const g = (n: unknown) => Number(n ?? 0).toFixed(3);
  const all: Record<FieldKey, [string, string]> = {
    name: ['NAME', product?.name || 'RKM Masterpiece'],
    weight: ['GWT/NWT', `${g(product?.gross_weight)}gm/${g(product?.net_weight)}gm`],
    stoneWt: ['ST.WT', `${g(product?.stone_weight)}gm`],
    huid: ['HUID', (item as unknown as { hallmark?: string }).hallmark || '—'],
    grade: ['GRADE', `${product?.purity || '—'}`],
    lmc: ['LMC/DIS', `${lmc}/${dis}`],
  };
  return fields.map(f => all[f]);
}

/** The label drawing. `unit` maps millimetres to a CSS length (px for the preview, mm for print/export). */
function LabelArt({ item, l, unit }: { item: InventoryItem; l: LabelLayout; unit: (mm: number) => string }) {
  const G = geometry(item, l);
  const rows = itemRows(item, l.fields);
  const rowH = rows.length ? G.details.h / rows.length : 0;
  const maxChars = rows.reduce((m, [k, v]) => Math.max(m, k.length + v.length + 1), 1);
  const autoFont = Math.min(rowH * 0.66, G.details.w / (maxChars * 0.7));
  const font = l.fontMm > 0 ? l.fontMm : Math.max(1, Math.min(6, autoFont));
  const W = totalW(l);
  const foldLine = (x: number) => (
    <div key={x} style={{ position: 'absolute', left: unit(x), top: 0, width: unit(0.15), height: unit(l.heightMm), background: '#000' }} />
  );

  return (
    <div style={{ position: 'relative', width: unit(W), height: unit(l.heightMm), background: '#fff', color: '#000', overflow: 'hidden' }}>
      {/* code, centred in zone 1 */}
      <div style={{ position: 'absolute', left: unit(G.codeBox.x), top: unit(G.codeBox.y), width: unit(G.codeBox.w), height: unit(G.codeBox.h) }}>
        <Matrix2D text={item.barcode} type={l.codeType} box={G.codeBox} dpi={l.printerDpi} unit={unit} />
      </div>
      {l.showCodeText && (
        <div style={{
          position: 'absolute', left: unit(G.codeText.x), top: unit(G.codeText.y), width: unit(G.codeText.w), height: unit(G.codeText.h),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: unit(G.codeFont), fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {item.barcode}
        </div>
      )}

      {/* details, zone 2: label left, value right */}
      {rows.map(([k, v], i) => (
        <div key={k} style={{
          position: 'absolute', left: unit(G.details.x), top: unit(G.details.y + i * rowH), width: unit(G.details.w), height: unit(rowH),
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: unit(0.8),
          fontSize: unit(font), fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          <span style={{ flexShrink: 0 }}>{k}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{v}</span>
        </div>
      ))}

      {/* zone 3 is intentionally empty */}
      {l.foldMarks && [l.zone1Mm, l.zone1Mm + l.zone2Mm].filter(x => x > 0 && x < W).map(foldLine)}
    </div>
  );
}

function LabelCard({ item, l, cardRef }: { item: InventoryItem; l: LabelLayout; cardRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={cardRef} className="single-label-card relative" style={{ width: `${totalW(l)}mm`, height: `${l.heightMm}mm` }}>
      <LabelArt item={item} l={l} unit={mm => `${mm}mm`} />
    </div>
  );
}

/**
 * Number box that lets you type freely. It keeps its own text while focused and only pushes a value up when
 * the text is a number inside the allowed range (so the preview updates live); anything else is settled
 * on blur/Enter. A plain controlled number input that clamps on every keystroke makes typing "20" into a
 * field with minimum 8 impossible: the "2" is snapped to 8 and the next "0" turns it into 80.
 */
function NumInput({ value, onCommit, range, ariaLabel }: {
  value: number; onCommit: (v: number) => void; range: { min: number; max: number; step: number }; ariaLabel: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  return (
    <input
      type="number" min={range.min} max={range.max} step={range.step} value={text} aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={e => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n >= range.min && n <= range.max) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(text);
        onCommit(text !== '' && Number.isFinite(n) ? Math.min(range.max, Math.max(range.min, n)) : value);
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-[4.5rem] px-2 py-1.5 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-900 text-right"
    />
  );
}

function Field({ label, value, onChange, range, unit = 'mm', hint }: {
  label: string; value: number; onChange: (v: number) => void; range: { min: number; max: number; step: number }; unit?: string; hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="flex-1 min-w-[8rem] text-[11px] font-bold text-slate-600 leading-tight" title={hint}>{label}</label>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-28 md:w-40 accent-blue-600" aria-label={label} />
      <div className="flex items-center gap-1">
        <NumInput value={value} onCommit={onChange} range={range} ariaLabel={`${label} (${unit})`} />
        <span className="text-[10px] font-bold text-slate-400 w-5">{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="w-full mt-4 bg-white border border-slate-200 rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function AssetBarcodeModal({ open, mode, singleItem, bulkItems, onClose }: AssetBarcodeModalProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Remembered on this computer. Nothing renders until the modal opens, so reading storage here can't mismatch SSR.
  const [layout, setLayout] = useState<LabelLayout>(loadSavedLayout);

  function update(patch: Partial<LabelLayout>) {
    setLayout(prev => {
      const next = normalize(patch, prev);
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  if (!open) return null;

  const previewItem = mode === 'single' ? singleItem : bulkItems[0] ?? null;
  const canPrint = mode === 'single' ? !!singleItem : bulkItems.length > 0;
  const W = totalW(layout), H = layout.heightMm;
  const A = areas(layout);
  const scale = Math.min(9, Math.max(3, 640 / W));          // preview pixels per mm
  const pct = (n: number) => (A.total > 0 ? Math.round((n / A.total) * 1000) / 10 : 0);

  // Code readout (modules, dots per module, printed size) for the item being previewed
  const codeInfo = (() => {
    if (!previewItem) return null;
    const m = build2DMatrix(layout.codeType, previewItem.barcode);
    if (!m) return { error: true as const };
    const G = geometry(previewItem, layout);
    const L = layout2D(m.size, layout.codeType, G.codeBox.w, G.codeBox.h, layout.printerDpi);
    return { error: false as const, modules: m.size, ...L };
  })();

  // Dragging a divider resizes the zone to its left (the right-hand edge resizes the blank zone).
  function startDrag(e: ReactPointerEvent<HTMLDivElement>, key: 'zone1Mm' | 'zone2Mm' | 'zone3Mm') {
    e.preventDefault();
    const startX = e.clientX, startV = layout[key];
    const move = (ev: PointerEvent) => update({ [key]: Math.round((startV + (ev.clientX - startX) / scale) * 2) / 2 });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

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

  const px = (mm: number) => `${mm * scale}px`;
  const zoneEnds = [layout.zone1Mm, layout.zone1Mm + layout.zone2Mm, W];
  const zoneStarts = [0, layout.zone1Mm, layout.zone1Mm + layout.zone2Mm];
  const zoneNames = ['Code', 'Details', 'Blank'];

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: ${W}mm ${H}mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          /* The print sheet is portaled to be a direct child of <body> (see below) so every OTHER direct child
             can simply be display:none. Visibility/height tricks were tried first and both failed for real
             reasons (blank barcodes in Chrome's print rasterizer; fixed inset-0 backdrops padding out extra
             blank pages). display:none removes a box from layout outright, so neither applies. */
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
            width: ${W}mm !important; height: ${H}mm !important; position: relative !important;
            overflow: hidden !important; margin: 0 !important; padding: 0 !important; border: none !important;
            break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid;
          }
          .single-label-card:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <Modal
        open={open}
        onClose={onClose}
        title={mode === 'bulk' ? `Print Labels — ${bulkItems.length} Item${bulkItems.length !== 1 ? 's' : ''}` : 'Asset Label'}
        width="max-w-4xl"
      >
        {!previewItem ? (
          <p className="py-10 text-center text-sm font-bold text-slate-400">No item to preview.</p>
        ) : (
          <div className="flex flex-col items-center justify-center p-5 md:p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100">
            {/* ─── Preview with partitions, guides and drag handles ───────────────────────────── */}
            <div className="w-full overflow-x-auto pb-2">
              <div className="mx-auto relative" style={{ width: W * scale, paddingBottom: 84 }}>
                <div className="relative border border-slate-300 shadow-inner bg-white" style={{ width: W * scale, height: H * scale }}>
                  <LabelArt item={previewItem} l={layout} unit={px} />

                  {layout.guides && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* unprintable edges: four hatched strips */}
                      {(() => {
                        const hatch = { background: 'repeating-linear-gradient(45deg, rgba(239,68,68,.22) 0 3px, transparent 3px 7px)' };
                        return (
                          <>
                            {layout.edgeYMm > 0 && <div className="absolute left-0 right-0 top-0" style={{ ...hatch, height: px(layout.edgeYMm) }} />}
                            {layout.edgeYMm > 0 && <div className="absolute left-0 right-0 bottom-0" style={{ ...hatch, height: px(layout.edgeYMm) }} />}
                            {layout.edgeXMm > 0 && <div className="absolute left-0 top-0 bottom-0" style={{ ...hatch, width: px(layout.edgeXMm) }} />}
                            {layout.edgeXMm > 0 && <div className="absolute right-0 top-0 bottom-0" style={{ ...hatch, width: px(layout.edgeXMm) }} />}
                          </>
                        );
                      })()}
                      {/* printable rectangle */}
                      <div className="absolute border border-dashed border-blue-500" style={{ left: px(layout.edgeXMm), top: px(layout.edgeYMm), width: px(A.pw), height: px(A.ph) }} />
                      {/* blank zone shading */}
                      {layout.zone3Mm > 0 && (
                        <div className="absolute inset-y-0 flex items-start justify-center" style={{
                          left: px(layout.zone1Mm + layout.zone2Mm), width: px(layout.zone3Mm),
                          background: 'repeating-linear-gradient(135deg, rgba(100,116,139,.08) 0 4px, transparent 4px 9px)',
                        }}>
                          <span className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Blank</span>
                        </div>
                      )}
                      {/* fold lines */}
                      {[layout.zone1Mm, layout.zone1Mm + layout.zone2Mm].filter(x => x > 0 && x < W).map(x => (
                        <div key={x} className="absolute inset-y-0 border-l-2 border-dashed border-red-400/80" style={{ left: px(x) }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* drag handles (outside the label box so nothing clips them) */}
                {([['zone1Mm', zoneEnds[0]], ['zone2Mm', zoneEnds[1]], ['zone3Mm', zoneEnds[2]]] as const)
                  .map(([key, x]) => (
                    <div key={key}
                      onPointerDown={e => startDrag(e, key)}
                      title="Drag to resize"
                      className="absolute touch-none flex items-center justify-center cursor-ew-resize"
                      style={{ left: x * scale - 10, top: H * scale + 2, width: 20, height: 22 }}>
                      <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[9px] font-black leading-none select-none">
                        &harr;
                      </div>
                    </div>
                  ))}

                {/* dimension lines */}
                {zoneNames.map((name, i) => {
                  const w = round1(zoneEnds[i] - zoneStarts[i]);
                  return (
                    <div key={name} className="absolute text-center" style={{ left: zoneStarts[i] * scale + 3, width: Math.max(0, w * scale - 6), top: H * scale + 32 }}>
                      <div className="border-t border-slate-400 relative h-0">
                        <span className="absolute -left-px -top-[3px] w-px h-[7px] bg-slate-400" />
                        <span className="absolute -right-px -top-[3px] w-px h-[7px] bg-slate-400" />
                      </div>
                      <span className="text-[10px] font-black text-slate-500 leading-none">{w} mm</span>
                      <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-300 leading-tight">{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 text-center mb-1">
              Drag the blue handles to resize a partition. <span className="text-red-400">Red dashed</span> = fold · <span className="text-blue-500">blue dashed</span> = printable area · hatched red = unprintable edge. Guides are not printed.
            </p>

            {/* ─── Total vs printable area ───────────────────────────────────────────────────── */}
            <Section title="Total vs printable area" right={<p className="text-[11px] font-black text-slate-900">Tag {W} × {H} mm</p>}>
              <div className="flex h-4 w-full rounded-full overflow-hidden border border-slate-200 bg-slate-100">
                <div className="h-full" style={{ width: `${pct(A.unprintable)}%`, background: 'repeating-linear-gradient(45deg,#fca5a5 0 3px,#fee2e2 3px 6px)' }} title="Unprintable edges" />
                <div className="h-full bg-blue-500" style={{ width: `${pct(A.content)}%` }} title="Code + details" />
                <div className="h-full bg-slate-200" style={{ width: `${pct(A.blank)}%` }} title="Blank zone" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[11px]">
                <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total area</p><p className="font-black text-slate-900">{round1(A.W)} × {round1(A.H)} mm</p><p className="font-bold text-slate-500">{Math.round(A.total).toLocaleString('en-IN')} mm² · 100%</p></div>
                <div className="rounded-xl bg-blue-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-blue-500">Printable area</p><p className="font-black text-slate-900">{round1(A.pw)} × {round1(A.ph)} mm</p><p className="font-bold text-slate-500">{Math.round(A.printable).toLocaleString('en-IN')} mm² · {pct(A.printable)}%</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Code + details</p><p className="font-black text-slate-900">{round1(Math.min(layout.zone1Mm + layout.zone2Mm, W))} mm wide</p><p className="font-bold text-slate-500">{Math.round(A.content).toLocaleString('en-IN')} mm² · {pct(A.content)}%</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Blank / unprintable</p><p className="font-black text-slate-900">{round1(layout.zone3Mm)} mm blank</p><p className="font-bold text-slate-500">{Math.round(A.blank).toLocaleString('en-IN')} + {Math.round(A.unprintable).toLocaleString('en-IN')} mm²</p></div>
              </div>
            </Section>

            {/* ─── Size & partitions ───────────────────────────────────────────────────────── */}
            <Section
              title="Size & partitions"
              right={
                <div className="flex gap-2">
                  <button type="button" onClick={() => update({ ...DEFAULT_LAYOUT, fields: DEFAULT_LAYOUT.fields })}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-100">Fold tag 100×15</button>
                  <button type="button" onClick={() => update({ ...DEFAULT_LAYOUT, ...ROLL_LAYOUT, fields: DEFAULT_LAYOUT.fields })}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200">Roll 65×13</button>
                </div>
              }
            >
              <Field label="Tag height" value={layout.heightMm} range={RANGE.heightMm} onChange={v => update({ heightMm: v })} />
              <Field label="Zone 1 width — code" value={layout.zone1Mm} range={RANGE.zone1Mm} onChange={v => update({ zone1Mm: v })} />
              <Field label="Zone 2 width — details" value={layout.zone2Mm} range={RANGE.zone2Mm} onChange={v => update({ zone2Mm: v })} />
              <Field label="Zone 3 width — blank" value={layout.zone3Mm} range={RANGE.zone3Mm} onChange={v => update({ zone3Mm: v })} />
              <p className="text-[10px] font-bold text-slate-400 leading-snug">
                Total width = {layout.zone1Mm} + {layout.zone2Mm} + {layout.zone3Mm} = <span className="text-slate-700">{W} mm</span>. The tag folds at {layout.zone1Mm} mm{layout.zone3Mm > 0 ? ` and ${round1(layout.zone1Mm + layout.zone2Mm)} mm` : ''}.
              </p>
            </Section>

            <Section title="Margins">
              <Field label="Unprintable edge — left / right" value={layout.edgeXMm} range={RANGE.edgeXMm} onChange={v => update({ edgeXMm: v })} hint="The strip at the left and right edges that the printer can't reach, or that you want to keep empty." />
              <Field label="Unprintable edge — top / bottom" value={layout.edgeYMm} range={RANGE.edgeYMm} onChange={v => update({ edgeYMm: v })} />
              <Field label="Clearance beside each fold" value={layout.creaseMm} range={RANGE.creaseMm} onChange={v => update({ creaseMm: v })} hint="Keeps the details text away from the crease." />
            </Section>

            {/* ─── Code ───────────────────────────────────────────────────────────────────── */}
            <Section title="Code">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="text-[11px] font-bold text-slate-600">Type</label>
                <select value={layout.codeType} onChange={e => update({ codeType: e.target.value as Code2D })}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700">
                  <option value="datamatrix">Data Matrix</option>
                  <option value="qrcode">QR code</option>
                </select>
                <label className="text-[11px] font-bold text-slate-600 ml-2">Printer</label>
                <select value={layout.printerDpi} onChange={e => update({ printerDpi: Number(e.target.value) as Dpi })}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700"
                  title="Resolution of your label printer. The code is sized in whole printer dots so it prints crisp and scans.">
                  <option value={203}>203 dpi</option>
                  <option value={300}>300 dpi</option>
                  <option value={600}>600 dpi</option>
                </select>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 ml-2 cursor-pointer select-none">
                  <input type="checkbox" checked={layout.showCodeText} onChange={e => update({ showCodeText: e.target.checked })} className="accent-blue-600" />
                  Show item code under it
                </label>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 min-w-[8rem] cursor-pointer select-none">
                  <input type="checkbox" checked={layout.codeSizeMm === 0} onChange={e => update({ codeSizeMm: e.target.checked ? 0 : round1(codeInfo && !codeInfo.error ? codeInfo.sizeMm : 10) })} className="accent-blue-600" />
                  Code size: automatic
                </label>
                {layout.codeSizeMm > 0 && (
                  <>
                    <input type="range" min={RANGE.codeSizeMm.min} max={RANGE.codeSizeMm.max} step={RANGE.codeSizeMm.step} value={layout.codeSizeMm}
                      onChange={e => update({ codeSizeMm: Number(e.target.value) })} className="w-28 md:w-40 accent-blue-600" aria-label="Code size" />
                    <NumInput value={layout.codeSizeMm} onCommit={v => update({ codeSizeMm: v })} range={RANGE.codeSizeMm} ariaLabel="Code size (mm)" />
                    <span className="text-[10px] font-bold text-slate-400">mm</span>
                  </>
                )}
              </div>
              {codeInfo && (codeInfo.error
                ? <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">This value can&apos;t be encoded as {layout.codeType === 'datamatrix' ? 'a Data Matrix' : 'a QR code'}.</p>
                : (
                  <p className={`text-[10px] font-bold rounded-lg px-3 py-2 leading-snug border ${codeInfo.overflows || codeInfo.tooSmall ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                    {codeInfo.modules}×{codeInfo.modules} modules · each module {codeInfo.k} dot{codeInfo.k > 1 ? 's' : ''} ({codeInfo.moduleMm.toFixed(2)} mm) at {layout.printerDpi} dpi · prints {codeInfo.sizeMm.toFixed(1)} mm square
                    {codeInfo.overflows && ' — too big for this space; enlarge the zone/height or shorten the code.'}
                    {!codeInfo.overflows && codeInfo.tooSmall && ' — modules this small may not scan; give the code more room.'}
                  </p>
                ))}
            </Section>

            {/* ─── Details ────────────────────────────────────────────────────────────────── */}
            <Section title="Details block">
              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
                {FIELD_ORDER.map(f => (
                  <label key={f} className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" className="accent-blue-600" checked={layout.fields.includes(f)}
                      onChange={e => update({ fields: e.target.checked ? FIELD_ORDER.filter(x => x === f || layout.fields.includes(x)) : layout.fields.filter(x => x !== f) })} />
                    {FIELD_META[f]}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 min-w-[8rem] cursor-pointer select-none">
                  <input type="checkbox" checked={layout.fontMm === 0} onChange={e => update({ fontMm: e.target.checked ? 0 : 2 })} className="accent-blue-600" />
                  Text size: automatic
                </label>
                {layout.fontMm > 0 && (
                  <>
                    <input type="range" min={RANGE.fontMm.min} max={RANGE.fontMm.max} step={RANGE.fontMm.step} value={layout.fontMm}
                      onChange={e => update({ fontMm: Number(e.target.value) })} className="w-28 md:w-40 accent-blue-600" aria-label="Text size" />
                    <NumInput value={layout.fontMm} onCommit={v => update({ fontMm: v })} range={RANGE.fontMm} ariaLabel="Text size (mm)" />
                    <span className="text-[10px] font-bold text-slate-400">mm</span>
                  </>
                )}
              </div>
            </Section>

            <Section title="Options" right={
              <button type="button" onClick={() => update(DEFAULT_LAYOUT)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200">Reset all</button>
            }>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" className="accent-blue-600" checked={layout.foldMarks} onChange={e => update({ foldMarks: e.target.checked })} />
                  Print thin fold lines on the tag
                </label>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" className="accent-blue-600" checked={layout.guides} onChange={e => update({ guides: e.target.checked })} />
                  Show guides in the preview
                </label>
              </div>
            </Section>

            {mode === 'bulk' ? (
              <p className="mt-6 text-[11px] font-bold text-slate-500 text-center">
                Previewing <span className="font-black text-slate-900">{previewItem.barcode}</span> — printing will produce one label per selected item ({bulkItems.length} total). Download only saves the item shown above.
              </p>
            ) : (
              <p className="mt-6 text-2xl font-black text-slate-900 tracking-widest uppercase">{previewItem.barcode}</p>
            )}

            <p className="mt-6 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center leading-relaxed">
              First time printing on this printer? Click <span className="font-black">&quot;Print using system dialog…&quot;</span> in the print window (not Chrome&apos;s quick print), then under Paper Size choose <span className="font-black">Manage Custom Sizes…</span> and add an exact {W}mm × {H}mm size for this printer, with all margins 0. Print at 100% scale. Without that, the printer driver may use its own default page length and print one label&apos;s content across several physical labels. If you change any size above, set the same paper size again.
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

      {/* Print wrapper — each item gets its own label, one per page. Kept off-screen via position rather than
          display:none; the @media print rule repositions it into view only when actually printing. Portaled to
          a direct child of <body> so the print CSS above can hide every other child with one display:none. */}
      {createPortal(
        <div className="print-labels-sheet" style={{ position: 'fixed', left: -99999, top: 0 }} aria-hidden="true">
          {mode === 'single' && singleItem ? (
            <LabelCard item={singleItem} l={layout} />
          ) : (
            bulkItems.map(item => <LabelCard key={item._id} item={item} l={layout} />)
          )}
        </div>,
        document.body
      )}

      {/* Off-screen clean copy of the previewed label for PNG export — kept in normal layout flow (shifted off
          the visible page, not display:none) since html-to-image needs the node to actually be laid out. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        {previewItem && <LabelCard item={previewItem} l={layout} cardRef={exportRef} />}
      </div>
    </>
  );
}
