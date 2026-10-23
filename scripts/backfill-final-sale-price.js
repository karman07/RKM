/**
 * One-off fill-in for sales made before invoices were frozen at sale time. For every sold / returned inventory item it sets:
 *   final_sale_price      what the customer was actually billed (from the bill's payment splits)
 *   sale_pricing_snapshot the invoice price breakdown, rebuilt from what was billed (so old invoices stop moving with gold rates)
 * Only those two fields are written, and only when they are missing or different.
 *
 *   node scripts/backfill-final-sale-price.js            # dry run: prints what would change and checks every invoice, writes nothing
 *   node scripts/backfill-final-sale-price.js --apply    # writes the two fields
 *
 * Run from the backend folder on the server, after the backend has been built (it uses the compiled helpers).
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { InventoryService } = require('../dist/src/modules/inventory/inventory.service');
const { PricingService } = require('../dist/src/modules/products/pricing.service');
const { computeFinalSalePrices, buildSaleSnapshot } = require('../dist/src/modules/inventory/sale-price');

const APPLY = process.argv.includes('--apply');
const rs = v => Math.round(Number(v) || 0);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const col = db.collection('inventory_items');

  const settings = await db.collection('settings').findOne({ singleton_key: { $exists: true } });
  const svc = Object.create(InventoryService.prototype);       // only its pure pricing helpers are used
  svc.pricingService = new PricingService();
  svc.settingsService = { get: async () => settings };

  const items = await col.find({ status: { $in: ['sold', 'returned'] }, is_deleted: { $ne: true } }).toArray();
  const products = await db.collection('products').find({ _id: { $in: items.map(i => i.product_id) } }).toArray();
  const pById = new Map(products.map(p => [String(p._id), p]));
  // Live (today's-rate) breakdown per item — only used for the metal / making / stone / tax proportions.
  const live = await svc.enrichItemsWithPricing(items.map(i => ({ ...i, sale_pricing_snapshot: null, product_id: pById.get(String(i.product_id)) || i.product_id })));
  const liveById = new Map(live.map(l => [String(l._id), l.pricing_breakdown]));

  const bills = new Map();
  for (const it of items) { const k = it.sale_reference || String(it._id); (bills.get(k) || bills.set(k, []).get(k)).push(it); }

  const ops = []; let bad = 0, changedBills = 0;
  for (const [ref, group] of bills) {
    const billed = computeFinalSalePrices(group.map(i => ({ id: String(i._id), selling_price: i.selling_price, payment_splits: i.payment_splits })));
    const paid = rs((group[0].payment_splits || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
    let invoiceNet = 0, wasStored = 0, billedSum = 0, invoiceGross = 0;
    for (const it of group) {
      const id = String(it._id);
      const waivers = rs(it.making_charges_discount) + rs(it.advance_making_charges_discount);
      const snap = buildSaleSnapshot({ liveBreakdown: liveById.get(id), billed: billed.get(id), waivers, adminPct: it.admin_discount, mgrPct: it.manager_discount });
      // What the invoice will print for this item: gross, less admin %, less manager % on the rest, less waivers.
      const gross = rs(snap.pricing_breakdown.final_price);
      const adm = rs(gross * (Number(it.admin_discount) || 0) / 100);
      const mgr = rs((gross - gross * (Number(it.admin_discount) || 0) / 100) * (Number(it.manager_discount) || 0) / 100);
      invoiceNet += gross - adm - mgr - waivers; invoiceGross += gross; wasStored += rs(it.selling_price); billedSum += billed.get(id);
      const set = {};
      if (it.final_sale_price !== billed.get(id)) set.final_sale_price = billed.get(id);
      if (!it.sale_pricing_snapshot) set.sale_pricing_snapshot = snap.pricing_breakdown;
      if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: it._id }, update: { $set: set } } });
    }
    const ok = Math.abs(invoiceNet - paid) <= group.length;   // ≤ ₹1 rounding per item
    if (!ok) bad++;
    if (wasStored !== billedSum || !ok) changedBills++;
    console.log(`${ref.padEnd(22)} items:${group.length}  invoice gross ₹${invoiceGross}  → net ₹${invoiceNet}  paid ₹${paid}  ${ok ? '✓ ties' : '✗ DOES NOT TIE'}`);
  }
  console.log(`\nbills: ${bills.size}  invoices that will tie to payments: ${bills.size - bad}  that will not: ${bad}`);
  console.log(`item writes pending: ${ops.length}`);
  if (APPLY && bad === 0 && ops.length) {
    const r = await col.bulkWrite(ops);
    console.log(`APPLIED — modified ${r.modifiedCount} item(s).`);
  } else if (APPLY && bad > 0) {
    console.log('NOT APPLIED — some invoices would not tie to payments; nothing written.');
  } else {
    console.log('Dry run only — nothing written. Re-run with --apply to write.');
  }
  await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.stack || e.message); process.exit(1); });
