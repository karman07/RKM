/**
 * End-to-end check of the report numbers against a hand-computed scenario.
 *
 * Seeds a throwaway LOCAL MongoDB (it drops the database it connects to — it refuses anything that isn't
 * localhost) with a few sales, an inter-state sale, a refunded return, a pending return, a previous-month
 * sale, and online orders (one with a coupon, one cancelled), then runs the real report services and
 * compares every key figure with what you get working it out by hand, plus the built-in reconciliation.
 *
 *   mongod --dbpath /tmp/rkm-verify --port 27555 &
 *   NODE_PATH=$PWD/node_modules npx ts-node --transpile-only -P tsconfig.json scripts/verify-reports.ts
 */
import mongoose from 'mongoose';
import { InventoryItem, InventoryItemSchema } from '../src/modules/inventory/schemas/inventory-item.schema';
import { OldGoldTransaction, OldGoldTransactionSchema } from '../src/modules/old-gold/schemas/old-gold-transaction.schema';
import { Subscription, SubscriptionSchema } from '../src/modules/gold-investment/schemas/subscription.schema';
import { InvestmentPlan, InvestmentPlanSchema } from '../src/modules/gold-investment/schemas/investment-plan.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../src/modules/purchase-orders/schemas/purchase-order.schema';
import { OnlineOrder, OnlineOrderSchema } from '../src/modules/online-orders/schemas/online-order.schema';
import { Branch, BranchSchema } from '../src/modules/branches/schemas/branch.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import { Reimbursement, ReimbursementSchema } from '../src/modules/hr/schemas/reimbursement.schema';
import { Incentive, IncentiveSchema } from '../src/modules/incentives/schemas/incentive.schema';
import { CustomerAdvance, CustomerAdvanceSchema } from '../src/modules/customers/schemas/customer-advance.schema';
import { Product, ProductSchema } from '../src/modules/products/schemas/product.schema';
import { Customer, CustomerSchema } from '../src/modules/customers/schemas/customer.schema';
import { Category, CategorySchema } from '../src/modules/categories/schemas/category.schema';
import { GstReportService } from '../src/modules/reports/gst-report.service';
import { AccountingService } from '../src/modules/reports/accounting.service';
import { ReportsService } from '../src/modules/reports/reports.service';
import { ReconciliationService } from '../src/modules/reports/reconciliation.service';

const M = (name: string, schema: any) => mongoose.model(name, schema);

