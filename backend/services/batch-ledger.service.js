/*
 * batch-ledger.service.js
 *
 * Server-side stock-batch ledger. These functions run INSIDE the
 * purchase / sale / product / stock-transfer / waste service
 * transactions so the batch layers move in lockstep with the
 * product quantity, the per-warehouse balance and the
 * stock-transaction movements.
 *
 * All functions are no-ops unless the organization's inventory
 * method is FIFO or LIFO (CLASSIC orgs never create batches),
 * mirroring the legacy local Dexie engine's isBatchMethod gate.
 */

const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  convertItemQuantityToProductUnit,
} = require('../utils/unitConversion');

const {
  sortOpenBatches,
} = require('../utils/fifoBatches');

const BATCH_METHODS = new Set([
  'FIFO',
  'LIFO',
]);

function isBatchMethod(method) {
  return BATCH_METHODS.has(
    String(method || '').trim().toUpperCase(),
  );
}

/*
 * Read the org's inventory method inside the current transaction
 * (the same value the login endpoint returns to the frontend).
 */
async function getInventoryMethod(connection, orgId) {
  const [rows] = await connection.execute(
    'SELECT inventory_method FROM organizations WHERE id = ? LIMIT 1',
    [orgId],
  );

  return rows[0]?.inventory_method || 'CLASSIC';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function requireBatchMethod(connection, orgId) {
  const method =
    await getInventoryMethod(connection, orgId);

  return isBatchMethod(method) ? method : null;
}

async function insertConsumption(
  connection,
  {
    orgId,
    userId,
    data,
  },
) {
  const localId = generateLocalId();

  await stockBatchRepository.createConsumption(
    connection,
    {
      orgId,
      localId,
      userId,
      data: {
        status: 1,
        ...data,
      },
    },
  );
}

/*
 * Purchase confirm -> one batch layer per item.
 */
async function createPurchaseBatches(
  connection,
  {
    orgId,
    userId,
    purchaseId,
    warehouseId,
    receivedAt,
    defaultCurrency,
    items,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  for (const item of items || []) {
    const stockQty = await convertItemQuantityToProductUnit(
      connection,
      {
        orgId,
        productId: item.product_id,
        fromUnitId: item.product_unit_id,
        quantity: item.quantity,
      },
    );
    const quantity = toNumber(stockQty.quantity);
    if (quantity <= 0) continue;

    await stockBatchRepository.recordBatch(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: warehouseId,
          product_id: item.product_id,
          received_at: receivedAt || new Date(),
          quantity_in: quantity,
          quantity_remaining: quantity,
          unit_cost: toNumber(item.unit_price, 0),
          currency: item.currency || defaultCurrency || null,
          source_type: 'purchase',
          source_id: purchaseId,
          status: 1,
        },
      },
    );
  }
}

/*
 * Core FIFO/LIFO consumption. Used by sales, wastes and
 * transfers. When destWarehouseId is provided the consumed
 * quantity is re-created as a new layer in the destination
 * warehouse (stock transfer), otherwise it leaves the system.
 */
