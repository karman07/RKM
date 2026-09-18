'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getSettings, updateSettings, type InventoryItem, type Product } from '@/lib/api';
import Modal from '@/components/Modal';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import {
  Barcode as BarcodeIcon, ZoomIn, ZoomOut, Magnet, Grid3x3, LayoutGrid, Rows,
  Type as TypeIcon, Plus, Trash2, Eye, EyeOff, RotateCcw, ChevronUp, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, Bold, Layers, StretchHorizontal, Download,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type BuiltinFieldKind = 'name' | 'weight' | 'stoneWt' | 'grade' | 'lmc';
type ElementKind = 'barcode' | BuiltinFieldKind | 'custom';
type BarcodeType = 'code128' | 'qrcode' | 'code39' | 'ean13';
type Align = 'left' | 'center' | 'right';
type SheetMode = 'roll' | 'grid';

interface DesignElement {
  id: string;
  kind: ElementKind;
  visible: boolean;
  x: number; y: number; w: number; h: number; // mm, top-left origin
  bold: boolean;
  align: Align;
  fontMm: number | null; // null = auto-fit to box height
  text: string;          // literal text — only meaningful for kind === 'custom'
  barcodeType: BarcodeType; // only meaningful for kind === 'barcode'
  showValueText: boolean;   // only meaningful for kind === 'barcode' — print the human-readable value under the bars
}

interface LabelPreset { label: string; w: number; h: number; }

interface LabelDesignerModalProps {
  open: boolean;
  mode: 'single' | 'bulk';
  singleItem: InventoryItem | null;
  bulkItems: InventoryItem[];
  onClose: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LABEL_PRESETS: LabelPreset[] = [
  { label: 'Jewellery roll — 65 × 13mm', w: 65, h: 13 },
  { label: 'Wide tag — 50 × 25mm', w: 50, h: 25 },
  { label: 'Small tag — 40 × 20mm', w: 40, h: 20 },
  { label: 'Square tag — 25 × 25mm', w: 25, h: 25 },
  { label: 'Sticker sheet — 63.5 × 38.1mm', w: 63.5, h: 38.1 },
];

const FIELD_META: Record<BuiltinFieldKind, string> = {
  name: 'Name', weight: 'GWT/NWT', stoneWt: 'ST. WT', grade: 'Grade', lmc: 'LMC/DIS',
};

const BARCODE_TYPE_META: Record<BarcodeType, { label: string }> = {
  code128: { label: 'Barcode — Code128' },
  code39:  { label: 'Barcode — Code39' },
  ean13:   { label: 'Barcode — EAN-13' },
  qrcode:  { label: 'QR Code' },
};

/** jsbarcode's own format identifiers for the 1D symbologies we support. */
const JSBARCODE_FORMAT: Record<'code128' | 'code39' | 'ean13', string> = {
  code128: 'CODE128', code39: 'CODE39', ean13: 'EAN13',
};

let uidCounter = 0;
const uid = () => `custom_${Date.now()}_${uidCounter++}`;

const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Pulls the weight/grade/charge fields shown on a printed jewellery tag off the item's product */
function getLabelFields(item: InventoryItem) {
  const product = typeof item.product_id === 'object' ? (item.product_id as Product) : null;
  return {
    name: product?.name || 'RKM Masterpiece',
    gwt: product?.gross_weight ?? 0,
    nwt: product?.net_weight ?? 0,
    stoneWt: product?.stone_weight ?? 0,
    grade: product?.purity || '—',
    lmc: product?.making_charge_rate ?? product?.fixed_making_charge ?? 0,
    dis: product?.discount_percentage ?? item.admin_discount ?? 0,
  };
}

function fieldText(item: InventoryItem, kind: BuiltinFieldKind) {
  const f = getLabelFields(item);
  switch (kind) {
    case 'name':    return f.name;
    case 'weight':  return `GWT/NWT ${f.gwt}/${f.nwt}g`;
    case 'stoneWt': return `ST.WT ${f.stoneWt}g`;
    case 'grade':   return `GRADE ${f.grade}`;
    case 'lmc':     return `LMC/DIS ${f.lmc}/${f.dis}`;
  }
}

/**
 * Roughly how many bar "modules" wide a symbol comes out to for a given value — used only
 * to warn when a shrunk barcode box would print bars too thin for a handheld scanner to
 * resolve. Doesn't need to be exact, just conservative (real output can only be equal or
 * *more* modules than this once quiet zones etc. are counted in).
 */
function estimateModuleCount(type: BarcodeType, text: string) {
  const len = Math.max(1, text.length);
  switch (type) {
    case 'code128': return (len + 2) * 11 + 13; // start + data/checksum symbols (11 mod each) + stop (13 mod)
    case 'code39':  return (len + 2) * 13;      // each char incl. start/stop ≈ 13 modules incl. gap
    case 'ean13':   return 95;                  // fixed-width symbology
    case 'qrcode':  return 0;                   // 2D — module-width heuristic doesn't apply
  }
}

/** Widely-cited practical floor for the narrow-bar (X-dimension) width a handheld laser/CCD
    scanner can resolve reliably; thinner than this and reads start getting unreliable. */
const MIN_SAFE_MODULE_MM = 0.25;

/** Target resolution for the exported PNG — high enough that the barcode stays crisp even
    on a thermal-transfer or laser printer, well above what a browser renders on screen. */
const PNG_EXPORT_DPI = 600;

/**
 * Renders the barcode/QR as native vector markup (SVG) instead of a fetched raster image.
 * A bitmap barcode has to be scaled to fit whatever physical box the label editor produces,
 * and any non-1:1 scale factor blurs or moirés the bars — exactly what makes a printed
 * barcode misread. Vector output side-steps that entirely: the print engine draws crisp
 * bars at native resolution no matter the target size or printer DPI, and it also drops the
 * per-label dependency on an external image service at print time.
 *
 * A few more things matter specifically for a *thermal/label printer* reading back through a
 * handheld scanner, beyond just "not blurry": pure black (not a dark tint) for maximum
 * contrast, `shape-rendering="crispEdges"` so the print rasterizer snaps bar edges to whole
 * pixels instead of anti-aliasing them into inconsistent bar widths, print-color-adjust so
 * the browser never lightens the fill for "ink saving", and a quiet zone that's mostly
 * horizontal (scanners are far more sensitive to left/right quiet zone than vertical margin).
 */
function BarcodeGraphic({ text, type, showValueText }: { text: string; type: BarcodeType; showValueText: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [qrSvg, setQrSvg] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (type === 'qrcode') return;
    const svg = svgRef.current;
    if (!svg) return;
    // Start from a completely clean node every render: a leftover viewBox/width/height from
    // a previous render (e.g. a shorter value, or the box being resized) can otherwise pin
    // the SVG's visible viewport to the *old* size, clipping the newly-drawn bars — an SVG
    // crops anything outside its viewBox by default, it doesn't rescale it.
    svg.removeAttribute('viewBox');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // jsbarcode's `valid` callback is how it reports bad input (e.g. non-numeric EAN-13)
    // without throwing, so the render call itself never needs a try/catch here.
    JsBarcode(svg, text || ' ', {
      format: JSBARCODE_FORMAT[type],
      displayValue: showValueText,
      marginTop: 2,
      marginBottom: 2,
      marginLeft: 8,
      marginRight: 8,
      height: 100,
      fontSize: 26,
      textMargin: 4,
      lineColor: '#000000',
      background: '#ffffff',
      valid: ok => setInvalid(!ok),
    });

    // jsbarcode sizes the <svg> in absolute px; swap that for a viewBox so our CSS
    // width/height (driven by the label's physical mm size) scales it cleanly instead
    // of leaving it pinned to its native pixel size. `meet` then letterboxes it into
    // whatever shape the box is — the barcode is always shown in full, never cropped or
    // stretched, even when its natural long-and-thin proportions don't match the box.
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Snap bar edges to hard pixels at print time instead of anti-aliasing them — soft edges
    // on a thermal printout dither into uneven bar widths, which is what actually breaks scans.
    svg.setAttribute('shape-rendering', 'crispEdges');
  }, [text, type, showValueText]);

  useEffect(() => {
    if (type !== 'qrcode') return;
    let cancelled = false;
    QRCode.toString(text || ' ', { type: 'svg', margin: 2, color: { dark: '#000000ff', light: '#ffffffff' } })
      .then(svg => { if (!cancelled) setQrSvg(svg); })
      .catch(() => { if (!cancelled) setQrSvg(''); });
    return () => { cancelled = true; };
  }, [text, type]);

  if (type === 'qrcode') {
    return qrSvg ? (
      <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
    ) : null;
  }

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full block" preserveAspectRatio="xMidYMid meet" />
      {invalid && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50/90 text-[7px] font-bold text-red-500 text-center px-1 leading-tight">
          Not valid {JSBARCODE_FORMAT[type]}
        </div>
      )}
    </div>
  );
}