async function main() {
  const uri = process.env.VERIFY_MONGO_URI || 'mongodb://127.0.0.1:27555/rkm_verify';
  if (!/127\.0\.0\.1|localhost/.test(uri)) throw new Error('Refusing to run: this script DROPS the database. Point VERIFY_MONGO_URI at a local throwaway mongod.');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const inv = M(InventoryItem.name, InventoryItemSchema), og = M(OldGoldTransaction.name, OldGoldTransactionSchema),
    sub = M(Subscription.name, SubscriptionSchema), plan = M(InvestmentPlan.name, InvestmentPlanSchema),
    po = M(PurchaseOrder.name, PurchaseOrderSchema), online = M(OnlineOrder.name, OnlineOrderSchema),
    branch = M(Branch.name, BranchSchema), user = M(User.name, UserSchema), reimb = M(Reimbursement.name, ReimbursementSchema),
    inc = M(Incentive.name, IncentiveSchema), adv = M(CustomerAdvance.name, CustomerAdvanceSchema),
    prod = M(Product.name, ProductSchema), cust = M(Customer.name, CustomerSchema), cat = M(Category.name, CategorySchema);

  const gst = new GstReportService(inv as any, online as any, prod as any, branch as any, cust as any, cat as any, user as any);
  const accounting = new AccountingService(inv as any, online as any, og as any, po as any, reimb as any, gst);
  const reports = new ReportsService(inv as any, og as any, sub as any, plan as any, po as any, online as any, user as any, reimb as any, inc as any, adv as any, gst);
  const recon = new ReconciliationService(reports, gst, accounting);

  // ── seed ──
  const [bA, bB] = await branch.insertMany([
    { name: 'Jujhar Nagar', code: 'BR-01', state: 'Punjab', gstin: '03AAAAA0000A1Z5', is_active: true, phone: '1', address: 'x' },
    { name: 'Delhi Store', code: 'BR-02', state: 'Delhi', is_active: true, phone: '2', address: 'y' },
  ] as any[]);
  const c1: any = await cat.create({ name: 'Rings', slug: 'rings' } as any);
  const p1: any = await prod.create({ name: 'Gold Ring', sku: 'GLD-RNG-1', category_id: String(c1._id), taxes: [{ name: 'SGST', percentage: 1.5 }, { name: 'CGST', percentage: 1.5 }], purchase_price: 80000, metal_type: 'gold', purity: '22K' } as any);
  await cust.insertMany([
    { name: 'Asha', phone: '+919000000001', place_of_supply: 'Punjab' },
    { name: 'Delhi Co', phone: '+919000000002', place_of_supply: 'Delhi', gst_no: '07BBBBB1111B1Z5' },
  ] as any[]);

  const d = (s: string) => new Date(s);
  const base: any = { product_id: p1._id, branch_id: bA._id, sold_at_branch_id: bA._id, purchase_price: 80000, is_deleted: false, source: 'test' };
  let n = 0;
  const mk = (o: any) => ({ ...base, barcode: `BC${++n}`, unique_item_code: `ITEM-${n}`, ...o });
  await inv.insertMany([
    mk({ status: 'sold', selling_price: 103000, sold_at: d('2026-10-05'), sale_reference: 'INV-1', sold_customer_name: 'Asha', sold_customer_phone: '+919000000001', payment_splits: [{ mode: 'cash', amount: 50000 }, { mode: 'upi', amount: 53000 }] }),
    mk({ status: 'sold', selling_price: 51500, purchase_price: 40000, sold_at: d('2026-10-06'), sale_reference: 'INV-2', sold_customer_name: 'Delhi Co', sold_customer_phone: '+919000000002', payment_splits: [{ mode: 'bank_transfer', amount: 51500 }] }),
    mk({ status: 'returned', selling_price: 103000, sold_at: d('2026-10-07'), returned_at: d('2026-10-09'), sale_reference: 'INV-3', sold_customer_name: 'Asha', sold_customer_phone: '+919000000001', return_refund_status: 'approved', return_admin_approved_value: 103000, payment_splits: [{ mode: 'cash', amount: 103000 }] }),
    mk({ status: 'returned', selling_price: 103000, sold_at: d('2026-10-08'), returned_at: d('2026-10-10'), sale_reference: 'INV-4', sold_customer_name: 'Asha', sold_customer_phone: '+919000000001', return_refund_status: 'proposed', payment_splits: [{ mode: 'cash', amount: 103000 }] }),
    mk({ status: 'sold', selling_price: 999999, sold_at: d('2026-09-10'), sale_reference: 'INV-OLD', sold_customer_name: 'Old', sold_customer_phone: '+919000000001' }), // previous month — must not appear
  ]);
  await online.insertMany([
    { order_number: 'ORD-1', customer_name: 'Web', customer_email: 'w@x.com', customer_phone: '+919000000009', items: [{ product_id: String(p1._id), name: 'Gold Ring', quantity: 1, price: 20600 }], subtotal: 20600, discount_amount: 600, coupon_code: 'X', delivery_charge: 99, total: 20099, status: 'confirmed', payment_status: 'paid', delivery_state: 'Punjab', createdAt: d('2026-10-08') },
    { order_number: 'ORD-CX', customer_name: 'Web', customer_email: 'w@x.com', items: [{ product_id: String(p1._id), name: 'Gold Ring', quantity: 1, price: 50000 }], subtotal: 50000, total: 50000, status: 'cancelled', payment_status: 'paid', delivery_state: 'Punjab', createdAt: d('2026-10-08') },
  ] as any[]);

  const from = '2026-10-01', to = '2026-10-31';
  const rep = await gst.getReport(from, to);
  const pnl = await reports.getProfitLoss(from, to);
  const rec = await recon.run(from, to);
  const journal = await accounting.getJournal(from, to);
  const reg = await reports.getSalesRegister(from, to);
  const bs = await reports.getBalanceSheet(to);

  const fails: string[] = [];
  const eq = (name: string, got: number, want: number) => { const ok = Math.abs(got - want) < 0.02; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got}, want ${want}`); if (!ok) fails.push(name); };

  // Expected (hand-computed):
  // store sales lines: INV-1 103000, INV-2 51500, INV-3 103000, INV-4 103000 (4 sales); credit note INV-3 103000.
  // taxable: 100000 + 50000 + 100000 + 100000 - 100000 = 250000 ; GST 7500 ; online taxable 20000/1.03 = 19417.48 tax 582.52
  eq('GST taxable (store+online)', rep.totals.taxable, 250000 + 19417.48);
  eq('GST total tax', rep.totals.totalTax, 7500 + 582.52);
  eq('GST IGST (INV-2 inter-state)', rep.totals.igst, 1500);
  eq('GST CGST (intra sales INV-1, INV-3, INV-4 − credit note INV-3 + online)', rep.totals.cgst, 1500 * 3 - 1500 + 291.26 + 1500 - 1500 + 0);
  eq('P&L in-store net sales', pnl.revenue[0].amount, 350000); // 100000+50000+100000+100000
  eq('P&L returns', pnl.revenue[2].amount, -100000);
  eq('P&L online net', pnl.revenue[1].amount, 19417.48);
  eq('P&L COGS store (4 sold − 1 returned back)', pnl.costOfGoodsSold[0].amount, 80000 + 40000 + 80000 + 80000 - 80000);
  eq('P&L online COGS (catalogue cost)', pnl.costOfGoodsSold[1].amount, 80000);
  eq('Sales register rows (4 units)', reg.rows.length, 4);
  eq('Journal balanced', journal.totals.debit, journal.totals.credit);
  console.log('warnings:', rep.warnings);
  console.log('reconciliation:'); rec.rows.forEach(r => console.log(`  ${r.status === 'OK' ? 'PASS' : 'FAIL'}  ${r.name}: expected ${r.expected} actual ${r.actual}`));
  if (!rec.totals.allOk) fails.push('reconciliation');
  console.log('balance sheet liabilities.gstPayable:', bs.liabilities.gstPayable);
  console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED');
  await mongoose.disconnect();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
