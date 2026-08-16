require('dotenv').config();
const db = require('../db');

(async () => {
  const [p] = await db.query(
    'SELECT id, local_id, sale_id, amount, currency, account_id, status, org_id, description FROM sale_payments WHERE id = 16989548'
  );
  console.log('=== payment row 16989548 ===');
  console.log(JSON.stringify(p, null, 1));

  const [s] = await db.query(
    'SELECT id, local_id, currency, account_id FROM sales WHERE local_id = 7851127048830142'
  );
  console.log('=== sale row ===');
  console.log(JSON.stringify(s, null, 1));

  const [rows] = await db.query(
    'SELECT p.id AS pid, p.local_id AS plocal, p.currency AS pcur, s.currency AS scur FROM sale_payments p JOIN sales s ON s.local_id = p.sale_id WHERE p.org_id = 300 AND p.status = 1 AND p.currency <> s.currency'
  );
  console.log('=== join result ===');
  console.log(JSON.stringify(rows, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
