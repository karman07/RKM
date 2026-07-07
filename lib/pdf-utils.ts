/**
 * Renders a DOM node into a jsPDF document (best-fit on A4), for the "Download PDF"
 * and "Share" actions on printable receipts (Tax Invoice, Advance Receipt, etc).
 * Libraries are dynamically imported so they only load when actually needed.
 */
export async function renderElementToPdf(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Nothing to render — element not found');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const imgData = canvas.toDataURL('image/png');

  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgRatio = canvas.height / canvas.width;
  let renderWidth = pageWidth;
  let renderHeight = pageWidth * imgRatio;
  if (renderHeight > pageHeight) {
    renderHeight = pageHeight;
    renderWidth = pageHeight / imgRatio;
  }
  const x = (pageWidth - renderWidth) / 2;
  const y = (pageHeight - renderHeight) / 2;
  pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight);
  return pdf;
}

/** Downloads the rendered element as a PDF file. */
export async function downloadElementAsPdf(elementId: string, filename: string) {
  const pdf = await renderElementToPdf(elementId);
  pdf.save(filename);
}

/**
 * Shares the rendered element as a PDF via the native OS/browser share sheet
 * when supported; otherwise falls back to downloading it.
 */
export async function shareElementAsPdf(elementId: string, filename: string, title: string, text: string) {
  const pdf = await renderElementToPdf(elementId);
  const blob = pdf.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return true;
  }
  pdf.save(filename);
  return false;
}