/** Default layout, scaled proportionally to whatever label stock size is active. */
function defaultElements(w: number, h: number): DesignElement[] {
  const barcode: DesignElement = {
    id: 'barcode', kind: 'barcode', visible: true,
    x: 1, y: 1, w: Math.max(10, w * 0.46), h: Math.max(5, h - 2),
    bold: false, align: 'left', fontMm: null, text: '', barcodeType: 'code128',
    // Off by default for now — the same value is already visible as plain text elsewhere on
    // the label, and the extra text line under the bars was fighting for space with them.
    // Still available per-element via the "Show value text under bars" toggle.
    showValueText: false,
  };
  const fieldKeys: BuiltinFieldKind[] = ['name', 'weight', 'stoneWt', 'grade', 'lmc'];
  const fx = w * 0.508;
  const fw = Math.max(8, w - fx - 1);
  const rowH = Math.max(2, (h - 1) / fieldKeys.length);
  const fields: DesignElement[] = fieldKeys.map((kind, i) => ({
    // Hidden by default for now too — starting with just the barcode on its own makes it
    // far easier to see and fix the barcode's own fit without other text overlapping it.
    // Turn any of these back on from the Layers panel below.
    id: kind, kind, visible: false,
    x: fx, y: 0.5 + i * rowH, w: fw, h: rowH,
    bold: true, align: 'left', fontMm: null, text: '', barcodeType: 'code128', showValueText: true,
  }));
  return [barcode, ...fields];
}