async function consumeBatches(
  connection,
  {
    orgId,
    userId,
    operationType,
    operationId,
    saleId,
    warehouseId,
    destWarehouseId,
    receivedAt,
    defaultCurrency,
    items,
  },
) {
  const method =
    await requireBatchMethod(connection, orgId);

  if (!method) {
    return [];
  }

  const itemCosts = [];

  for (const item of items || []) {
    const stockQty = await convertItemQuantityToProductUnit(
      connection,
      {
        orgId,
        productId: item.product_id,
        fromUnitId: item.product_unit_id,
        quantity: item.quantity,
      },
    );
    const quantity = toNumber(stockQty.quantity);
    if (quantity <= 0) {
      itemCosts.push({
        sale_item_id: item.sale_item_id || null,
        product_id: item.product_id,
        fifo_cost: 0,
      });
      continue;
    }

    const batches =
      await stockBatchRepository.findOpenBatches(
        connection,
        {
          orgId,
          productId: item.product_id,
          warehouseId,
          method,
        },
      );

    if (!batches.length) {
      itemCosts.push({
        sale_item_id: item.sale_item_id || null,
        product_id: item.product_id,
        fifo_cost: 0,
      });
      continue;
    }

    const orderedBatches = sortOpenBatches(batches, method);
    let remainingToConsume = quantity;
    let fifoCost = 0;

    for (const batch of orderedBatches) {
      if (remainingToConsume <= 0) break;

      const available = toNumber(batch.quantity_remaining, 0);
      if (available <= 0) continue;

      const consume = Math.min(available, remainingToConsume);
      const nextRemaining = available - consume;

      await stockBatchRepository.updateRemaining(
        connection,
        {
          orgId,
          localId: batch.local_id,
          userId,
          quantityRemaining: nextRemaining,
        },
      );

      const unitCost =
        toNumber(batch.unit_cost, toNumber(item.unit_cost, 0));

      await insertConsumption(
        connection,
        {
          orgId,
          userId,
          data: {
            sale_id: saleId || null,
            operation_type: operationType,
            operation_id: operationId,
            operation_item_id: item.operation_item_id || null,
            sale_item_id: item.sale_item_id || null,
            product_id: item.product_id,
            stock_batch_id: batch.local_id,
            warehouse_id: warehouseId,
            quantity: consume,
            unit_cost: unitCost,
            total_cost: consume * unitCost,
            currency: batch.currency || item.currency || defaultCurrency || null,
          },
        },
      );

      if (destWarehouseId) {
        await stockBatchRepository.recordBatch(
          connection,
          {
            orgId,
            userId,
            data: {
              warehouse_id: destWarehouseId,
              product_id: item.product_id,
              received_at: receivedAt || new Date(),
              quantity_in: consume,
              quantity_remaining: consume,
              unit_cost: unitCost,
              currency: batch.currency || item.currency || defaultCurrency || null,
              source_type: 'transfer',
              source_id: operationId,
              status: 1,
            },
          },
        );
      }

      remainingToConsume -= consume;
      fifoCost += consume * unitCost;
    }

    itemCosts.push({
      sale_item_id: item.sale_item_id || null,
      product_id: item.product_id,
      fifo_cost: fifoCost,
    });
  }

  return itemCosts;
}

/*
 * Sale confirm -> FIFO/LIFO consume open layers, writing one
 * batch_consumptions row per layer touched.
 */
async function consumeSaleBatches(
  connection,
  params,
) {
  return consumeBatches(
    connection,
    {
      ...params,
      operationType: 'sale',
    },
  );
}

/*
 * Stock transfer confirm -> consume the source warehouse layers
 * and re-create them as new layers in the destination warehouse.
 */
async function transferBatches(
  connection,
  {
    orgId,
    userId,
    transferId,
    sourceWarehouseId,
    destWarehouseId,
    receivedAt,
    defaultCurrency,
    items,
  },
) {
  return consumeBatches(
    connection,
    {
      orgId,
      userId,
      operationType: 'TRANSFER',
      operationId: transferId,
      warehouseId: sourceWarehouseId,
      destWarehouseId,
      receivedAt,
      defaultCurrency,
      items,
    },
  );
}

/*
 * Waste confirm -> FIFO/LIFO consume open layers (goods leave the
 * system), writing one batch_consumptions row per layer touched.
 */
async function consumeWasteBatches(
  connection,
  {
    orgId,
    userId,
    wasteId,
    warehouseId,
    defaultCurrency,
    items,
  },
) {
  return consumeBatches(
    connection,
    {
      orgId,
      userId,
      operationType: 'WASTE',
      operationId: wasteId,
      warehouseId,
      defaultCurrency,
      items,
    },
  );
}

/*
 * Revert a document's consumptions: put the consumed quantity
 * back into the same layers and archive the consumption rows.
 */
async function restoreConsumptions(
  connection,
  {
    orgId,
    userId,
    operationType,
    operationId,
  },
) {
  const consumptions =
    await stockBatchRepository.findConsumptions(
      connection,
      {
        orgId,
        operationType,
        operationId,
      },
    );

  for (const consumption of consumptions) {
    const batch =
      await stockBatchRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: consumption.stock_batch_id,
        },
      );

    if (!batch) continue;

    await stockBatchRepository.updateRemaining(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
        quantityRemaining:
          toNumber(batch.quantity_remaining, 0) +
          toNumber(consumption.quantity, 0),
      },
    );

    await stockBatchRepository.softDeleteConsumption(
      connection,
      {
        orgId,
        localId: consumption.local_id,
        userId,
      },
    );
  }
}

/*
 * Sale revert (confirmed -> draft, or delete): put the consumed
 * quantity back into the same layers and archive the consumption
 * rows.
 */
