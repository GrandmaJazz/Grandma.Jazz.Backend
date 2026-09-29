require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const plan = require('../src/config/store-prices.json');
async function main() {
  console.table(plan.products.map(p => ({ product: p.name, THB: p.storePriceThb, previousUSD: p.previousPriceUsd, USD: p.priceUsd })));
  console.log('Unchanged pending POS verification:', plan.pendingVerification.join(', '));
  if (!process.argv.includes('--apply')) return;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required to apply the verified pricing plan.');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    // Preflight every intended change before writing; compare-and-set prevents overwriting later admin edits.
    const changes = [];
    for (const row of plan.products) {
      const p = await Product.findById(row.id);
      if (!p || p.name !== row.name) throw new Error(`Product identity mismatch: ${row.name}`);
      if (p.price === row.priceUsd) continue;
      if (p.price !== row.previousPriceUsd) throw new Error(`Price changed since review: ${row.name}`);
      changes.push({ id: row.id, field: 'price', before: p.price, after: row.priceUsd, name: row.name });
    }
    for (const row of plan.copyUpdates) {
      const p = await Product.findById(row.id);
      if (!p || p.name !== row.name) throw new Error(`Product identity mismatch: ${row.name}`);
      if (p.description === row.description) continue;
      if (p.description !== row.previousDescription) throw new Error(`Copy changed since review: ${row.name}`);
      changes.push({ id: row.id, field: 'description', before: p.description, after: row.description, name: row.name });
    }
    for (const change of changes) {
      const result = await Product.updateOne({ _id: change.id, [change.field]: change.before },
        { $set: { [change.field]: change.after } }, { runValidators: true });
      if (result.modifiedCount !== 1) throw new Error(`Concurrent edit detected: ${change.name}. Rerun to reconcile.`);
      const saved = await Product.findById(change.id);
      if (saved[change.field] !== change.after) throw new Error(`Readback failed: ${change.name}`);
      console.log(`Verified ${change.field}: ${change.name}`);
    }
    console.log('Verified all changes. Product weights, photos, categories and stock flags were preserved.');
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
