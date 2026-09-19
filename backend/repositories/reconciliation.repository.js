/* eslint-disable no-restricted-syntax */
/*
 * reconciliation.repository.js
 *
 * READ-ONLY reconciliation queries used by the Step 0 production
 * safety baseline. This module exists to DISCOVER inconsistencies,
 * never to repair them.
 *
 * HARD RULES (do not relax):
 *   - Every statement is a SELECT. No INSERT / UPDATE / DELETE /
 *     REPLACE / ALTER / DROP / TRUNCATE anywhere in this file.
 *   - Every tenant-data query is scoped by org_id = ?.
 *   - No writes, no stock reconciliation, no journal posting.
 *
 * Each query carries a small marker comment such as
 *   recon:journals_unbalanced
 * so the unit tests can route a fake executor without a database.
 *
 * The signed stock-movement semantics below mirror
 * services/stock-transaction.service.js (INCOMING_STOCK_TYPES /
 * OUTGOING_STOCK_TYPES / stockEffect). They are duplicated on
 * purpose: touching the production service purely to export the
 * sets would be a behavioural risk during Step 0. If the service
 * lists change, this copy must be updated to match.
 */

const EPSILON = 1e-9;

/* Money comparisons use a cent-level tolerance to avoid float noise. */
const AMOUNT_EPSILON = 0.01;

const INCOMING_STOCK_TYPES = [
  'purchase',
  'sale_return',
  'adjustment_in',
  'transfer_in',
  'production_in',
  'waste_revert',
  'purchase_return_revert',
  'sale_revert',
  'inventory_record_return',
  'inventory_record_revert',
  'prescription_return',
  'prescription_revert',
  'transfer_out_revert',
];

const OUTGOING_STOCK_TYPES = [
  'sale',
  'purchase_return',
  'adjustment_out',
  'transfer_out',
  'production_out',
  'waste',
  'purchase_revert',
  'sale_return_revert',
  'inventory_record',
  'inventory_record_return_revert',
  'prescription',
  'prescription_return_revert',
  'transfer_in_revert',
];

function sqlInList(types) {
  return types.map((type) => `'${type}'`).join(', ');
}

const INCOMING_SQL = sqlInList(INCOMING_STOCK_TYPES);
const OUTGOING_SQL = sqlInList(OUTGOING_STOCK_TYPES);

/*
 * MySQL 8.0.22+ rejects DOUBLE binds in LIMIT, so callers bind the
 * limit as a string (same convention as stock-return-item.repository).
 */
function limitString(limit) {
  return String(Number(limit));
}

/*
 * ------------------------------ PART 1: journals ------------------------------
 */

async function findJournalTotals(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:journal_totals */
      SELECT
        j.currency,
        COUNT(*) AS journal_count,
        SUM(COALESCE(j.first_entry_debit, 0) + COALESCE(j.second_entry_debit, 0)) AS debit,
        SUM(COALESCE(j.first_entry_credit, 0) + COALESCE(j.second_entry_credit, 0)) AS credit
      FROM journals j
      WHERE j.org_id = ?
        AND j.status = 1
      GROUP BY j.currency
    `,
    [orgId],
  );

  return rows;
}

async function findUnbalancedJournals(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:journals_unbalanced */
      SELECT
        j.local_id AS id,
        j.date,
        j.reference_type,
        j.reference_id,
        j.currency,
        j.description,
        COALESCE(j.first_entry_debit, 0) + COALESCE(j.second_entry_debit, 0) AS total_debit,
        COALESCE(j.first_entry_credit, 0) + COALESCE(j.second_entry_credit, 0) AS total_credit
      FROM journals j
      WHERE j.org_id = ?
        AND j.status = 1
        AND ABS(
          (COALESCE(j.first_entry_debit, 0) + COALESCE(j.second_entry_debit, 0))
          - (COALESCE(j.first_entry_credit, 0) + COALESCE(j.second_entry_credit, 0))
        ) > ?
      ORDER BY j.local_id DESC
      LIMIT ?
    `,
    [orgId, EPSILON, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 2: accounts ------------------------------
 *
 * Two GROUP BY passes (first/second entry) mirror
 * account.repository.findCreditDebit so the reported balances match
 * the application's own calculation: balance = credit - debit.
 */

async function findJournalAccountTotalsFirstPass(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:account_totals_first */
      SELECT
        j.first_entry_account AS account_id,
        j.currency,
        SUM(COALESCE(j.first_entry_debit, 0)) AS debit,
        SUM(COALESCE(j.first_entry_credit, 0)) AS credit,
        COUNT(*) AS journal_count
      FROM journals j
      WHERE j.org_id = ?
        AND j.status = 1
        AND j.first_entry_account IS NOT NULL
      GROUP BY j.first_entry_account, j.currency
    `,
    [orgId],
  );

  return rows;
}

async function findJournalAccountTotalsSecondPass(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:account_totals_second */
      SELECT
        j.second_entry_account AS account_id,
        j.currency,
        SUM(COALESCE(j.second_entry_debit, 0)) AS debit,
        SUM(COALESCE(j.second_entry_credit, 0)) AS credit,
        COUNT(*) AS journal_count
      FROM journals j
      WHERE j.org_id = ?
        AND j.status = 1
        AND j.second_entry_account IS NOT NULL
      GROUP BY j.second_entry_account, j.currency
    `,
    [orgId],
  );

  return rows;
}

async function findAllAccounts(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:accounts_meta */
      SELECT
        a.local_id AS id,
        a.local_id,
        a.code,
        a.name,
        a.account_type_id,
        a.currency,
        a.balance,
        a.status
      FROM accounts a
      WHERE a.org_id = ?
        AND a.status = 1
      ORDER BY a.local_id ASC
    `,
    [orgId],
  );

  return rows;
}

/*
 * ------------------------------ PART 3/4: sales & purchases ------------------------------
 *
 * Expected remaining = total_amount - active payments - active returns,
 * which is exactly what journals/recomputeBillRemaining() writes.
 */

async function countConfirmedSales(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:sales_confirmed_count */
      SELECT COUNT(*) AS total
      FROM sales s
      WHERE s.org_id = ?
        AND s.status = 1
        AND LOWER(TRIM(COALESCE(s.invoice_status, ''))) = 'confirmed'
    `,
    [orgId],
  );

  return Number(rows[0]?.total) || 0;
}

