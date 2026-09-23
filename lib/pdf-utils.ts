/**
 * Renders a DOM node into a jsPDF document, for the "Download PDF" and "Share" actions
 * on printable receipts (Tax Invoice, Advance Receipt, Account Statement, etc).
 * Libraries are dynamically imported so they only load when actually needed.
 *
 * Content that fits on one A4 page is centered on a single page, same as a short receipt.
 * Taller content (e.g. a long transaction history) is split across multiple pages instead
 * of being squeezed down to fit one page unreadably small.
 *
 * Pass `{ singlePage: true }` for fixed-size documents (e.g. an ID card) that must never
 * be split across pages — the whole element is scaled down to fit within one page instead.
 */
export async function renderElementToPdf(elementId: string, options?: { singlePage?: boolean }) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Nothing to render — element not found');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });

  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  if (options?.singlePage) {
    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const renderWidth = canvas.width * scale;
    const renderHeight = canvas.height * scale;
    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, renderWidth, renderHeight);
    return pdf;
  }

  const renderWidth = pageWidth;
  const scale = renderWidth / canvas.width;
  const pageHeightPx = Math.floor(pageHeight / scale);

  if (canvas.height <= pageHeightPx) {
    const renderHeight = canvas.height * scale;
    const y = Math.max(0, (pageHeight - renderHeight) / 2);
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, y, renderWidth, renderHeight);
    return pdf;
  }

  let renderedPx = 0;
  let pageIndex = 0;
  while (renderedPx < canvas.height) {
    const slicePx = Math.min(pageHeightPx, canvas.height - renderedPx);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = slicePx;
    const ctx = pageCanvas.getContext('2d')!;
    ctx.drawImage(canvas, 0, -renderedPx);

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, renderWidth, slicePx * scale);

    renderedPx += slicePx;
    pageIndex += 1;
  }

  return pdf;
}

/** Downloads the rendered element as a PDF file. */
export async function downloadElementAsPdf(elementId: string, filename: string, options?: { singlePage?: boolean }) {
  const pdf = await renderElementToPdf(elementId, options);
  pdf.save(filename);
}

/**
 * Shares the rendered element as a PDF via the native OS/browser share sheet
 * when supported; otherwise falls back to downloading it.
 */
export async function shareElementAsPdf(elementId: string, filename: string, title: string, text: string, options?: { singlePage?: boolean }) {
  const pdf = await renderElementToPdf(elementId, options);
  const blob = pdf.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return true;
  }
  pdf.save(filename);
  return false;
}
