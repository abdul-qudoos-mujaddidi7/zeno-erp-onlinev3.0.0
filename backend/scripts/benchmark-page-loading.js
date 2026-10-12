// Read-only repository benchmark. No account names, transaction values or credentials are emitted.
require('dotenv').config({ quiet: true });
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const accounts = require('../repositories/account.repository');
const items = require('../repositories/account-product-item.repository');

async function main() {
  const [[org]] = await db.execute('SELECT org_id FROM sales GROUP BY org_id ORDER BY COUNT(*) DESC LIMIT 1');
  const orgId = org.org_id;
  const [[product]] = await db.execute('SELECT product_id FROM sale_items WHERE org_id = ? AND status = 1 GROUP BY product_id ORDER BY COUNT(*) DESC LIMIT 1', [orgId]);
  const result = {};
  const tasks = {
    directionalBalances: () => accounts.findDirectionalBalances(db, { orgId }),
    saleProductPage: () => items.findByAccount(db, { orgId, itemType: 'sale' }),
    purchaseProductPage: () => items.findByAccount(db, { orgId, itemType: 'purchase' }),
    selectedProductPage: () => items.findByAccount(db, { orgId, itemType: 'sale', productId: product.product_id, pagination: { page: 1, limit: 200, offset: 0 } }),
  };
  for (const [name, run] of Object.entries(tasks)) {
    try {
    const times = [];
    let rows;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const response = await run();
      times.push(Math.round(performance.now() - start));
      rows = response.data || response;
    }
    result[name] = { timesMs: times, rows: rows.length, checksum: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    } catch (error) {
      result[name] = { error: error.message };
    }
  }
  const label = process.argv[2] || 'current';
  if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid benchmark label');
  const target = path.resolve(__dirname, '../../reports', `performance-${label}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
