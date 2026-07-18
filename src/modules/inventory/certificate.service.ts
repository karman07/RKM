import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  InventoryItem,
  InventoryItemDocument,
  InventoryStatus,
} from './schemas/inventory-item.schema.js';
import { ProductsService } from '../products/products.service.js';
import { BranchesService } from '../branches/branches.service.js';

const TEMPLATES_DIR = path.join(__dirname, 'certificate-templates');
const TEMPLATE_WITH_STONES = path.join(TEMPLATES_DIR, 'RKM Certification (5).pdf');
const TEMPLATE_PURE_GOLD = path.join(TEMPLATES_DIR, 'RKM Certification (4).pdf');

const VALUE_X = 349;
const VALUE_MAX_X = 465; // right edge of the "Details" column
const VALUE_FONT_SIZE = 10.5;
const WRAP_FONT_SIZE = 8;
const TEXT_COLOR = rgb(0.07, 0.07, 0.07);

/** Vertical mid-point of each label row on page 2, in top-down PDF-source coordinates (as captured via `pdftotext -bbox`). */
const ROWS_WITH_STONES: Record<string, [number, number]> = {
  date_of_purchase: [300.150359, 314.715263],
  invoice_number: [325.759284, 340.324188],
  product_code: [352.257047, 366.821951],
  purity: [379.441645, 394.006548],
  gross_weight: [405.158508, 419.723411],
  net_gold_weight: [433.601194, 448.166098],
  diamond_weight: [460.019913, 474.584817],
  store_name: [485.932640, 500.497544],
  store_address: [512.938471, 527.503375],
};

const ROWS_PURE_GOLD: Record<string, [number, number]> = {
  product_code: [300.150359, 314.715263],
  gold_purity: [325.759284, 340.324188],
  gross_weight: [352.257047, 366.821951],
  net_gold_weight: [379.441645, 394.006548],
  bis_huid: [405.158508, 419.723411],
  invoice_number: [433.601194, 448.166098],
  date_of_purchase: [460.019913, 474.584817],
};

/** Same phone normalisation used by CustomersService.getPurchaseHistory, so ownership checks
 *  agree with what a customer actually sees in their own purchase history. */
function phoneVariants(phone: string): string[] {
  const stripped = phone.replace(/^\+/, '');
  return [phone, stripped, `+${stripped}`];
}

