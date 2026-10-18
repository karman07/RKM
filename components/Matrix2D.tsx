'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js/browser';

/** Widely-cited practical floor for the narrow-bar (X-dimension) width a handheld laser/CCD
    scanner can resolve reliably; thinner than this and reads start getting unreliable. */
export const MIN_SAFE_MODULE_MM = 0.25;

export type Code2D = 'qrcode' | 'datamatrix';

// ─── 2D symbols (QR / Data Matrix) drawn in whole printer dots ───────────────

export type Matrix = { size: number; get: (row: number, col: number) => boolean };

/** Module matrix for a 2D symbol, or null if the text can't be encoded. */
export function build2DMatrix(type: Code2D, text: string): Matrix | null {
  try {
    if (type === 'qrcode') {
      const q = QRCode.create(text || ' ', { errorCorrectionLevel: 'M' });
      return { size: q.modules.size, get: (r, c) => !!q.modules.get(r, c) };
    }
    const raw = bwipjs.raw('datamatrix', text || ' ', {}) as any[];
    const o = raw[0];
    return { size: o.pixx, get: (r, c) => o.pixs[r * o.pixx + c] === 1 };
  } catch {
    return null;
  }
}

/**
 * Sizes a 2D symbol so every module is a WHOLE number of printer dots. A thermal printer can only
 * print full dots — scale a code to, say, 4.2 dots per module and some modules print 4 dots wide and
 * some 5, which wrecks the symbol's geometry and is the usual reason a printed code won't scan.
 * `k` = dots per module, chosen as large as fits in the box.
 */
export function layout2D(modules: number, type: Code2D, boxW: number, boxH: number, dpi: number) {
  const dotMm = 25.4 / dpi;
  const quiet = type === 'datamatrix' ? 1 : 2;       // white border (in modules) kept inside the symbol
  const total = modules + quiet * 2;
  const avail = Math.min(boxW, boxH);
  const kFit = Math.floor(avail / (total * dotMm));
  const k = Math.max(1, kFit);
  const moduleMm = k * dotMm;
  return { dotMm, quiet, total, k, moduleMm, sizeMm: total * moduleMm, overflows: kFit < 1, tooSmall: moduleMm < MIN_SAFE_MODULE_MM };
}

export default function Matrix2D({ text, type, box, dpi, unit }: {
  text: string; type: Code2D;
  box: { x: number; y: number; w: number; h: number }; dpi: number; unit: (mm: number) => string;
}) {
  const m = useMemo(() => build2DMatrix(type, text), [type, text]);
  if (!m) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50/90 text-[7px] font-bold text-red-500 text-center px-1 leading-tight">
        Not valid {type === 'datamatrix' ? 'Data Matrix' : 'QR'}
      </div>
    );
  }
  const L = layout2D(m.size, type, box.w, box.h, dpi);
  // Centre the symbol in its box, then snap its top-left corner to the printer's dot grid
  // (label coordinates, origin = top-left of the stock) so the first module starts on a dot boundary.
  const snap = (abs: number) => Math.round(abs / L.dotMm) * L.dotMm;
  const left = snap(box.x + (box.w - L.sizeMm) / 2) - box.x;
  const top = snap(box.y + (box.h - L.sizeMm) / 2) - box.y;

  let d = '';
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.get(r, c)) { c++; continue; }
      let len = 1;
      while (c + len < m.size && m.get(r, c + len)) len++;
      d += `M${c + L.quiet} ${r + L.quiet}h${len}v1h-${len}z`;
      c += len;
    }
  }
  return (
    <svg
      width={unit(L.sizeMm)} height={unit(L.sizeMm)} viewBox={`0 0 ${L.total} ${L.total}`}
      shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', left: unit(left), top: unit(top), display: 'block', background: '#fff' }}
    >
      <rect width={L.total} height={L.total} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

