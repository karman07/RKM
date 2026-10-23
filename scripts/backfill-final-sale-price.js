/**
 * One-off: sets `final_sale_price` (what the customer was actually billed) on every sold / returned inventory item,
 * derived from each bill's payment splits — the same rule the app now applies when a sale is saved.
 *
 *   node scripts/backfill-final-sale-price.js            # dry run: prints what would change, writes nothing
 *   node scripts/backfill-final-sale-price.js --apply    # writes final_sale_price (that field only)
 *
 * Run from the backend folder on the server, after the backend has been built (it uses the compiled helper).
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { computeFinalSalePrices } = require('../dist/src/modules/inventory/sale-price');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('inventory_items');
  const items = await col.find({ status: { $in: ['sold', 'returned'] }, is_deleted: { $ne: true } })
    .project({ sale_reference: 1, selling_price: 1, payment_splits: 1, final_sale_price: 1, status: 1 }).toArray();

  const bills = new Map();
  for (const it of items) {
    const key = it.sale_reference || String(it._id);
    if (!bills.has(key)) bills.set(key, []);
    bills.get(key).push(it);
  }

  let changedItems = 0, oldTotal = 0, newTotal = 0;
  const ops = [];
  for (const [ref, group] of bills) {
    const prices = computeFinalSalePrices(group.map(i => ({ id: String(i._id), selling_price: i.selling_price, payment_splits: i.payment_splits })));
    const before = group.reduce((s, i) => s + (Number(i.selling_price) || 0), 0);
    const after = [...prices.values()].reduce((s, v) => s + v, 0);
    oldTotal += before; newTotal += after;
    const differs = group.some(i => prices.get(String(i._id)) !== i.selling_price);
    if (differs) console.log(`${ref}: ${group.length} item(s)  stored ₹${before}  →  billed ₹${after}  (${after - before >= 0 ? '+' : ''}${after - before})`);
    for (const i of group) {
      const next = prices.get(String(i._id));
      if (next !== i.final_sale_price) { changedItems++; ops.push({ updateOne: { filter: { _id: i._id }, update: { $set: { final_sale_price: next } } } }); }
    }
  }
  console.log(`\nbills: ${bills.size}  items: ${items.length}  items needing the field: ${changedItems}`);
  console.log(`sum of stored selling_price: ₹${oldTotal}   sum of billed amounts: ₹${newTotal}   difference: ₹${newTotal - oldTotal}`);
  if (APPLY && ops.length) {
    const r = await col.bulkWrite(ops);
    console.log(`APPLIED — modified ${r.modifiedCount} item(s).`);
  } else {
    console.log(APPLY ? 'Nothing to write.' : 'Dry run only — nothing written. Re-run with --apply to write.');
  }
  await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
