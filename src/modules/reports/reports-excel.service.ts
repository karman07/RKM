import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

const NAVY = 'FF1E3264';
const GOLD = 'FFA07820';
const LGRAY = 'FF888888';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  /** Applied to every data cell in this column */
  numFmt?: string;
  accessor?: (row: any) => any;
}

@Injectable()
export class ReportsExcelService {
  /** Builds a single-sheet, professionally formatted workbook and returns it as a Buffer. */
  async buildSheet(opts: {
    title: string;
    subtitle?: string;
    generatedAt?: Date;
    columns: ExcelColumn[];
    rows: any[];
    totalsRow?: Record<string, string | number>;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RKM Jewellers Reporting System';
    workbook.created = opts.generatedAt ?? new Date();

    // Worksheet names may not contain: * ? : \ / [ ]  and are capped at 31 chars
    const sheetName = opts.title.replace(/[*?:\\/[\]]/g, '-').slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: opts.subtitle ? 4 : 3 }],
    });

    sheet.columns = opts.columns.map(c => ({ key: c.key, width: c.width ?? 18 }));

    // Title row
    const titleRow = sheet.addRow([opts.title]);
    titleRow.font = { bold: true, size: 16, color: { argb: NAVY } };
    sheet.mergeCells(1, 1, 1, opts.columns.length);

    if (opts.subtitle) {
      const subRow = sheet.addRow([opts.subtitle]);
      subRow.font = { italic: true, size: 10, color: { argb: LGRAY } };
      sheet.mergeCells(2, 1, 2, opts.columns.length);
    }

    const genRow = sheet.addRow([`Generated ${(opts.generatedAt ?? new Date()).toLocaleString('en-IN')} · ${opts.rows.length} record${opts.rows.length === 1 ? '' : 's'}`]);
    genRow.font = { size: 8, color: { argb: LGRAY } };
    sheet.mergeCells(genRow.number, 1, genRow.number, opts.columns.length);
    sheet.addRow([]);

    // Header row
    const headerRow = sheet.addRow(opts.columns.map(c => c.header));
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: GOLD } } };
    });

    // Data rows
    opts.rows.forEach((row, i) => {
      const values: Record<string, any> = {};
      opts.columns.forEach(c => { values[c.key] = c.accessor ? c.accessor(row) : row[c.key]; });
      const r = sheet.addRow(values);
      if (i % 2 === 1) {
        r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7FA' } }; });
      }
      opts.columns.forEach((c, ci) => {
        if (c.numFmt) r.getCell(ci + 1).numFmt = c.numFmt;
      });
    });

    if (opts.totalsRow) {
      const r = sheet.addRow(opts.totalsRow);
      r.eachCell(cell => {
        cell.font = { bold: true, color: { argb: NAVY } };
        cell.border = { top: { style: 'thin', color: { argb: GOLD } } };
      });
      opts.columns.forEach((c, ci) => {
        if (c.numFmt) r.getCell(ci + 1).numFmt = c.numFmt;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