function fmtDate(dt: Date | null | undefined): string {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * The full free-text branch address is too long to print legibly in the certificate's
 * narrow "Details" column, so this keeps just the locality — city, state and pincode —
 * mirroring the compact "City, State / Pincode" summary shown elsewhere in the app.
 */
function shortAddress(branch: any): string {
  const city = (branch?.city || '').trim();
  const state = (branch?.state || '').trim();
  const pincode = (branch?.pincode || '').trim();
  const locality = [city, state].filter(Boolean).join(', ');
  if (locality && pincode) return `${locality} - ${pincode}`;
  return locality || pincode || (branch?.address || '').trim();
}

/** Greedily wraps `text` into lines that each fit within `maxWidth` at the given font/size. */
function wrapLines(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

@Injectable()
export class CertificateService {
  private readonly outDir: string;

  constructor(
    @InjectModel(InventoryItem.name)
    private readonly inventoryModel: Model<InventoryItemDocument>,
    private readonly productsService: ProductsService,
    private readonly branchesService: BranchesService,
  ) {
    this.outDir = path.join(process.cwd(), 'uploads', 'certificates');
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  /**
   * @param ownerPhone When set (customer-facing calls only), restricts generation to items
   * actually sold to that phone number — staff calls omit this and can certify any sold item.
   */
  async generate(itemId: string, ownerPhone?: string): Promise<{ url: string }> {
    const item = await this.inventoryModel.findById(itemId).lean().exec();
    if (!item) throw new NotFoundException(`Inventory item ${itemId} not found`);
    if (item.status !== InventoryStatus.SOLD) {
      throw new BadRequestException('Certificate can only be generated for sold items');
    }
    if (ownerPhone && !phoneVariants(ownerPhone).includes(item.sold_customer_phone || '')) {
      throw new ForbiddenException('This item was not purchased on your account');
    }

    const product = await this.productsService.findOneRaw(String(item.product_id));
    const branch = item.sold_at_branch_id
      ? await this.branchesService.findOne(String(item.sold_at_branch_id)).catch(() => null)
      : null;

    // Item-level weights are the authoritative "actual" values, but many items are added
    // without overriding them — fall back to the product template's snapshot weights,
    // matching how the inventory list itself displays weight for such items.
    const grossWeight = item.gross_weight || product?.gross_weight || 0;
    const netWeight = item.net_weight || product?.net_weight || 0;
    const stoneWeight = item.stone_weight || product?.stone_weight || 0;

    const hasStones = !!product?.has_stones || stoneWeight > 0 || (product?.stones?.length ?? 0) > 0;
    const templatePath = hasStones ? TEMPLATE_WITH_STONES : TEMPLATE_PURE_GOLD;
    const rows = hasStones ? ROWS_WITH_STONES : ROWS_PURE_GOLD;

    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(1); // PRODUCT DETAILS page
    const { height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const maxWidth = VALUE_MAX_X - VALUE_X;
    const draw = (key: string, value: string, maxLines = 2) => {
      const row = rows[key];
      if (!row || !value) return;
      const [yMin, yMax] = row;
      const baseY = height - (yMin + yMax) / 2 + 1.0;

      if (font.widthOfTextAtSize(value, VALUE_FONT_SIZE) <= maxWidth) {
        page.drawText(value, { x: VALUE_X, y: baseY, size: VALUE_FONT_SIZE, font, color: TEXT_COLOR });
        return;
      }

      // Long values wrap downward from the row's normal single-line baseline (there's
      // blank space below the table before the signature block, so this never collides
      // with the row above — only used for the last row, Store Address, in practice).
      let lines = wrapLines(value, font, WRAP_FONT_SIZE, maxWidth);
      if (lines.length > maxLines) {
        lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, -1)}…`];
      }
      const lineGap = WRAP_FONT_SIZE + 1.6;
      lines.forEach((line, i) => {
        page.drawText(line, { x: VALUE_X, y: baseY - i * lineGap, size: WRAP_FONT_SIZE, font, color: TEXT_COLOR });
      });
    };

    draw('date_of_purchase', fmtDate(item.sold_at));
    draw('invoice_number', item.sale_reference || '');
    draw('product_code', item.unique_item_code || '');
    draw('purity', product?.purity || '');
    draw('gold_purity', product?.purity || '');
    draw('gross_weight', grossWeight ? `${grossWeight} g` : '');
    draw('net_gold_weight', netWeight ? `${netWeight} g` : '');
    draw('bis_huid', item.hallmark || product?.hallmark_number || '');
    draw('store_name', branch?.name || '');
    draw('store_address', shortAddress(branch));

    // Only mention diamond weight when the piece actually carries stone weight — leave the
    // row blank otherwise rather than printing zero. The template only has a single "Diamond
    // Weight" row (no separate generic stone-weight row), so a piece set only with non-diamond
    // stones prints nothing here rather than mislabelling other gemstones as diamonds.
    if (hasStones && stoneWeight > 0) {
      // Prefer the authoritative multi-stone breakdown; fall back to the legacy
      // single-stone fields for older products that never populated `stones[]`.
      const stones: Array<{ stone_type: string; weight: number }> =
        product?.stones?.length
          ? product.stones
          : product?.stone_type
            ? [{ stone_type: product.stone_type, weight: product.stone_weight || stoneWeight }]
            : [];
      const diamondTemplateWeight = stones
        .filter(s => /diamond/i.test(s.stone_type))
        .reduce((sum, s) => sum + (s.weight || 0), 0);
      const totalTemplateWeight = stones.reduce((sum, s) => sum + (s.weight || 0), 0);

      const diamondWeight = totalTemplateWeight > 0
        ? stoneWeight * (diamondTemplateWeight / totalTemplateWeight)
        : 0;

      draw('diamond_weight', diamondWeight > 0 ? `${diamondWeight.toFixed(3)} ct` : '');
    }

    const filename = `CERT-${item.unique_item_code}-${Date.now()}.pdf`;
    const filepath = path.join(this.outDir, filename);
    const outBytes = await pdf.save();
    fs.writeFileSync(filepath, outBytes);

    const url = `/static/certificates/${filename}`;
    await this.inventoryModel.findByIdAndUpdate(itemId, {
      certificate_url: url,
      certificate_generated_at: new Date(),
    }).exec();

    return { url };
  }
}