async function restoreSaleBatches(
  connection,
  {
    orgId,
    userId,
    saleId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  return restoreConsumptions(
    connection,
    {
      orgId,
      userId,
      operationType: 'sale',
      operationId: saleId,
    },
  );
}

/*
 * Waste delete: put the wasted quantity back into the same layers.
 */
async function revertWasteBatches(
  connection,
  {
    orgId,
    userId,
    wasteId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  return restoreConsumptions(
    connection,
    {
      orgId,
      userId,
      operationType: 'WASTE',
      operationId: wasteId,
    },
  );
}

/*
 * Stock-transfer delete: restore the source layers AND remove the
 * destination layers that the transfer created.
 */
async function revertTransferBatches(
  connection,
  {
    orgId,
    userId,
    transferId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  await restoreConsumptions(
    connection,
    {
      orgId,
      userId,
      operationType: 'TRANSFER',
      operationId: transferId,
    },
  );

  await stockBatchRepository.revertBatchesBySource(
    connection,
    {
      orgId,
      userId,
      sourceType: 'transfer',
      sourceId: transferId,
    },
  );
}

/*
 * Purchase delete: the stock movement reverts the product
 * quantity, so the purchase's own batch layers are zeroed and
 * soft-deleted.
 */
async function revertPurchaseBatches(
  connection,
  {
    orgId,
    userId,
    purchaseId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  await stockBatchRepository.revertBatchesBySource(
    connection,
    {
      orgId,
      userId,
      sourceType: 'purchase',
      sourceId: purchaseId,
    },
  );
}

/*
 * Purchase return: goods go back to the supplier, so the
 * remaining quantity of the ORIGINAL purchase batches is
 * reduced (oldest-first source batches consumed last-first,
 * mirroring returnPurchaseToOriginalBatch).
 */
async function purchaseReturnBatches(
  connection,
  {
    orgId,
    userId,
    purchaseId,
    returnId,
    warehouseId,
    items,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  for (const item of items || []) {
    const quantity = toNumber(item.quantity);
    if (quantity <= 0) continue;

    const batches =
      await stockBatchRepository.findBatchesBySource(
        connection,
        {
          orgId,
          sourceType: 'purchase',
          sourceId: purchaseId,
        },
      );

    const matching = batches.filter(
      (batch) =>
        Number(batch.warehouse_id) === Number(warehouseId) &&
        Number(batch.product_id) === Number(item.product_id) &&
        toNumber(batch.quantity_remaining, 0) > 0,
    );

    if (!matching.length) continue;

    let left = quantity;
    const layers = [...matching].reverse();

    for (const batch of layers) {
      if (left <= 0) break;

      const available = toNumber(batch.quantity_remaining, 0);
      const take = Math.min(available, left);
      const nextRemaining = available - take;

      await stockBatchRepository.updateRemaining(
        connection,
        {
          orgId,
          localId: batch.local_id,
          userId,
          quantityRemaining: nextRemaining,
        },
      );

      const unitCost = toNumber(batch.unit_cost, 0);

      await insertConsumption(
        connection,
        {
          orgId,
          userId,
          data: {
            operation_type: 'purchase_return',
            operation_id: returnId,
            operation_item_id: item.return_item_id || null,
            product_id: item.product_id,
            stock_batch_id: batch.local_id,
            warehouse_id: warehouseId,
            quantity: take,
            unit_cost: unitCost,
            total_cost: take * unitCost,
            currency: batch.currency || item.currency || null,
          },
        },
      );

      left -= take;
    }
  }
}

/*
 * Purchase-return delete: put the returned quantity back into
 * the batches the return reduced.
 */
async function revertPurchaseReturnBatches(
  connection,
  {
    orgId,
    userId,
    returnId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  return restoreConsumptions(
    connection,
    {
      orgId,
      userId,
      operationType: 'purchase_return',
      operationId: returnId,
    },
  );
}

/*
 * Sale return: goods come back into the same batch layers the
 * sale consumed from, skipping quantities that were already
 * returned by an earlier return of the same sale (mirrors
 * restoreSaleReturnToOriginalBatches).
 */
async function saleReturnBatches(
  connection,
  {
    orgId,
    userId,
    saleId,
    returnId,
    warehouseId,
    items,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  for (const item of items || []) {
    const quantity = toNumber(item.quantity);
    if (quantity <= 0) continue;

    const productId = Number(item.product_id);

    const consumptions =
      await stockBatchRepository.findConsumptions(
        connection,
        {
          orgId,
          operationType: 'sale',
          operationId: saleId,
          saleId,
          productId,
        },
      );

    if (!consumptions.length) continue;

    const returned =
      await stockBatchRepository.findConsumptions(
        connection,
        {
          orgId,
          operationType: 'sale_return',
          operationId: returnId,
          saleId,
          productId,
        },
      );

    let alreadyReturned = 0;
    for (const row of returned) {
      alreadyReturned += toNumber(row.quantity, 0);
    }

    let left = quantity;
    let skip = alreadyReturned;

    for (const consumption of consumptions) {
      if (left <= 0) break;

      const consumedQty = toNumber(consumption.quantity, 0);

      if (skip >= consumedQty) {
        skip -= consumedQty;
        continue;
      }

      const restorable = consumedQty - skip;
      const restoreQty = Math.min(restorable, left);
      skip = 0;

      const batch =
        await stockBatchRepository.findByLocalId(
          connection,
          {
            orgId,
            localId: consumption.stock_batch_id,
          },
        );

      if (!batch) continue;

      await stockBatchRepository.updateRemaining(
        connection,
        {
          orgId,
          localId: batch.local_id,
          userId,
          quantityRemaining:
            toNumber(batch.quantity_remaining, 0) + restoreQty,
        },
      );

      const unitCost =
        toNumber(consumption.unit_cost, toNumber(batch.unit_cost, 0));

      await insertConsumption(
        connection,
        {
          orgId,
          userId,
          data: {
            sale_id: saleId,
            operation_type: 'sale_return',
            operation_id: returnId,
            operation_item_id: item.return_item_id || null,
            sale_item_id: consumption.sale_item_id || null,
            product_id: productId,
            stock_batch_id: batch.local_id,
            warehouse_id: warehouseId,
            quantity: restoreQty,
            unit_cost: unitCost,
            total_cost: restoreQty * unitCost,
            currency: consumption.currency || batch.currency || item.currency || null,
          },
        },
      );

      left -= restoreQty;
    }
  }
}

/*
 * Sale-return delete: take the returned goods back out of the
 * batches (re-consume) and archive the return consumption rows.
 */
async function revertSaleReturnBatches(
  connection,
  {
    orgId,
    userId,
    returnId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  const consumptions =
    await stockBatchRepository.findConsumptions(
      connection,
      {
        orgId,
        operationType: 'sale_return',
        operationId: returnId,
      },
    );

  for (const consumption of consumptions) {
    const batch =
      await stockBatchRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: consumption.stock_batch_id,
        },
      );

    if (!batch) continue;

    const nextRemaining =
      toNumber(batch.quantity_remaining, 0) -
      toNumber(consumption.quantity, 0);

    await stockBatchRepository.updateRemaining(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
        quantityRemaining: Math.max(0, nextRemaining),
      },
    );

    await stockBatchRepository.softDeleteConsumption(
      connection,
      {
        orgId,
        localId: consumption.local_id,
        userId,
      },
    );
  }
}

/*
 * Product opening stock (create + edit): one batch layer per
 * warehouse, source_type OPENING (matches the legacy engine).
 */
async function createOpeningStockBatch(
  connection,
  {
    orgId,
    userId,
    productId,
    warehouseId,
    quantity,
    unitCost,
    currency,
    receivedAt,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return;
  }

  const qty = toNumber(quantity);
  if (qty <= 0) return;

  await stockBatchRepository.recordBatch(
    connection,
    {
      orgId,
      userId,
      data: {
        warehouse_id: warehouseId,
        product_id: productId,
        received_at: receivedAt || new Date(),
        quantity_in: qty,
        quantity_remaining: qty,
        unit_cost: toNumber(unitCost, 0),
        currency: currency || null,
        source_type: 'OPENING',
        source_id: productId,
        status: 1,
      },
    },
  );
}

/*
 * Opening-stock edit from the product report: SET the OPENING
 * batch to the new quantity. Do not rely on the movement-row
 * delta — that row may already have been saved (quantity 0)
 * while the batch still holds the old remaining stock.
 *
 * Existing OPENING batches are updated even for CLASSIC orgs so
 * leftover layers from a previous FIFO/LIFO setting are healed.
 * New batches are created only when the org uses FIFO/LIFO.
 */
async function adjustOpeningStockBatch(
  connection,
  {
    orgId,
    userId,
    productId,
    oldWarehouseId,
    newWarehouseId,
    newQuantity,
    unitCost,
    currency,
  },
) {
  const isBatch = await requireBatchMethod(connection, orgId);
  const newQty = toNumber(newQuantity);
  const warehouseChanged =
    String(oldWarehouseId || '') !== String(newWarehouseId || '');

  let batches =
    await stockBatchRepository.findAll(
      connection,
      {
        orgId,
        filters: {
          product_id: productId,
          source_type: 'OPENING',
          status: 1,
        },
      },
    );

  if (!batches.length) {
    batches =
      await stockBatchRepository.findBatchesBySource(
        connection,
        {
          orgId,
          sourceType: 'OPENING',
          sourceId: productId,
          status: 1,
        },
      );
  }

  let batch =
    batches.find(
      (row) => String(row.warehouse_id) === String(oldWarehouseId),
    ) ||
    batches.find(
      (row) => String(row.warehouse_id) === String(newWarehouseId),
    ) ||
    batches[0] ||
    null;

  /*
   * Heal a leftover single layer when source_type was not stored
   * as OPENING (the report already shows 0, but Stock Details
   * still lists that one remaining batch).
   */
  if (!batch && newQty <= 1e-9) {
    const leftover =
      await stockBatchRepository.findAll(
        connection,
        {
          orgId,
          filters: {
            product_id: productId,
            status: 1,
          },
        },
      );
    const openLeftover = leftover.filter(
      (row) => toNumber(row.quantity_remaining) > 0,
    );
    if (openLeftover.length === 1) {
      batch = openLeftover[0];
    }
  }

  if (!batch) {
    if (isBatch && newQty > 0 && newWarehouseId) {
      await createOpeningStockBatch(
        connection,
        {
          orgId,
          userId,
          productId,
          warehouseId: newWarehouseId,
          quantity: newQty,
          unitCost,
          currency,
          receivedAt: new Date(),
        },
      );
    }
    return;
  }

  const quantityIn = toNumber(batch.quantity_in);
  const remaining = toNumber(batch.quantity_remaining);
  const consumed = Math.max(quantityIn - remaining, 0);
  const nextRemaining = newQty - consumed;

  if (nextRemaining < -1e-9) {
    throw new AppError(
      'Cannot reduce opening stock below the quantity already sold or transferred.',
      409,
      'OPENING_STOCK_ALREADY_CONSUMED',
    );
  }

  if (warehouseChanged && consumed > 1e-9) {
    throw new AppError(
      'Cannot move opening stock to another warehouse after part of it has been sold or transferred.',
      409,
      'OPENING_STOCK_WAREHOUSE_LOCKED',
    );
  }

  if (newQty <= 1e-9 && consumed <= 1e-9) {
    await stockBatchRepository.updateRemaining(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
        quantityRemaining: 0,
      },
    );

    await stockBatchRepository.softDelete(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
      },
    );

    return;
  }

  await stockBatchRepository.update(
    connection,
    {
      orgId,
      localId: batch.local_id,
      userId,
      data: {
        warehouse_id: newWarehouseId || batch.warehouse_id,
        product_id: batch.product_id,
        received_at: batch.received_at,
        quantity_in: Math.max(newQty, consumed),
        source_type: batch.source_type,
        source_id: batch.source_id,
        quantity_remaining: Math.max(nextRemaining, 0),
        unit_cost:
          unitCost == null
            ? batch.unit_cost
            : toNumber(unitCost, 0),
        currency:
          currency == null ? batch.currency : currency,
        status: batch.status ?? 1,
      },
    },
  );
}

/*
 * Public helper so the sale service can still surface a clear
 * error if a batch org tries to sell more than the open layers
 * hold. (Currently consumption is best-effort like the legacy
 * engine; kept for future strict-mode use.)
 */
async function assertSufficientBatchStock(
  connection,
  {
    orgId,
    productId,
    warehouseId,
    quantity,
    method,
  },
) {
  const open =
    await stockBatchRepository.findOpenBatches(
      connection,
      {
        orgId,
        productId,
        warehouseId,
        method: method || 'FIFO',
      },
    );

  let available = 0;
  for (const batch of open) {
    available += toNumber(batch.quantity_remaining, 0);
  }

  if (available < toNumber(quantity)) {
    throw new AppError(
      'Not enough batch stock available for this product.',
      409,
      'INSUFFICIENT_BATCH_STOCK',
    );
  }
}

module.exports = {
  isBatchMethod,
  getInventoryMethod,
  createPurchaseBatches,
  consumeSaleBatches,
  restoreSaleBatches,
  revertPurchaseBatches,
  purchaseReturnBatches,
  revertPurchaseReturnBatches,
  saleReturnBatches,
  revertSaleReturnBatches,
  createOpeningStockBatch,
  adjustOpeningStockBatch,
  transferBatches,
  revertTransferBatches,
  consumeWasteBatches,
  revertWasteBatches,
  assertSufficientBatchStock,
};