/**
 * Alternative layout: the barcode spans the *entire* usable label width across the top,
 * with every field stacked in its own full-width row underneath. Unlike the side-by-side
 * default, the barcode and the fields never share the same horizontal band, so this can't
 * overlap no matter how the label stock is sized — and it also hands the barcode the most
 * width a label of this size can possibly give it, which is the main lever for the bar-width
 * scan-safety warning below.
 */
function defaultElementsStacked(w: number, h: number): DesignElement[] {
  const margin = 1;
  const barcodeH = clampNum(h * 0.55, 5, h - 3);
  const barcode: DesignElement = {
    id: 'barcode', kind: 'barcode', visible: true,
    x: margin, y: margin, w: Math.max(10, w - margin * 2), h: barcodeH,
    bold: false, align: 'left', fontMm: null, text: '', barcodeType: 'code128', showValueText: false,
  };
  const fieldKeys: BuiltinFieldKind[] = ['name', 'weight', 'stoneWt', 'grade', 'lmc'];
  const fy = margin + barcodeH + 0.5;
  const remainingH = Math.max(fieldKeys.length * 1.5, h - fy - margin);
  const rowH = remainingH / fieldKeys.length;
  const fields: DesignElement[] = fieldKeys.map((kind, i) => ({
    // Hidden by default, same reasoning as the side-by-side layout above.
    id: kind, kind, visible: false,
    x: margin, y: fy + i * rowH, w: Math.max(8, w - margin * 2), h: rowH,
    bold: true, align: 'left', fontMm: null, text: '', barcodeType: 'code128', showValueText: true,
  }));
  return [barcode, ...fields];
}

function elementLabel(el: DesignElement) {
  if (el.kind === 'barcode') return BARCODE_TYPE_META[el.barcodeType].label;
  if (el.kind === 'custom') return el.text || 'Custom text';
  return FIELD_META[el.kind];
}

// ─── Saved template (persists the label design to the account, server-side) ───

/** Whatever stock size + element layout the admin last left the designer in — reused as the
    starting point every time it's opened again, for both single-piece and bulk printing, so
    a fit that took real effort to dial in (barcode size/position, which fields show, etc.)
    doesn't have to be redone before every print run. Saved on `Settings.label_template`,
    the same singleton document metal rates etc. already live on, so it's tied to the
    account rather than one browser — it follows the admin to any device they sign in on. */
interface SavedLabelTemplate { labelW: number; labelH: number; elements: DesignElement[]; }

function isValidTemplate(v: unknown): v is SavedLabelTemplate {
  const t = v as Partial<SavedLabelTemplate> | null | undefined;
  return !!t && typeof t.labelW === 'number' && typeof t.labelH === 'number' && Array.isArray(t.elements);
}

async function fetchSavedTemplate(): Promise<SavedLabelTemplate | null> {
  try {
    const settings = await getSettings();
    return isValidTemplate(settings.label_template) ? settings.label_template : null;
  } catch {
    return null;
  }
}

async function persistTemplate(template: SavedLabelTemplate): Promise<void> {
  try {
    await updateSettings({ label_template: template });
  } catch {
    // Save failed (offline, session expired, no permission, …) — printing still works
    // locally, it just won't be remembered server-side until the next successful save.
  }
}

