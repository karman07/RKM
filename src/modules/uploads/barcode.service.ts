import { Injectable, Logger } from '@nestjs/common';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  async generateAndSave(barcodeText: string, filenameHint?: string): Promise<string> {
    const uploadDir = join(process.cwd(), 'uploads', 'barcodes');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const seed = (filenameHint || barcodeText)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
    const filename = `${Date.now()}_${seed || 'barcode'}.png`;
    const filepath = join(uploadDir, filename);

    try {
      // Dynamic import for bwip-js (ESM-first package)
      const bwipjs = await import('bwip-js');
      const png: Buffer = await bwipjs.default.toBuffer({
        bcid: 'code128',
        text: barcodeText,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
        backgroundcolor: 'ffffff',
      });
      writeFileSync(filepath, png);
    } catch (err) {
      this.logger.error(`Failed to generate barcode image for '${barcodeText}': ${err}`);
      // Return path even if generation fails — barcode string is still valid
    }

    return `/static/barcodes/${filename}`;
  }
}
