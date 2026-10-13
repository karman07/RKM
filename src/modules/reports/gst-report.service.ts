import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InventoryItem, InventoryItemDocument, InventoryStatus } from '../inventory/schemas/inventory-item.schema';
import { OnlineOrder, OnlineOrderDocument } from '../online-orders/schemas/online-order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

/** HSN heading for articles of jewellery of precious metal — used when a product has no HSN of its own. */
const DEFAULT_HSN = '71131910';
/** GST on gold jewellery is 3% (1.5% CGST + 1.5% SGST, or 3% IGST) when a product carries no tax rates of its own. */
const DEFAULT_RATE = 3;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function dayStart(v?: string) { if (!v) return undefined; const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
function dayEnd(v?: string) { if (!v) return undefined; const d = new Date(v); d.setHours(23, 59, 59, 999); return d; }
function range(field: string, from?: string, to?: string): Record<string, any> {
  const r: Record<string, Date> = {};
  const f = dayStart(from), t = dayEnd(to);
  if (f) r.$gte = f;
  if (t) r.$lte = t;
  return Object.keys(r).length ? { [field]: r } : {};
}

export interface GstLine {
  date: Date;
  invoiceNo: string;
  type: 'B2B' | 'B2C' | 'Online' | 'Credit Note';
  customer: string;
  gstin: string;
  branch: string;
  placeOfSupply: string;
  intraState: boolean;
  hsn: string;
  rate: number;
  qty: number;
  /** Item-level detail used by the sales / P&L reports */
  phone: string;
  paymentMode: string;
  salesperson: string;
  productName: string;
  sku: string;
  category: string;
  /** Purchase cost of the goods (negative on a credit note: the goods are back in stock) */
  cost: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * GST reporting. Every figure is derived from what was actually charged: the sale price on the
 * invoice is GST-inclusive, so  taxable = price ÷ (1 + rate)  and  GST = price − taxable. That keeps
 * the report reconciled to the invoices (discounts, coupons and manager reductions are already in the
 * price) and independent of today's gold rate, which the stored pricing breakdown is not.
 *
 * Supply type: CGST + SGST when the place of supply matches the selling branch's state, IGST when it
 * doesn't.
 *
 * Returns: a sale stays in the period it was made (items returned later are still counted there); the
 * refund appears as a negative credit-note line in the period the return was approved, for the amount
 * the admin approved. Returns still awaiting approval are not credited yet (and are flagged).
 *
 * This is also the single source of "net sales" for the P&L, overview and sales reports, so all of them
 * agree with the GST report to the rupee.
 */
@Injectable()
export class GstReportService {
  constructor(
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(OnlineOrder.name) private onlineOrderModel: Model<OnlineOrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private rateOf(product: any): number {
    const taxes = Array.isArray(product?.taxes) ? product.taxes : [];
    if (taxes.length > 0) return taxes.reduce((s: number, t: any) => s + (Number(t.percentage) || 0), 0);
    const legacy = Number(product?.tax_percentage);
    return Number.isFinite(legacy) && legacy > 0 ? legacy : DEFAULT_RATE;
  }

  private split(gross: number, rate: number, intra: boolean, sign: 1 | -1) {
    const taxable = r2(gross / (1 + rate / 100));
    const tax = r2(gross - taxable);
    const half = r2(tax / 2);
    return {
      taxable: sign * taxable,
      cgst: intra ? sign * half : 0,
      sgst: intra ? sign * r2(tax - half) : 0,
      igst: intra ? 0 : sign * tax,
      total: sign * r2(gross),
    };
  }

  async getReport(from?: string, to?: string) {
    return (await this.getReportWithLines(from, to)).report;
  }

  /** The GST report plus the item-level lines it was built from (used by the P&L / sales reports). */
  async getReportWithLines(from?: string, to?: string) {
    const warnings: string[] = [];

    const [sold, returned, orders, branches] = await Promise.all([
      // A returned item was still a sale in the period it sold — its refund is credited separately below.
      this.inventoryModel.find({ is_deleted: { $ne: true }, status: { $in: [InventoryStatus.SOLD, InventoryStatus.RETURNED] }, sold_at: { $ne: null }, ...range('sold_at', from, to) })
        .select('product_id selling_price purchase_price payment_mode sold_at sale_reference unique_item_code sold_at_branch_id sold_by_user_id sold_customer_name sold_customer_phone shipping_state').lean(),
      this.inventoryModel.find({ is_deleted: { $ne: true }, status: InventoryStatus.RETURNED, ...range('returned_at', from, to) })
        .select('product_id selling_price purchase_price payment_mode returned_at sale_reference unique_item_code sold_at_branch_id sold_by_user_id sold_customer_name sold_customer_phone shipping_state return_refund_status return_admin_approved_value').lean(),
      this.onlineOrderModel.find({ payment_status: 'paid', status: { $nin: ['cancelled', 'refunded'] }, ...range('createdAt', from, to) }).lean(),
      this.branchModel.find().select('name state gstin is_active').lean(),
    ]);

    const productIds = new Set<string>();
    sold.forEach((i: any) => i.product_id && productIds.add(String(i.product_id)));
    returned.forEach((i: any) => i.product_id && productIds.add(String(i.product_id)));
    orders.forEach((o: any) => (o.items ?? []).forEach((it: any) => it.product_id && productIds.add(String(it.product_id))));
    const phones = [...new Set([...sold, ...returned].map((i: any) => i.sold_customer_phone).filter(Boolean))];

    const userIds = [...new Set([...sold, ...returned].map((i: any) => i.sold_by_user_id).filter(Boolean).map(String))];
    const [products, customers, categories, users] = await Promise.all([
      this.productModel.find({ _id: { $in: [...productIds].filter(id => /^[a-f\d]{24}$/i.test(id)) } }).select('name sku taxes tax_percentage hsn_code category_id purchase_price').lean(),
      this.customerModel.find({ phone: { $in: phones } }).select('phone name gst_no place_of_supply').lean(),
      this.categoryModel.find().select('name').lean(),
      this.userModel.find({ _id: { $in: userIds } }).select('name').lean(),
    ]);
    const categoryName = new Map<string, string>((categories as any[]).map(c => [String(c._id), c.name]));
    const userName = new Map<string, string>((users as any[]).map(u => [String(u._id), u.name]));
    const productById = new Map<string, any>(products.map((p: any) => [String(p._id), p]));
    const customerByPhone = new Map<string, any>(customers.map((c: any) => [c.phone, c]));
    const branchById = new Map<string, any>(branches.map((b: any) => [String(b._id), b]));
    const defaultBranch = branches.find((b: any) => b.gstin && b.state) ?? branches.find((b: any) => b.state);

    if (branches.some((b: any) => b.is_active !== false && !b.state)) warnings.push('Some branches have no state set — their sales are treated as intra-state. Set the branch state to get CGST/SGST vs IGST right.');
    if (!branches.some((b: any) => b.gstin)) warnings.push('No branch has a GSTIN recorded. Add it under Branches so it can appear on filings.');

    const lines: GstLine[] = [];
    let noPos = 0;

    const addStoreLine = (item: any, date: Date, sign: 1 | -1, gross: number) => {
      const product = productById.get(String(item.product_id));
      const branch = branchById.get(String(item.sold_at_branch_id));
      const customer = item.sold_customer_phone ? customerByPhone.get(item.sold_customer_phone) : undefined;
      const pos = customer?.place_of_supply || item.shipping_state || '';
      if (!pos) noPos++;
      const intra = !pos || !branch?.state || norm(pos) === norm(branch.state);
      const rate = this.rateOf(product);
      const gstin = (customer?.gst_no ?? '').trim().toUpperCase();
      lines.push({
        date,
        invoiceNo: item.sale_reference || item.unique_item_code,
        type: sign === -1 ? 'Credit Note' : gstin ? 'B2B' : 'B2C',
        customer: item.sold_customer_name || customer?.name || 'Walk-in Customer',
        gstin,
        branch: branch?.name ?? 'Unallocated',
        placeOfSupply: pos || branch?.state || '',
        intraState: intra,
        hsn: product?.hsn_code || DEFAULT_HSN,
        rate,
        qty: sign,
        phone: item.sold_customer_phone || '',
        paymentMode: item.payment_mode || '',
        salesperson: item.sold_by_user_id ? userName.get(String(item.sold_by_user_id)) ?? 'Unassigned' : 'Unassigned',
        productName: product?.name ?? 'Unknown Item',
        sku: product?.sku ?? '',
        category: categoryName.get(String(product?.category_id)) ?? 'Uncategorized',
        cost: sign * (Number(item.purchase_price) || 0),
        ...this.split(gross, rate, intra, sign),
      });
    };
    sold.forEach((i: any) => addStoreLine(i, i.sold_at, 1, Number(i.selling_price) || 0));
    // Only approved refunds are credited, for the amount the admin approved.
    let pendingReturns = 0;
    returned.forEach((i: any) => {
      if (i.return_refund_status === 'approved') {
        const refund = Number(i.return_admin_approved_value ?? i.selling_price) || 0;
        if (refund > 0) addStoreLine(i, i.returned_at, -1, refund);
      } else if (i.return_refund_status !== 'rejected') pendingReturns++;
    });
    if (pendingReturns > 0) warnings.push(`${pendingReturns} returned item(s) are still awaiting refund approval and are not credited yet.`);

    // Online orders: item prices are GST-inclusive; any coupon is spread across the items so it reduces taxable value.
    for (const o of orders as any[]) {
      const subtotal = Number(o.subtotal) || (o.items ?? []).reduce((s: number, it: any) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
      const factor = subtotal > 0 ? Math.max(0, subtotal - (Number(o.discount_amount) || 0)) / subtotal : 1;
      const pos = o.delivery_state || defaultBranch?.state || '';
      const intra = !defaultBranch?.state || norm(pos) === norm(defaultBranch.state);
      for (const it of (o.items ?? []) as any[]) {
        const product = productById.get(String(it.product_id));
        const rate = this.rateOf(product);
        const qty = Number(it.quantity) || 1;
        lines.push({
          date: o.createdAt,
          invoiceNo: o.order_number,
          type: 'Online',
          customer: o.customer_name,
          gstin: '',
          branch: 'Online Store',
          placeOfSupply: pos,
          intraState: intra,
          hsn: product?.hsn_code || DEFAULT_HSN,
          rate,
          qty,
          phone: o.customer_phone || '',
          paymentMode: 'online',
          salesperson: 'Online Store',
          productName: product?.name ?? it.name ?? 'Online item',
          sku: product?.sku ?? '',
          category: categoryName.get(String(product?.category_id)) ?? 'Uncategorized',
          cost: (Number(product?.purchase_price) || 0) * qty,
          ...this.split((Number(it.price) || 0) * qty * factor, rate, intra, 1),
        });
      }
    }
    const onlineUncosted = lines.filter(l => l.type === 'Online' && l.cost === 0).length;
    if (onlineUncosted > 0) warnings.push(`${onlineUncosted} online order line(s) have no purchase cost on the catalogue product, so their cost of goods is shown as 0 and profit on them is overstated.`);
    if (noPos > 0) warnings.push(`${noPos} sale line(s) had no place of supply recorded and were treated as intra-state.`);
    const deliveryCharges = (orders as any[]).reduce((s, o) => s + (Number(o.delivery_charge) || 0), 0);
    if (deliveryCharges > 0) warnings.push(`Online delivery charges (₹${Math.round(deliveryCharges).toLocaleString('en-IN')}) are not included — GST on delivery is not tracked separately.`);

    // ── Roll-ups ────────────────────────────────────────────────────────────
    type Bucket = { key: string; count: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number; invoiceValue: number };
    const bucket = (map: Map<string, Bucket>, key: string, l: GstLine) => {
      const b = map.get(key) ?? { key, count: 0, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, invoiceValue: 0 };
      b.count += 1; b.qty += l.qty;
      b.taxable += l.taxable; b.cgst += l.cgst; b.sgst += l.sgst; b.igst += l.igst;
      b.totalTax += l.cgst + l.sgst + l.igst; b.invoiceValue += l.total;
      map.set(key, b);
    };
    const finish = (m: Map<string, Bucket>, sort?: (a: Bucket, b: Bucket) => number) =>
      [...m.values()].map(b => ({ ...b, taxable: r2(b.taxable), cgst: r2(b.cgst), sgst: r2(b.sgst), igst: r2(b.igst), totalTax: r2(b.totalTax), invoiceValue: r2(b.invoiceValue) }))
        .sort(sort ?? ((a, b) => a.key.localeCompare(b.key)));

    const byRate = new Map<string, Bucket>(), byHsn = new Map<string, Bucket>(), byMonth = new Map<string, Bucket>(), byType = new Map<string, Bucket>();
    for (const l of lines) {
      bucket(byRate, `${l.rate}%`, l);
      bucket(byHsn, l.hsn, l);
      bucket(byMonth, new Date(l.date).toISOString().slice(0, 7), l);
      bucket(byType, l.type === 'B2B' ? 'B2B (customer GSTIN)' : l.type === 'B2C' ? 'B2C (store)' : l.type === 'Online' ? 'Online orders (B2C)' : 'Credit notes (returns)', l);
    }

    // One register row per invoice (an invoice can hold several items / rates).
    const inv = new Map<string, any>();
    for (const l of lines) {
      const key = `${l.type === 'Credit Note' ? 'CN' : 'INV'}|${l.invoiceNo}`;
      const row = inv.get(key) ?? {
        date: l.date, invoiceNo: l.type === 'Credit Note' ? `CN-${l.invoiceNo}` : l.invoiceNo, type: l.type, customer: l.customer,
        gstin: l.gstin, branch: l.branch, placeOfSupply: l.placeOfSupply,
        supplyType: l.intraState ? 'Intra-state (CGST+SGST)' : 'Inter-state (IGST)',
        rate: `${l.rate}%`, items: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, invoiceValue: 0,
      };
      if (!row.rate.split(', ').includes(`${l.rate}%`)) row.rate += `, ${l.rate}%`;
      row.items += Math.abs(l.qty);
      row.taxable += l.taxable; row.cgst += l.cgst; row.sgst += l.sgst; row.igst += l.igst;
      row.totalTax += l.cgst + l.sgst + l.igst; row.invoiceValue += l.total;
      inv.set(key, row);
    }
    const rows = [...inv.values()]
      .map(r => ({ ...r, taxable: r2(r.taxable), cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst), totalTax: r2(r.totalTax), invoiceValue: r2(r.invoiceValue) }))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));

    const sum = (f: (l: GstLine) => number) => r2(lines.reduce((s, l) => s + f(l), 0));
    const cnTax = r2(lines.filter(l => l.type === 'Credit Note').reduce((s, l) => s + l.cgst + l.sgst + l.igst, 0));
    const totals = {
      invoices: rows.filter(r => r.type !== 'Credit Note').length,
      creditNotes: rows.filter(r => r.type === 'Credit Note').length,
      taxable: sum(l => l.taxable),
      cgst: sum(l => l.cgst),
      sgst: sum(l => l.sgst),
      igst: sum(l => l.igst),
      totalTax: sum(l => l.cgst + l.sgst + l.igst),
      invoiceValue: sum(l => l.total),
      creditNoteTax: Math.abs(cnTax),
    };

    const report = {
      period: { from: from ?? null, to: to ?? null },
      totals,
      rows,
      byRate: finish(byRate),
      byHsn: finish(byHsn),
      byMonth: finish(byMonth),
      byType: finish(byType, (a, b) => b.invoiceValue - a.invoiceValue),
      warnings,
      basis: 'Net of returns. Taxable value and GST are extracted from the GST-inclusive price actually charged on each invoice.',
    };
    return { report, lines };
  }


  /**
   * Net sales, GST and cost for a period, from the same lines as the GST report. "Net" means the
   * revenue the business keeps: GST is collected on the government's behalf and is not income.
   */
  async getSalesBasis(from?: string, to?: string) {
    const { report, lines } = await this.getReportWithLines(from, to);
    const sum = (pick: (l: GstLine) => boolean) => {
      const ls = lines.filter(pick);
      const gross = r2(ls.reduce((s, l) => s + l.total, 0));
      const net = r2(ls.reduce((s, l) => s + l.taxable, 0));
      return { gross, net, gst: r2(gross - net), cost: r2(ls.reduce((s, l) => s + l.cost, 0)), units: ls.reduce((s, l) => s + l.qty, 0) };
    };
    return {
      lines,
      warnings: report.warnings,
      store: sum(l => l.type === 'B2B' || l.type === 'B2C'),
      // credit notes are negative lines; `returns` is reported as a positive amount to subtract
      returns: (() => { const r = sum(l => l.type === 'Credit Note'); return { gross: -r.gross, net: -r.net, gst: -r.gst, cost: -r.cost, units: -r.units }; })(),
      online: sum(l => l.type === 'Online'),
    };
  }
}