// ─── Small presentational bits ─────────────────────────────────────────────

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type="number"
        step={0.5}
        value={Math.round(value * 10) / 10}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 text-center outline-none focus:border-blue-400"
      />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LabelDesignerModal({ open, mode, singleItem, bulkItems, onClose }: LabelDesignerModalProps) {
  // Starts from the built-in default and swaps in the admin's saved layout (fetched from
  // their account, below) as soon as it arrives — can't await a network call inside a
  // useState initializer, so the very first paint is briefly the default before that lands.
  const [labelW, setLabelW] = useState(65);
  const [labelH, setLabelH] = useState(13);
  const [elements, setElements] = useState<DesignElement[]>(() => defaultElements(65, 13));
  // Guards the auto-save effect below from firing — with a default value, before we've even
  // checked the account for a saved template — which would otherwise overwrite it.
  const [templateReady, setTemplateReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(7); // px per mm, on-screen editor only
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [exportingPng, setExportingPng] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Bulk print run only — the parent remounts this whole component (via a changing `key`)
  // every time it's opened, so a lazy initializer is all that's needed for a fresh set here.
  const [printIds, setPrintIds] = useState<Set<string>>(() => new Set(bulkItems.map(i => i._id)));
  const [copies, setCopies] = useState(1);
  const [sheetMode, setSheetMode] = useState<SheetMode>('roll');
  const [sheetCols, setSheetCols] = useState(3);
  const [sheetRows, setSheetRows] = useState(7);
  const [sheetGap, setSheetGap] = useState(2);

  // Load the admin's saved layout from their account as soon as the designer opens — this
  // component fully remounts (via a changing `key`) on every open, so a plain mount effect
  // is exactly one fetch per open, no extra gating needed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSavedTemplate().then(t => {
      if (cancelled) return;
      if (t) {
        setLabelW(t.labelW);
        setLabelH(t.labelH);
        setElements(t.elements);
      }
      setTemplateReady(true);
    });
    return () => { cancelled = true; };
  }, [open]);

  // Persist the design (stock size + every element's position/size/visibility/style) to the
  // account so it's there again next time, anywhere the admin signs in — debounced so a drag
  // doesn't hit the API on every pointer-move frame, only once things settle for a moment.
  // Gated on templateReady so this can never fire with the pre-fetch default values and
  // stomp on a real saved template while the initial load is still in flight.
  useEffect(() => {
    if (!templateReady) return;
    const t = setTimeout(() => persistTemplate({ labelW, labelH, elements }), 400);
    return () => clearTimeout(t);
  }, [templateReady, labelW, labelH, elements]);

  // Canva-style keyboard shortcuts for the selected element: arrow-key nudge,
  // delete for custom text, escape to deselect.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (!selectedId) return;
      const el = elements.find(x => x.id === selectedId);
      if (!el) return;
      const step = e.shiftKey ? 2 : 0.5;
      if (e.key === 'ArrowUp')         { e.preventDefault(); updateElement(el.id, { y: clampNum(el.y - step, 0, labelH - el.h) }); }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); updateElement(el.id, { y: clampNum(el.y + step, 0, labelH - el.h) }); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); updateElement(el.id, { x: clampNum(el.x - step, 0, labelW - el.w) }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); updateElement(el.id, { x: clampNum(el.x + step, 0, labelW - el.w) }); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && el.kind === 'custom') {
        setElements(els => els.filter(x => x.id !== el.id));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selectedId, elements, labelW, labelH]);

  function updateElement(id: string, patch: Partial<DesignElement>) {
    setElements(els => els.map(el => (el.id === id ? { ...el, ...patch } : el)));
  }

  function moveLayer(index: number, dir: -1 | 1) {
    setElements(els => {
      const next = [...els];
      const target = index + dir;
      if (target < 0 || target >= next.length) return els;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function snapVal(v: number) {
    return snap ? Math.round(v * 2) / 2 : v;
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    const startX = e.clientX, startY = e.clientY;
    const start = el;
    function onMove(ev: PointerEvent) {
      const dxMm = (ev.clientX - startX) / zoom;
      const dyMm = (ev.clientY - startY) / zoom;
      updateElement(el.id, {
        x: snapVal(clampNum(start.x + dxMm, 0, labelW - start.w)),
        y: snapVal(clampNum(start.y + dyMm, 0, labelH - start.h)),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    const startX = e.clientX, startY = e.clientY;
    const start = el;
    const minW = el.kind === 'barcode' ? 10 : 8;
    const minH = el.kind === 'barcode' ? 5 : 3;
    function onMove(ev: PointerEvent) {
      const dxMm = (ev.clientX - startX) / zoom;
      const dyMm = (ev.clientY - startY) / zoom;
      updateElement(el.id, {
        w: snapVal(clampNum(start.w + dxMm, minW, labelW - start.x)),
        h: snapVal(clampNum(start.h + dyMm, minH, labelH - start.y)),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleWidthChange(raw: number) {
    const v = clampNum(raw || 65, 20, 200);
    setElements(els => els.map(el => ({ ...el, x: Math.min(el.x, Math.max(0, v - el.w)), w: Math.min(el.w, v) })));
    setLabelW(v);
  }

  function handleHeightChange(raw: number) {
    const v = clampNum(raw || 13, 8, 100);
    setElements(els => els.map(el => ({ ...el, y: Math.min(el.y, Math.max(0, v - el.h)), h: Math.min(el.h, v) })));
    setLabelH(v);
  }

  function applyPreset(p: LabelPreset) {
    setLabelW(p.w);
    setLabelH(p.h);
    setElements(defaultElements(p.w, p.h));
    setSelectedId(null);
  }

  function addCustomText() {
    const newEl: DesignElement = {
      id: uid(), kind: 'custom', visible: true,
      x: 2, y: 2, w: Math.max(8, labelW * 0.3), h: 3,
      bold: false, align: 'left', fontMm: null, text: 'Custom text', barcodeType: 'code128', showValueText: true,
    };
    setElements(els => [...els, newEl]);
    setSelectedId(newEl.id);
  }

  // ─── Render one element, shared by the interactive editor and the static print output ──
  function renderElement(el: DesignElement, item: InventoryItem, opts: { pxPerMm?: number; interactive?: boolean }) {
    const pxPerMm = opts.pxPerMm;
    const unit = (mm: number) => (pxPerMm ? `${mm * pxPerMm}px` : `${mm}mm`);
    const selected = opts.interactive && selectedId === el.id;

    if (el.kind === 'barcode') {
      return (
        <div
          key={el.id}
          onPointerDown={opts.interactive ? e => startDrag(e, el) : undefined}
          style={{
            position: 'absolute', left: unit(el.x), top: unit(el.y), width: unit(el.w), height: unit(el.h),
            cursor: opts.interactive ? 'move' : undefined,
          }}
          className={opts.interactive ? `rounded ${selected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300'}` : undefined}
        >
          <div className="w-full h-full pointer-events-none select-none">
            <BarcodeGraphic text={item.barcode} type={el.barcodeType} showValueText={el.showValueText} />
          </div>
          {opts.interactive && (
            <div
              onPointerDown={e => { e.stopPropagation(); startResize(e, el); }}
              className="absolute -right-2 -bottom-2 w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg cursor-nwse-resize touch-none"
              title="Drag to resize"
            />
          )}
        </div>
      );
    }

    const text = el.kind === 'custom' ? el.text : fieldText(item, el.kind);
    const fontMm = el.fontMm ?? clampNum(el.h * 0.62, 1.1, 6);

    return (
      <div
        key={el.id}
        onPointerDown={opts.interactive ? e => startDrag(e, el) : undefined}
        style={{
          position: 'absolute', left: unit(el.x), top: unit(el.y), width: unit(el.w), height: unit(el.h),
          display: 'flex', alignItems: 'center', overflow: 'hidden',
          cursor: opts.interactive ? 'move' : undefined,
        }}
        className={opts.interactive ? `rounded ${selected ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-emerald-300'}` : undefined}
      >
        <span
          style={{
            display: 'block', width: '100%',
            fontSize: unit(fontMm), lineHeight: 1.15, fontWeight: el.bold ? 800 : 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: '#0f172a', textAlign: el.align,
          }}
        >
          {text || (el.kind === 'custom' ? 'Double text…' : '')}
        </span>
        {opts.interactive && (
          <div
            onPointerDown={e => { e.stopPropagation(); startResize(e, el); }}
            className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white shadow-lg cursor-nwse-resize touch-none"
            title="Drag to resize"
          />
        )}
      </div>
    );
  }

  function renderLabelCard(item: InventoryItem, key?: string) {
    return (
      <div key={key} className="single-label-card" style={{ width: `${labelW}mm`, height: `${labelH}mm`, position: 'relative' }}>
        {elements.filter(e => e.visible).map(el => renderElement(el, item, {}))}
      </div>
    );
  }

  /** Rasterizes the off-screen clean copy of the current preview label (no drag handles,
      no selection rings) into a PNG at print-grade resolution and downloads it. Runs off the
      hidden `exportRef` node rather than the on-screen editor canvas, and at PNG_EXPORT_DPI
      rather than screen pixel density, for the same crisp-barcode reasons as the print path. */
  async function handleDownloadPng(item: InventoryItem) {
    const node = exportRef.current;
    if (!node || exportingPng) return;
    setExportingPng(true);
    try {
      const pixelRatio = PNG_EXPORT_DPI / 96;
      const dataUrl = await toPng(node, { pixelRatio, backgroundColor: '#ffffff', cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `label-${item.barcode}.png`;
      a.click();
    } catch {
      // Swallowed — the Download PNG button just stops spinning and the user can retry.
    } finally {
      setExportingPng(false);
    }
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const previewItem = mode === 'single' ? singleItem : (bulkItems.find(i => printIds.has(i._id)) ?? bulkItems[0] ?? null);
  const selectedEl = elements.find(e => e.id === selectedId) ?? null;

  const printItems = useMemo(() => {
    if (mode !== 'bulk') return [];
    const included = bulkItems.filter(i => printIds.has(i._id));
    const out: InventoryItem[] = [];
    included.forEach(item => { for (let c = 0; c < copies; c++) out.push(item); });
    return out;
  }, [mode, bulkItems, printIds, copies]);

  const perPage = Math.max(1, sheetCols * sheetRows);
  const pages = useMemo(() => {
    if (sheetMode !== 'grid') return [];
    const chunks: InventoryItem[][] = [];
    for (let i = 0; i < printItems.length; i += perPage) chunks.push(printItems.slice(i, i + perPage));
    return chunks;
  }, [printItems, sheetMode, perPage]);

  if (!open) return null;

  const canPrint = mode === 'single' ? !!singleItem : printItems.length > 0;

  // Flushes the save immediately instead of waiting on the debounce timer, so a change made
  // right before closing is never dropped. Guarded on templateReady for the same reason as
  // the debounced save above — never write the pre-fetch defaults over a real saved template.
  function handleClose() {
    if (templateReady) persistTemplate({ labelW, labelH, elements });
    onClose();
  }

  return (
    <>
      {/* Global print override — scoped to exist only while the designer is mounted, so
          printing elsewhere on the page is never affected by this. */}
      <style jsx global>{`
        @media print {
          @page { margin: 0; }
          body * { visibility: hidden !important; height: 0 !important; overflow: visible !important; }
          .print-labels-sheet, .print-labels-sheet * { visibility: visible !important; height: auto !important; overflow: visible !important; }
          .print-labels-sheet {
            position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
            display: block !important; background: white !important;
          }
          /* Never let the browser's "save ink" color adjustment lighten the barcode fill —
             a scanner reads contrast, and a washed-out grey bar is a bar that won't scan. */
          .print-labels-sheet, .print-labels-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          ${mode === 'single' || sheetMode === 'roll' ? `
          @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
          .single-label-card {
            width: ${labelW}mm !important; height: ${labelH}mm !important; position: relative !important;
            overflow: hidden !important; margin: 0 !important; padding: 0 !important; border: none !important;
            break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid;
          }
          .single-label-card:last-child { break-after: auto; page-break-after: auto; }
          ` : `
          @page { size: A4; margin: 10mm; }
          .sheet-page {
            display: grid; grid-template-columns: repeat(${sheetCols}, ${labelW}mm); grid-auto-rows: ${labelH}mm;
            gap: ${sheetGap}mm; break-after: page; page-break-after: always;
          }
          .sheet-page:last-child { break-after: auto; page-break-after: auto; }
          .single-label-card {
            width: ${labelW}mm !important; height: ${labelH}mm !important; position: relative !important;
            overflow: hidden !important; border: 1px dashed #cbd5e1 !important;
            break-inside: avoid; page-break-inside: avoid;
          }
          `}
        }
      `}</style>

      <Modal
        open={open}
        onClose={handleClose}
        width="max-w-6xl"
        title={mode === 'bulk' ? `Label Layout — ${bulkItems.length} Item${bulkItems.length !== 1 ? 's' : ''}` : 'Asset Barcode View'}
      >
        {!previewItem ? (
          <p className="py-10 text-center text-sm font-bold text-slate-400">No item to preview.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ─── Toolbar ─────────────────────────────────────────────────── */}
            <div className="w-full flex flex-wrap items-center gap-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">Stock</span>
                <select
                  value={LABEL_PRESETS.findIndex(p => p.w === labelW && p.h === labelH)}
                  onChange={e => { const p = LABEL_PRESETS[Number(e.target.value)]; if (p) applyPreset(p); }}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={-1} disabled>Custom</option>
                  {LABEL_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </select>
                <input
                  type="number" min={20} max={200} value={labelW}
                  onChange={e => handleWidthChange(Number(e.target.value))}
                  className="w-14 px-2 py-2 rounded-lg border border-slate-200 text-xs font-black text-slate-900 text-center outline-none focus:border-blue-400"
                />
                <span className="text-slate-300 text-xs">×</span>
                <input
                  type="number" min={8} max={100} value={labelH}
                  onChange={e => handleHeightChange(Number(e.target.value))}
                  className="w-14 px-2 py-2 rounded-lg border border-slate-200 text-xs font-black text-slate-900 text-center outline-none focus:border-blue-400"
                />
                <span className="text-[9px] font-bold text-slate-400 uppercase">mm</span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-1">
                <button type="button" onClick={() => setZoom(z => clampNum(z - 1, 3, 20))} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" title="Zoom out">
                  <ZoomOut size={14} />
                </button>
                <span className="w-12 text-center text-[10px] font-black text-slate-600">{Math.round((zoom / 7) * 100)}%</span>
                <button type="button" onClick={() => setZoom(z => clampNum(z + 1, 3, 20))} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" title="Zoom in">
                  <ZoomIn size={14} />
                </button>
              </div>

              <button
                type="button" onClick={() => setShowGrid(g => !g)}
                className={`p-2.5 rounded-lg border transition-colors ${showGrid ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                title="Toggle grid"
              >
                <Grid3x3 size={14} />
              </button>
              <button
                type="button" onClick={() => setSnap(s => !s)}
                className={`p-2.5 rounded-lg border transition-colors ${snap ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                title="Snap to 0.5mm grid"
              >
                <Magnet size={14} />
              </button>
              <button
                type="button"
                onClick={() => { setElements(defaultElements(labelW, labelH)); setSelectedId(null); }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 text-[10px] font-black uppercase tracking-wide transition-colors"
                title="Reset to the side-by-side layout"
              >
                <RotateCcw size={13} /> Reset
              </button>
              <button
                type="button"
                onClick={() => { setElements(defaultElementsStacked(labelW, labelH)); setSelectedId(null); }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 text-[10px] font-black uppercase tracking-wide transition-colors"
                title="Give the barcode the full label width, stack fields underneath — fixes overlap and widens the bars"
              >
                <StretchHorizontal size={13} /> Fit Barcode
              </button>
            </div>

            {/* ─── Canvas + Inspector ──────────────────────────────────────── */}
            <div className="flex flex-col xl:flex-row gap-5">
              <div className="flex-1 min-w-0 flex flex-col items-center">
                <div className="w-full flex items-center justify-center bg-slate-100 rounded-2xl p-8 overflow-auto">
                  <div
                    onPointerDown={() => setSelectedId(null)}
                    className="relative bg-white border-2 border-dashed border-slate-300 rounded-md shadow-inner shrink-0"
                    style={{
                      width: labelW * zoom, height: labelH * zoom,
                      backgroundImage: showGrid
                        ? 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)'
                        : undefined,
                      backgroundSize: showGrid ? `${zoom}px ${zoom}px` : undefined,
                    }}
                  >
                    {elements.filter(e => e.visible).map(el => renderElement(el, previewItem, { pxPerMm: zoom, interactive: true }))}
                  </div>
                </div>
                <p className="mt-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
                  Click an element to select it — drag to move, corner handle to resize, arrow keys to nudge
                </p>
              </div>

              <div className="w-full xl:w-80 shrink-0 space-y-4">
                {/* Inspector */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={14} className="text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Element</span>
                  </div>

                  {!selectedEl ? (
                    <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                      Select an element on the canvas — or in Layers below — to edit its position, size, font and alignment.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide">{elementLabel(selectedEl)}</p>

                      <div className="grid grid-cols-2 gap-2">
                        <NumField label="X (mm)" value={selectedEl.x} onChange={v => updateElement(selectedEl.id, { x: clampNum(v, 0, labelW - selectedEl.w) })} />
                        <NumField label="Y (mm)" value={selectedEl.y} onChange={v => updateElement(selectedEl.id, { y: clampNum(v, 0, labelH - selectedEl.h) })} />
                        <NumField label="W (mm)" value={selectedEl.w} onChange={v => updateElement(selectedEl.id, { w: clampNum(v, 4, labelW - selectedEl.x) })} />
                        <NumField label="H (mm)" value={selectedEl.h} onChange={v => updateElement(selectedEl.id, { h: clampNum(v, 2, labelH - selectedEl.y) })} />
                      </div>

                      {selectedEl.kind === 'barcode' ? (
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Symbology</label>
                            <select
                              value={selectedEl.barcodeType}
                              onChange={e => updateElement(selectedEl.id, { barcodeType: e.target.value as BarcodeType })}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
                            >
                              {(Object.entries(BARCODE_TYPE_META) as [BarcodeType, typeof BARCODE_TYPE_META[BarcodeType]][]).map(([k, m]) => (
                                <option key={k} value={k}>{m.label}</option>
                              ))}
                            </select>
                          </div>

                          {selectedEl.barcodeType !== 'qrcode' && (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={selectedEl.showValueText}
                                onChange={() => updateElement(selectedEl.id, { showValueText: !selectedEl.showValueText })}
                                className="w-3.5 h-3.5 rounded accent-blue-600"
                              />
                              <span className="text-[10px] font-bold text-slate-600">Show value text under bars</span>
                            </label>
                          )}

                          {previewItem && selectedEl.barcodeType !== 'qrcode' && (() => {
                            const modules = estimateModuleCount(selectedEl.barcodeType, previewItem.barcode);
                            const moduleMm = modules > 0 ? selectedEl.w / modules : 0;
                            if (!moduleMm || moduleMm >= MIN_SAFE_MODULE_MM) return null;
                            return (
                              <p className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-snug">
                                Bars ≈ {moduleMm.toFixed(2)}mm wide — likely too thin for a handheld scanner. Widen this box or shrink the barcode value.
                              </p>
                            );
                          })()}
                        </div>
                      ) : (
                        <>
                          {selectedEl.kind === 'custom' && (
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Text</label>
                              <input
                                value={selectedEl.text}
                                onChange={e => updateElement(selectedEl.id, { text: e.target.value })}
                                placeholder="e.g. RKM Jewellers"
                                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
                              />
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                              className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-1 transition-colors ${selectedEl.bold ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                              title="Bold"
                            >
                              <Bold size={12} />
                            </button>
                            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => updateElement(selectedEl.id, { align: a })}
                                className={`flex-1 py-2 rounded-lg border flex items-center justify-center transition-colors ${selectedEl.align === a ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                title={`Align ${a}`}
                              >
                                <Icon size={12} />
                              </button>
                            ))}
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Font size</label>
                              <button type="button" onClick={() => updateElement(selectedEl.id, { fontMm: null })} className="text-[9px] font-black text-blue-600 uppercase hover:text-blue-800">
                                Auto
                              </button>
                            </div>
                            <input
                              type="range" min={1} max={8} step={0.5}
                              value={selectedEl.fontMm ?? clampNum(selectedEl.h * 0.62, 1.1, 6)}
                              onChange={e => updateElement(selectedEl.id, { fontMm: Number(e.target.value) })}
                              className="w-full accent-blue-600"
                            />
                          </div>
                        </>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { updateElement(selectedEl.id, { visible: false }); setSelectedId(null); }}
                          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <EyeOff size={12} /> Hide
                        </button>
                        {selectedEl.kind === 'custom' && (
                          <button
                            type="button"
                            onClick={() => { setElements(els => els.filter(e => e.id !== selectedEl.id)); setSelectedId(null); }}
                            className="flex-1 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Layers */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Layers</span>
                    </div>
                    <button type="button" onClick={addCustomText} className="flex items-center gap-1 text-[9px] font-black text-blue-600 uppercase tracking-wide hover:text-blue-800">
                      <Plus size={12} /> Add Text
                    </button>
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {elements.map((el, i) => (
                      <div
                        key={el.id}
                        onClick={() => setSelectedId(el.id)}
                        className={`flex items-center gap-1.5 px-2 py-2 rounded-lg cursor-pointer text-[10px] font-bold uppercase tracking-wide transition-colors ${selectedId === el.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        {el.kind === 'barcode' ? <BarcodeIcon size={13} className="shrink-0" /> : <TypeIcon size={13} className="shrink-0" />}
                        <span className="flex-1 truncate">{elementLabel(el)}</span>
                        <button type="button" disabled={i === 0} onClick={e => { e.stopPropagation(); moveLayer(i, -1); }} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                          <ChevronUp size={12} />
                        </button>
                        <button type="button" disabled={i === elements.length - 1} onClick={e => { e.stopPropagation(); moveLayer(i, 1); }} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                          <ChevronDown size={12} />
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); updateElement(el.id, { visible: !el.visible }); }} className="p-0.5 text-slate-400 hover:text-slate-700">
                          {el.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        {el.kind === 'custom' && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setElements(els => els.filter(x => x.id !== el.id)); if (selectedId === el.id) setSelectedId(null); }}
                            className="p-0.5 text-red-300 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Bulk print controls ─────────────────────────────────────── */}
            {mode === 'bulk' && (
              <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Items to print</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPrintIds(new Set(bulkItems.map(i => i._id)))} className="text-[9px] font-black text-blue-600 uppercase hover:text-blue-800">Select all</button>
                    <span className="text-slate-200">|</span>
                    <button type="button" onClick={() => setPrintIds(new Set())} className="text-[9px] font-black text-slate-400 uppercase hover:text-slate-600">Clear</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
                  {bulkItems.map(item => {
                    const included = printIds.has(item._id);
                    const f = getLabelFields(item);
                    return (
                      <label key={item._id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${included ? 'border-blue-200 bg-blue-50/60' : 'border-slate-100 bg-slate-50/40 opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => setPrintIds(ids => {
                            const n = new Set(ids);
                            if (n.has(item._id)) n.delete(item._id); else n.add(item._id);
                            return n;
                          })}
                          className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-800 truncate">{f.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 truncate">{item.barcode}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Copies per item</label>
                    <input
                      type="number" min={1} max={20} value={copies}
                      onChange={e => setCopies(clampNum(Number(e.target.value) || 1, 1, 20))}
                      className="mt-1 w-20 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-center outline-none focus:border-blue-400"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Sheet layout</label>
                    <div className="mt-1 flex rounded-lg border border-slate-200 overflow-hidden">
                      <button type="button" onClick={() => setSheetMode('roll')} className={`px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5 transition-colors ${sheetMode === 'roll' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        <Rows size={12} /> Roll
                      </button>
                      <button type="button" onClick={() => setSheetMode('grid')} className={`px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5 border-l border-slate-200 transition-colors ${sheetMode === 'grid' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        <LayoutGrid size={12} /> Sheet
                      </button>
                    </div>
                  </div>

                  {sheetMode === 'grid' && (
                    <>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Columns</label>
                        <input type="number" min={1} max={10} value={sheetCols} onChange={e => setSheetCols(clampNum(Number(e.target.value) || 1, 1, 10))} className="mt-1 w-16 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-center outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rows</label>
                        <input type="number" min={1} max={15} value={sheetRows} onChange={e => setSheetRows(clampNum(Number(e.target.value) || 1, 1, 15))} className="mt-1 w-16 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-center outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Gap (mm)</label>
                        <input type="number" min={0} max={20} step={0.5} value={sheetGap} onChange={e => setSheetGap(clampNum(Number(e.target.value) || 0, 0, 20))} className="mt-1 w-16 px-2.5 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-center outline-none focus:border-blue-400" />
                      </div>
                    </>
                  )}

                  <div className="ml-auto text-right">
                    <p className="text-[11px] font-black text-slate-800">{printItems.length} label{printItems.length !== 1 ? 's' : ''}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                      {sheetMode === 'roll' ? `${printItems.length} page${printItems.length !== 1 ? 's' : ''}` : `${pages.length} sheet${pages.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>

                {previewItem && (
                  <p className="text-[10px] font-bold text-slate-400 text-center pt-1">
                    Previewing <span className="text-slate-700 font-black">{previewItem.barcode}</span> — this layout applies to every included item, one label each.
                  </p>
                )}
              </div>
            )}

            {mode === 'single' && singleItem && (
              <div className="text-center">
                <p className="text-2xl font-black text-slate-900 tracking-widest uppercase">{singleItem.barcode}</p>
                <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scan using hardware scanner</p>
              </div>
            )}

            <p className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-wide">
              In the print dialog, set Scale to <span className="text-slate-600">100% / Actual size</span> (not &quot;Fit to page&quot;) so labels register exactly with your die-cut stock
            </p>

            <div className="w-full flex flex-wrap gap-3">
              <button
                onClick={() => window.print()}
                disabled={!canPrint}
                className="flex-1 min-w-[140px] py-4 rounded-2xl bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
                {mode === 'bulk' ? `Print ${printItems.length} Label${printItems.length !== 1 ? 's' : ''}` : 'Print Piece Label'}
              </button>
              <button
                onClick={() => previewItem && handleDownloadPng(previewItem)}
                disabled={!previewItem || exportingPng}
                title={mode === 'bulk' ? `Downloads the previewed label (${previewItem?.barcode}) — switch which item is checked above to export a different one` : undefined}
                className="flex-1 min-w-[140px] py-4 rounded-2xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <Download size={16} className={exportingPng ? 'animate-bounce' : undefined} />
                {exportingPng ? 'Exporting…' : 'Download PNG'}
              </button>
              <button
                onClick={handleClose}
                className="flex-1 min-w-[100px] py-4 rounded-2xl bg-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invisible print wrapper — each item gets its own label, laid out exactly as
          arranged above, either one-per-page (roll) or grouped into sheet pages. */}
      <div className="hidden print:block print-labels-sheet">
        {mode === 'single' && singleItem ? (
          renderLabelCard(singleItem)
        ) : sheetMode === 'roll' ? (
          printItems.map((item, idx) => renderLabelCard(item, `${item._id}_${idx}`))
        ) : (
          pages.map((pageItems, pi) => (
            <div className="sheet-page" key={`page_${pi}`}>
              {pageItems.map((item, idx) => renderLabelCard(item, `${item._id}_${pi}_${idx}`))}
            </div>
          ))
        )}
      </div>

      {/* Off-screen clean render of the current preview label — kept in normal layout flow
          (just shifted off the visible page) rather than display:none, since html-to-image
          needs the node to actually be laid out to rasterize it. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={exportRef}>
          {previewItem && renderLabelCard(previewItem)}
        </div>
      </div>
    </>
  );
}