async function findSaleRemainingMismatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:sales_remaining */
      SELECT
        s.local_id AS id,
        s.local_id,
        s.invoice_number,
        s.currency,
        s.invoice_status,
        s.total_amount,
        s.remaining AS stored_remaining,
        COALESCE(p.paid, 0) AS active_payments,
        COALESCE(r.returned, 0) AS active_returns,
        (
          COALESCE(s.total_amount, 0)
          - COALESCE(p.paid, 0)
          - COALESCE(r.returned, 0)
        ) AS expected_remaining
      FROM sales s
      LEFT JOIN (
        SELECT sale_id, SUM(COALESCE(amount, 0)) AS paid
        FROM sale_payments
        WHERE org_id = ?
          AND status = 1
        GROUP BY sale_id
      ) p ON p.sale_id = s.local_id
      LEFT JOIN (
        SELECT sale_id, SUM(COALESCE(total_amount, 0)) AS returned
        FROM sale_returns
        WHERE org_id = ?
          AND status = 1
        GROUP BY sale_id
      ) r ON r.sale_id = s.local_id
      WHERE s.org_id = ?
        AND s.status = 1
        AND LOWER(TRIM(COALESCE(s.invoice_status, ''))) = 'confirmed'
        AND ABS(
          COALESCE(s.remaining, 0)
          - (
            COALESCE(s.total_amount, 0)
            - COALESCE(p.paid, 0)
            - COALESCE(r.returned, 0)
          )
        ) > ?
      ORDER BY s.local_id DESC
      LIMIT ?
    `,
    [orgId, orgId, orgId, AMOUNT_EPSILON, limitString(limit)],
  );

  return rows;
}

async function countConfirmedPurchases(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:purchases_confirmed_count */
      SELECT COUNT(*) AS total
      FROM purchases p
      WHERE p.org_id = ?
        AND p.status = 1
        AND LOWER(TRIM(COALESCE(p.bill_status, ''))) = 'confirmed'
    `,
    [orgId],
  );

  return Number(rows[0]?.total) || 0;
}

async function findPurchaseRemainingMismatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:purchases_remaining */
      SELECT
        p.local_id AS id,
        p.local_id,
        p.bill_number,
        p.currency,
        p.bill_status,
        p.total_amount,
        p.remaining AS stored_remaining,
        COALESCE(pay.paid, 0) AS active_payments,
        COALESCE(ret.returned, 0) AS active_returns,
        (
          COALESCE(p.total_amount, 0)
          - COALESCE(pay.paid, 0)
          - COALESCE(ret.returned, 0)
        ) AS expected_remaining
      FROM purchases p
      LEFT JOIN (
        SELECT purchase_id, SUM(COALESCE(amount, 0)) AS paid
        FROM purchase_payments
        WHERE org_id = ?
          AND status = 1
        GROUP BY purchase_id
      ) pay ON pay.purchase_id = p.local_id
      LEFT JOIN (
        SELECT purchase_id, SUM(COALESCE(total_amount, 0)) AS returned
        FROM purchase_returns
        WHERE org_id = ?
          AND status = 1
        GROUP BY purchase_id
      ) ret ON ret.purchase_id = p.local_id
      WHERE p.org_id = ?
        AND p.status = 1
        AND LOWER(TRIM(COALESCE(p.bill_status, ''))) = 'confirmed'
        AND ABS(
          COALESCE(p.remaining, 0)
          - (
            COALESCE(p.total_amount, 0)
            - COALESCE(pay.paid, 0)
            - COALESCE(ret.returned, 0)
          )
        ) > ?
      ORDER BY p.local_id DESC
      LIMIT ?
    `,
    [orgId, orgId, orgId, AMOUNT_EPSILON, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 5: product / warehouse stock ------------------------------
 */

async function findProductStock(executor, { orgId, limit, productId }) {
  const conditions = [
    'p.org_id = ?',
    'p.status = 1',
  ];
  const values = [orgId, orgId];

  if (productId) {
    conditions.push('p.local_id = ?');
    values.push(productId);
  }

  values.push(limitString(limit));

  const [rows] = await executor.execute(
    `
      /* recon:product_stock */
      SELECT
        p.local_id AS product_id,
        p.local_id,
        p.name,
        p.code,
        p.product_unit_id,
        p.quantity AS product_quantity,
        COALESCE(w.warehouse_quantity, 0) AS warehouse_quantity,
        COALESCE(w.row_count, 0) AS warehouse_row_count
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          SUM(COALESCE(quantity, 0)) AS warehouse_quantity,
          COUNT(*) AS row_count
        FROM warehouse_products
        WHERE org_id = ?
          AND status = 1
        GROUP BY product_id
      ) w ON w.product_id = p.local_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.local_id ASC
      LIMIT ?
    `,
    values,
  );

  return rows;
}

async function findDuplicateWarehouseRows(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:warehouse_duplicates */
      SELECT
        w.warehouse_id,
        w.product_id,
        COUNT(*) AS row_count,
        SUM(COALESCE(w.quantity, 0)) AS total_quantity
      FROM warehouse_products w
      WHERE w.org_id = ?
        AND w.status = 1
      GROUP BY w.warehouse_id, w.product_id
      HAVING COUNT(*) > 1
      ORDER BY row_count DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findNegativeWarehouseQuantities(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:warehouse_negative */
      SELECT
        w.local_id AS id,
        w.warehouse_id,
        w.product_id,
        w.quantity
      FROM warehouse_products w
      WHERE w.org_id = ?
        AND w.status = 1
        AND COALESCE(w.quantity, 0) < 0
      ORDER BY w.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOrphanWarehouseRows(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:warehouse_orphans */
      SELECT
        w.local_id AS id,
        w.warehouse_id,
        w.product_id,
        w.quantity
      FROM warehouse_products w
      LEFT JOIN products p
        ON p.org_id = w.org_id
       AND p.local_id = w.product_id
       AND p.status = 1
      WHERE w.org_id = ?
        AND w.status = 1
        AND p.local_id IS NULL
      ORDER BY w.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findWarehouseTotals(executor, { orgId, productId }) {
  const conditions = [
    'w.org_id = ?',
    'w.status = 1',
  ];
  const values = [orgId];

  if (productId) {
    conditions.push('w.product_id = ?');
    values.push(productId);
  }

  const [rows] = await executor.execute(
    `
      /* recon:warehouse_totals */
      SELECT
        w.product_id,
        w.warehouse_id,
        SUM(COALESCE(w.quantity, 0)) AS quantity,
        COUNT(*) AS row_count
      FROM warehouse_products w
      WHERE ${conditions.join(' AND ')}
      GROUP BY w.product_id, w.warehouse_id
    `,
    values,
  );

  return rows;
}

/*
 * ------------------------------ PART 6: FIFO / LIFO batches ------------------------------
 */

async function findBatchTotalsByProduct(executor, { orgId, productId }) {
  const conditions = [
    'b.org_id = ?',
    'b.status = 1',
  ];
  const values = [orgId];

  if (productId) {
    conditions.push('b.product_id = ?');
    values.push(productId);
  }

  const [rows] = await executor.execute(
    `
      /* recon:batch_totals_product */
      SELECT
        b.product_id,
        SUM(COALESCE(b.quantity_remaining, 0)) AS batch_remaining,
        SUM(COALESCE(b.quantity_in, 0)) AS batch_in,
        COUNT(*) AS batch_count
      FROM stock_batches b
      WHERE ${conditions.join(' AND ')}
      GROUP BY b.product_id
    `,
    values,
  );

  return rows;
}

async function findBatchTotalsByWarehouse(executor, { orgId, productId }) {
  const conditions = [
    'b.org_id = ?',
    'b.status = 1',
  ];
  const values = [orgId];

  if (productId) {
    conditions.push('b.product_id = ?');
    values.push(productId);
  }

  const [rows] = await executor.execute(
    `
      /* recon:batch_totals_warehouse */
      SELECT
        b.product_id,
        b.warehouse_id,
        SUM(COALESCE(b.quantity_remaining, 0)) AS batch_remaining,
        COUNT(*) AS batch_count
      FROM stock_batches b
      WHERE ${conditions.join(' AND ')}
      GROUP BY b.product_id, b.warehouse_id
    `,
    values,
  );

  return rows;
}

async function findNegativeBatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:batch_negative */
      SELECT
        b.local_id AS id,
        b.warehouse_id,
        b.product_id,
        b.source_type,
        b.source_id,
        b.quantity_in,
        b.quantity_remaining
      FROM stock_batches b
      WHERE b.org_id = ?
        AND b.status = 1
        AND COALESCE(b.quantity_remaining, 0) < 0
      ORDER BY b.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOverReceivedBatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:batch_over_received */
      SELECT
        b.local_id AS id,
        b.warehouse_id,
        b.product_id,
        b.source_type,
        b.source_id,
        b.quantity_in,
        b.quantity_remaining
      FROM stock_batches b
      WHERE b.org_id = ?
        AND b.status = 1
        AND COALESCE(b.quantity_remaining, 0) > COALESCE(b.quantity_in, 0)
      ORDER BY b.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOrphanConsumptionBatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:consumption_orphan_batch */
      SELECT
        c.local_id AS id,
        c.stock_batch_id,
        c.operation_type,
        c.operation_id,
        c.product_id,
        c.warehouse_id,
        c.quantity
      FROM batch_consumptions c
      LEFT JOIN stock_batches b
        ON b.org_id = c.org_id
       AND b.local_id = c.stock_batch_id
      WHERE c.org_id = ?
        AND c.status = 1
        AND b.local_id IS NULL
      ORDER BY c.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOrphanConsumptionSales(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:consumption_orphan_sale */
      SELECT
        c.local_id AS id,
        c.sale_id,
        c.operation_type,
        c.operation_id,
        c.product_id,
        c.quantity
      FROM batch_consumptions c
      LEFT JOIN sales s
        ON s.org_id = c.org_id
       AND s.local_id = c.sale_id
      WHERE c.org_id = ?
        AND c.status = 1
        AND c.sale_id IS NOT NULL
        AND s.local_id IS NULL
      ORDER BY c.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

/*
 * Net consumption per batch should equal quantity_in - quantity_remaining.
 * sale_return rows restore stock, so they subtract from the net.
 */
async function findBatchConsumptionMismatches(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:batch_consumption_mismatch */
      SELECT
        c.stock_batch_id,
        b.product_id,
        b.warehouse_id,
        b.quantity_in,
        b.quantity_remaining,
        SUM(
          CASE
            WHEN c.operation_type = 'sale_return'
              THEN -COALESCE(c.quantity, 0)
            ELSE COALESCE(c.quantity, 0)
          END
        ) AS net_consumed
      FROM batch_consumptions c
      INNER JOIN stock_batches b
        ON b.org_id = c.org_id
       AND b.local_id = c.stock_batch_id
      WHERE c.org_id = ?
        AND c.status = 1
        AND c.operation_type IN ('sale', 'WASTE', 'TRANSFER', 'purchase_return', 'sale_return')
      GROUP BY
        c.stock_batch_id,
        b.product_id,
        b.warehouse_id,
        b.quantity_in,
        b.quantity_remaining
      HAVING ABS(
        SUM(
          CASE
            WHEN c.operation_type = 'sale_return'
              THEN -COALESCE(c.quantity, 0)
            ELSE COALESCE(c.quantity, 0)
          END
        ) - (COALESCE(b.quantity_in, 0) - COALESCE(b.quantity_remaining, 0))
      ) > ?
      ORDER BY c.stock_batch_id DESC
      LIMIT ?
    `,
    [orgId, EPSILON, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 7: stock transactions ------------------------------
 */

async function findStockTransactionTotals(executor, { orgId, limit, productId }) {
  const conditions = [
    'st.org_id = ?',
    'st.status = 1',
  ];
  const values = [orgId];

  if (productId) {
    conditions.push('st.product_id = ?');
    values.push(productId);
  }

  values.push(limitString(limit));

  const [rows] = await executor.execute(
    `
      /* recon:stock_tx_totals */
      SELECT
        st.product_id,
        p.name,
        p.code,
        p.product_unit_id,
        p.quantity AS product_quantity,
        SUM(
          CASE
            WHEN st.transaction_type IN (${INCOMING_SQL})
              THEN ABS(COALESCE(st.quantity, 0))
            WHEN st.transaction_type IN (${OUTGOING_SQL})
              THEN -ABS(COALESCE(st.quantity, 0))
            ELSE COALESCE(st.quantity, 0)
          END
        ) AS movement_quantity
      FROM stock_transactions st
      LEFT JOIN products p
        ON p.org_id = st.org_id
       AND p.local_id = st.product_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY
        st.product_id,
        p.name,
        p.code,
        p.product_unit_id,
        p.quantity
      ORDER BY st.product_id ASC
      LIMIT ?
    `,
    values,
  );

  return rows;
}

/*
 * ------------------------------ PART 8: payment integrity ------------------------------
 */

async function findOrphanSalePayments(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:sale_payment_orphans */
      SELECT
        sp.local_id AS id,
        sp.sale_id,
        sp.account_id,
        sp.amount,
        sp.currency,
        sp.payment_date,
        sp.status
      FROM sale_payments sp
      LEFT JOIN sales s
        ON s.org_id = sp.org_id
       AND s.local_id = sp.sale_id
      WHERE sp.org_id = ?
        AND s.local_id IS NULL
      ORDER BY sp.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOrphanPurchasePayments(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:purchase_payment_orphans */
      SELECT
        pp.local_id AS id,
        pp.purchase_id,
        pp.account_id,
        pp.amount,
        pp.currency,
        pp.payment_date,
        pp.status
      FROM purchase_payments pp
      LEFT JOIN purchases p
        ON p.org_id = pp.org_id
       AND p.local_id = pp.purchase_id
      WHERE pp.org_id = ?
        AND p.local_id IS NULL
      ORDER BY pp.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findActivePaymentsOnInactiveParents(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:payment_parent_inactive */
      SELECT
        'sale' AS parent_type,
        sp.local_id AS id,
        sp.sale_id AS parent_id,
        sp.account_id,
        sp.amount,
        sp.currency
      FROM sale_payments sp
      INNER JOIN sales s
        ON s.org_id = sp.org_id
       AND s.local_id = sp.sale_id
      WHERE sp.org_id = ?
        AND sp.status = 1
        AND s.status = 0
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pp.local_id AS id,
        pp.purchase_id AS parent_id,
        pp.account_id,
        pp.amount,
        pp.currency
      FROM purchase_payments pp
      INNER JOIN purchases p
        ON p.org_id = pp.org_id
       AND p.local_id = pp.purchase_id
      WHERE pp.org_id = ?
        AND pp.status = 1
        AND p.status = 0
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findJournalsReferencingMissingPayments(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:journal_missing_payment */
      SELECT
        j.local_id AS id,
        j.reference_type,
        j.reference_id,
        j.date,
        j.currency,
        j.description
      FROM journals j
      LEFT JOIN sale_payments sp
        ON j.reference_type = 'sale_payment'
       AND sp.org_id = j.org_id
       AND sp.local_id = j.reference_id
      LEFT JOIN purchase_payments pp
        ON j.reference_type = 'purchase_payment'
       AND pp.org_id = j.org_id
       AND pp.local_id = j.reference_id
      WHERE j.org_id = ?
        AND j.status = 1
        AND (
          (j.reference_type = 'sale_payment' AND sp.local_id IS NULL)
          OR (j.reference_type = 'purchase_payment' AND pp.local_id IS NULL)
        )
      ORDER BY j.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

/*
 * Payments with no related journal.
 *
 * Direct payment-form rows legitimately have no journal in the current
 * design, so callers must treat this list as informational. A payment
 * is considered journal-linked when either an active journal references
 * it by (reference_type, reference_id), or it was created by
 * journal.service.js and carries the `journal:<id>` tag in its
 * description.
 */
async function findPaymentsWithoutJournal(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:payments_no_journal */
      SELECT
        'sale' AS parent_type,
        sp.local_id AS id,
        sp.sale_id AS parent_id,
        sp.account_id,
        sp.amount,
        sp.currency,
        sp.payment_date,
        sp.description
      FROM sale_payments sp
      WHERE sp.org_id = ?
        AND sp.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = sp.org_id
            AND j.status = 1
            AND (
              (j.reference_type = 'sale_payment' AND j.reference_id = sp.local_id)
              OR (
                sp.description LIKE '%journal:%'
                AND j.local_id = CAST(
                  SUBSTRING_INDEX(
                    SUBSTRING_INDEX(sp.description, 'journal:', -1),
                    ' ',
                    1
                  ) AS UNSIGNED
                )
              )
            )
        )
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pp.local_id AS id,
        pp.purchase_id AS parent_id,
        pp.account_id,
        pp.amount,
        pp.currency,
        pp.payment_date,
        pp.description
      FROM purchase_payments pp
      WHERE pp.org_id = ?
        AND pp.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = pp.org_id
            AND j.status = 1
            AND (
              (j.reference_type = 'purchase_payment' AND j.reference_id = pp.local_id)
              OR (
                pp.description LIKE '%journal:%'
                AND j.local_id = CAST(
                  SUBSTRING_INDEX(
                    SUBSTRING_INDEX(pp.description, 'journal:', -1),
                    ' ',
                    1
                  ) AS UNSIGNED
                )
              )
            )
        )
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findPossibleDuplicatePayments(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:duplicate_payments */
      SELECT
        'sale' AS parent_type,
        sp.sale_id AS parent_id,
        sp.account_id,
        sp.amount,
        sp.currency,
        sp.payment_date,
        COUNT(*) AS row_count,
        GROUP_CONCAT(sp.local_id ORDER BY sp.local_id ASC) AS payment_ids
      FROM sale_payments sp
      WHERE sp.org_id = ?
        AND sp.status = 1
      GROUP BY sp.sale_id, sp.account_id, sp.amount, sp.currency, sp.payment_date
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pp.purchase_id AS parent_id,
        pp.account_id,
        pp.amount,
        pp.currency,
        pp.payment_date,
        COUNT(*) AS row_count,
        GROUP_CONCAT(pp.local_id ORDER BY pp.local_id ASC) AS payment_ids
      FROM purchase_payments pp
      WHERE pp.org_id = ?
        AND pp.status = 1
      GROUP BY pp.purchase_id, pp.account_id, pp.amount, pp.currency, pp.payment_date
      HAVING COUNT(*) > 1
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 9: return integrity ------------------------------
 */

async function findOrphanSaleReturns(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:sale_return_orphans */
      SELECT
        sr.local_id AS id,
        sr.sale_id,
        sr.return_number,
        sr.total_amount,
        sr.currency,
        sr.return_date
      FROM sale_returns sr
      LEFT JOIN sales s
        ON s.org_id = sr.org_id
       AND s.local_id = sr.sale_id
      WHERE sr.org_id = ?
        AND sr.status = 1
        AND s.local_id IS NULL
      ORDER BY sr.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findOrphanPurchaseReturns(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:purchase_return_orphans */
      SELECT
        pr.local_id AS id,
        pr.purchase_id,
        pr.return_number,
        pr.total_amount,
        pr.currency,
        pr.return_date
      FROM purchase_returns pr
      LEFT JOIN purchases p
        ON p.org_id = pr.org_id
       AND p.local_id = pr.purchase_id
      WHERE pr.org_id = ?
        AND pr.status = 1
        AND p.local_id IS NULL
      ORDER BY pr.local_id DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

async function findActiveReturnsOnInactiveParents(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:return_parent_inactive */
      SELECT
        'sale' AS parent_type,
        sr.local_id AS id,
        sr.sale_id AS parent_id,
        sr.total_amount,
        sr.currency
      FROM sale_returns sr
      INNER JOIN sales s
        ON s.org_id = sr.org_id
       AND s.local_id = sr.sale_id
      WHERE sr.org_id = ?
        AND sr.status = 1
        AND s.status = 0
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pr.local_id AS id,
        pr.purchase_id AS parent_id,
        pr.total_amount,
        pr.currency
      FROM purchase_returns pr
      INNER JOIN purchases p
        ON p.org_id = pr.org_id
       AND p.local_id = pr.purchase_id
      WHERE pr.org_id = ?
        AND pr.status = 1
        AND p.status = 0
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findSaleReturnQuantityExceedingSold(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:sale_return_qty_exceeds */
      SELECT
        sr.sale_id,
        ri.product_id,
        SUM(COALESCE(ri.quantity, 0)) AS returned_quantity,
        si.sold_quantity
      FROM sale_return_items ri
      INNER JOIN sale_returns sr
        ON sr.org_id = ri.org_id
       AND sr.local_id = ri.sale_return_id
       AND sr.status = 1
      INNER JOIN (
        SELECT
          sale_id,
          product_id,
          SUM(COALESCE(quantity, 0)) AS sold_quantity
        FROM sale_items
        WHERE org_id = ?
          AND status = 1
        GROUP BY sale_id, product_id
      ) si
        ON si.sale_id = sr.sale_id
       AND si.product_id = ri.product_id
      WHERE ri.org_id = ?
        AND ri.status = 1
      GROUP BY sr.sale_id, ri.product_id, si.sold_quantity
      HAVING SUM(COALESCE(ri.quantity, 0)) > si.sold_quantity + ?
      ORDER BY sr.sale_id DESC
      LIMIT ?
    `,
    [orgId, orgId, EPSILON, limitString(limit)],
  );

  return rows;
}

async function findPurchaseReturnQuantityExceedingPurchased(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:purchase_return_qty_exceeds */
      SELECT
        pr.purchase_id,
        ri.product_id,
        SUM(COALESCE(ri.quantity, 0)) AS returned_quantity,
        pi.purchased_quantity
      FROM purchase_return_items ri
      INNER JOIN purchase_returns pr
        ON pr.org_id = ri.org_id
       AND pr.local_id = ri.purchase_return_id
       AND pr.status = 1
      INNER JOIN (
        SELECT
          purchase_id,
          product_id,
          SUM(COALESCE(quantity, 0)) AS purchased_quantity
        FROM purchase_items
        WHERE org_id = ?
          AND status = 1
        GROUP BY purchase_id, product_id
      ) pi
        ON pi.purchase_id = pr.purchase_id
       AND pi.product_id = ri.product_id
      WHERE ri.org_id = ?
        AND ri.status = 1
      GROUP BY pr.purchase_id, ri.product_id, pi.purchased_quantity
      HAVING SUM(COALESCE(ri.quantity, 0)) > pi.purchased_quantity + ?
      ORDER BY pr.purchase_id DESC
      LIMIT ?
    `,
    [orgId, orgId, EPSILON, limitString(limit)],
  );

  return rows;
}

async function findReturnsMissingJournal(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:return_missing_journal */
      SELECT
        'sale' AS parent_type,
        sr.local_id AS id,
        sr.sale_id AS parent_id,
        sr.total_amount,
        sr.currency
      FROM sale_returns sr
      WHERE sr.org_id = ?
        AND sr.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = sr.org_id
            AND j.status = 1
            AND j.reference_type = 'sale_return'
            AND j.reference_id = sr.local_id
        )
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pr.local_id AS id,
        pr.purchase_id AS parent_id,
        pr.total_amount,
        pr.currency
      FROM purchase_returns pr
      WHERE pr.org_id = ?
        AND pr.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = pr.org_id
            AND j.status = 1
            AND j.reference_type = 'purchase_return'
            AND j.reference_id = pr.local_id
        )
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findReturnsMissingStockMovement(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:return_missing_movement */
      SELECT
        'sale' AS parent_type,
        sr.local_id AS id,
        sr.sale_id AS parent_id,
        sr.total_amount,
        sr.currency
      FROM sale_returns sr
      WHERE sr.org_id = ?
        AND sr.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM stock_transactions st
          WHERE st.org_id = sr.org_id
            AND st.status = 1
            AND st.reference_type = 'sale_return'
            AND st.reference_id = sr.local_id
        )
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pr.local_id AS id,
        pr.purchase_id AS parent_id,
        pr.total_amount,
        pr.currency
      FROM purchase_returns pr
      WHERE pr.org_id = ?
        AND pr.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM stock_transactions st
          WHERE st.org_id = pr.org_id
            AND st.status = 1
            AND st.reference_type = 'purchase_return'
            AND st.reference_id = pr.local_id
        )
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 10: soft-delete integrity ------------------------------
 */

async function findInactiveReturnActiveJournal(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:inactive_return_active_journal */
      SELECT
        'sale' AS parent_type,
        sr.local_id AS id,
        sr.sale_id AS parent_id
      FROM sale_returns sr
      WHERE sr.org_id = ?
        AND sr.status = 0
        AND EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = sr.org_id
            AND j.status = 1
            AND j.reference_type = 'sale_return'
            AND j.reference_id = sr.local_id
        )
      UNION ALL
      SELECT
        'purchase' AS parent_type,
        pr.local_id AS id,
        pr.purchase_id AS parent_id
      FROM purchase_returns pr
      WHERE pr.org_id = ?
        AND pr.status = 0
        AND EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.org_id = pr.org_id
            AND j.status = 1
            AND j.reference_type = 'purchase_return'
            AND j.reference_id = pr.local_id
        )
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findInactiveProductsWithActiveStock(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:inactive_product_active_stock */
      SELECT
        p.local_id AS product_id,
        p.quantity AS product_quantity,
        COALESCE(w.warehouse_quantity, 0) AS warehouse_quantity,
        COALESCE(w.row_count, 0) AS warehouse_row_count
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          SUM(COALESCE(quantity, 0)) AS warehouse_quantity,
          COUNT(*) AS row_count
        FROM warehouse_products
        WHERE org_id = ?
          AND status = 1
        GROUP BY product_id
      ) w ON w.product_id = p.local_id
      WHERE p.org_id = ?
        AND p.status = 0
        AND (COALESCE(p.quantity, 0) <> 0 OR COALESCE(w.warehouse_quantity, 0) <> 0)
      ORDER BY p.local_id DESC
      LIMIT ?
    `,
    [orgId, orgId, limitString(limit)],
  );

  return rows;
}

async function findInactiveAccountsWithActiveJournals(executor, { orgId, limit }) {
  const [rows] = await executor.execute(
    `
      /* recon:inactive_account_active_journals */
      SELECT
        a.local_id AS account_id,
        a.code,
        a.name,
        COUNT(j.local_id) AS journal_count
      FROM accounts a
      INNER JOIN journals j
        ON j.org_id = a.org_id
       AND j.status = 1
       AND (j.first_entry_account = a.local_id OR j.second_entry_account = a.local_id)
      WHERE a.org_id = ?
        AND a.status = 0
      GROUP BY a.local_id, a.code, a.name
      ORDER BY journal_count DESC
      LIMIT ?
    `,
    [orgId, limitString(limit)],
  );

  return rows;
}

/*
 * ------------------------------ PART 11: date quality ------------------------------
 */

const RECONCILED_DATE_FIELDS = [
  { table: 'journals', column: 'date' },
  { table: 'sales', column: 'invoice_date' },
  { table: 'purchases', column: 'bill_date' },
  { table: 'sale_payments', column: 'payment_date' },
  { table: 'purchase_payments', column: 'payment_date' },
  { table: 'sale_returns', column: 'return_date' },
  { table: 'purchase_returns', column: 'return_date' },
  { table: 'stock_transactions', column: 'date' },
];

async function findDateQuality(executor, { orgId }) {
  const rows = [];

  for (const field of RECONCILED_DATE_FIELDS) {
    // table / column come from the fixed internal list above, never user input.
    const [result] = await executor.execute(
      `
        /* recon:date_quality */
        SELECT
          COUNT(*) AS total_rows,
          SUM(CASE WHEN ${field.column} IS NULL THEN 1 ELSE 0 END) AS null_count,
          SUM(
            CASE
              WHEN ${field.column} IS NOT NULL
                AND CAST(${field.column} AS CHAR) NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN 1
              ELSE 0
            END
          ) AS malformed_count,
          MIN(${field.column}) AS min_value,
          MAX(${field.column}) AS max_value
        FROM ${field.table}
        WHERE org_id = ?
          AND status = 1
      `,
      [orgId],
    );

    rows.push({
      table: field.table,
      column: field.column,
      ...(result[0] || {}),
    });
  }

  return rows;
}

async function findFinancialDateColumns(executor) {
  const [rows] = await executor.execute(
    `
      /* recon:schema_columns */
      SELECT
        c.table_name,
        c.column_name,
        c.column_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = DATABASE()
        AND c.table_name IN (
          'journals',
          'sales',
          'purchases',
          'sale_payments',
          'purchase_payments',
          'sale_returns',
          'purchase_returns',
          'stock_transactions'
        )
        AND c.column_name IN (
          'date',
          'invoice_date',
          'bill_date',
          'payment_date',
          'return_date',
          'created_at'
        )
      ORDER BY c.table_name ASC, c.ordinal_position ASC
    `,
    [],
  );

  return rows;
}

/*
 * ------------------------------ PART 12: multi-currency ------------------------------
 */

async function findInventoryMethod(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:inventory_method */
      SELECT o.inventory_method
      FROM organizations o
      WHERE o.id = ?
      LIMIT 1
    `,
    [orgId],
  );

  return String(rows[0]?.inventory_method || 'CLASSIC').trim().toUpperCase();
}

async function findCurrencies(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:currencies */
      SELECT
        c.code,
        c.isDefault,
        c.exchangeRate,
        c.exchangeRateDate
      FROM currencies c
      WHERE c.org_id = ?
        AND c.status = 1
      ORDER BY c.code ASC
    `,
    [orgId],
  );

  return rows;
}

async function findCrossCurrencyJournals(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      /* recon:cross_currency */
      SELECT
        'sale' AS reference_kind,
        COUNT(*) AS mismatch_count
      FROM journals j
      INNER JOIN sales s
        ON s.org_id = j.org_id
       AND s.local_id = j.reference_id
      WHERE j.org_id = ?
        AND j.status = 1
        AND j.reference_type = 'sale'
        AND j.currency IS NOT NULL
        AND s.currency IS NOT NULL
        AND j.currency <> s.currency
      UNION ALL
      SELECT
        'purchase' AS reference_kind,
        COUNT(*) AS mismatch_count
      FROM journals j
      INNER JOIN purchases p
        ON p.org_id = j.org_id
       AND p.local_id = j.reference_id
      WHERE j.org_id = ?
        AND j.status = 1
        AND j.reference_type = 'purchase'
        AND j.currency IS NOT NULL
        AND p.currency IS NOT NULL
        AND j.currency <> p.currency
    `,
    [orgId, orgId],
  );

  return rows;
}

module.exports = {
  EPSILON,
  AMOUNT_EPSILON,
  INCOMING_STOCK_TYPES,
  OUTGOING_STOCK_TYPES,
  RECONCILED_DATE_FIELDS,
  findJournalTotals,
  findUnbalancedJournals,
  findJournalAccountTotalsFirstPass,
  findJournalAccountTotalsSecondPass,
  findAllAccounts,
  countConfirmedSales,
  findSaleRemainingMismatches,
  countConfirmedPurchases,
  findPurchaseRemainingMismatches,
  findProductStock,
  findDuplicateWarehouseRows,
  findNegativeWarehouseQuantities,
  findOrphanWarehouseRows,
  findWarehouseTotals,
  findBatchTotalsByProduct,
  findBatchTotalsByWarehouse,
  findNegativeBatches,
  findOverReceivedBatches,
  findOrphanConsumptionBatches,
  findOrphanConsumptionSales,
  findBatchConsumptionMismatches,
  findStockTransactionTotals,
  findOrphanSalePayments,
  findOrphanPurchasePayments,
  findActivePaymentsOnInactiveParents,
  findJournalsReferencingMissingPayments,
  findPaymentsWithoutJournal,
  findPossibleDuplicatePayments,
  findOrphanSaleReturns,
  findOrphanPurchaseReturns,
  findActiveReturnsOnInactiveParents,
  findSaleReturnQuantityExceedingSold,
  findPurchaseReturnQuantityExceedingPurchased,
  findReturnsMissingJournal,
  findReturnsMissingStockMovement,
  findInactiveReturnActiveJournal,
  findInactiveProductsWithActiveStock,
  findInactiveAccountsWithActiveJournals,
  findDateQuality,
  findFinancialDateColumns,
  findInventoryMethod,
  findCurrencies,
  findCrossCurrencyJournals,
};
