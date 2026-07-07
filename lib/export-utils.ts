/** Escapes a single CSV field per RFC 4180 (quotes, commas, newlines). */
function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Converts an array of flat objects to a CSV file and triggers a browser download.
 * `columns` maps CSV header labels to keys (or accessor functions) on each row.
 */
export function downloadCsv<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  columns: { header: string; accessor: keyof T | ((row: T) => unknown) }[],
): void {
  const header = columns.map(c => csvField(c.header)).join(',');
  const body = rows
    .map(row => columns
      .map(c => csvField(typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor]))
      .join(','))
    .join('\n');
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
