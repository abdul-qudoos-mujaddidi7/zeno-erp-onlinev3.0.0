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
  itemQuantityInProductUnit,
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

/*
 * INVENTORY POLICY (intentional, Step 2.7):
 *
 * `settings.enable_stock_minus` still controls CLASSIC stock behavior
 * (the org may sell beyond products.quantity). It deliberately does NOT
 * relax FIFO/LIFO batch coverage any more: an inventory layer is the
 * only defensible source of FIFO/LIFO cost, so a best-effort partial
 * consumption used to leave part of a sale uncosted (fifo_cost covered
 * only the layers that happened to exist, and `profit` was therefore
 * overstated). A FIFO/LIFO operation now either has full batch coverage
 * or it fails with INSUFFICIENT_BATCH_STOCK before anything is written.
 *
 * Batch remaining is still never driven negative under any policy.
 */

/*
 * Services are not inventory: they have no layers and no cost, so they
 * are excluded from batch creation, consumption and coverage checks.
 */
function isServiceItem(stockQty) {
  return Boolean(stockQty?.isService);
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
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    /* A service has no layer to receive. */
    if (isServiceItem(stockQty)) continue;

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

  /*
   * Two passes so a shortfall can never leave a partially consumed
   * document:
   *   1. lock every needed layer and validate the FULL required quantity
   *      per product/warehouse (aggregating duplicate lines)
   *   2. only then consume the planned layers
   * This runs inside the caller's transaction, so a shortfall throws
   * before any row is written and the service rolls everything back.
   *
   * The requirement is absolute for FIFO/LIFO: enable_stock_minus does
   * not relax it, because a partially covered sale has no defensible
   * COGS for the uncovered quantity.
   */
  const batchesByKey = new Map();
  const requiredByKey = new Map();
  const plans = [];

  for (const item of items || []) {
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    /*
     * Non-inventory lines (services) hold no stock, so they require no
     * layers and carry no batch cost.
     */
    const quantity = isServiceItem(stockQty)
      ? 0
      : toNumber(stockQty.quantity);
    const key = `${item.product_id}:${warehouseId}`;

    if (quantity > 0 && !batchesByKey.has(key)) {
      batchesByKey.set(
        key,
        await stockBatchRepository.findOpenBatches(
          connection,
          {
            orgId,
            productId: item.product_id,
            warehouseId,
            method,
            forUpdate: true,
          },
        ),
      );
      requiredByKey.set(key, 0);
    }

    if (quantity > 0) {
      requiredByKey.set(key, requiredByKey.get(key) + quantity);
    }

    plans.push({
      item,
      quantity,
      key,
    });
  }

  for (const [key, required] of requiredByKey) {
    const available = (batchesByKey.get(key) || []).reduce(
      (sum, batch) => sum + toNumber(batch.quantity_remaining, 0),
      0,
    );

    if (available + 1e-9 < required) {
      throw new AppError(
        'Not enough batch stock available for this product in this warehouse.',
        409,
        'INSUFFICIENT_BATCH_STOCK',
      );
    }
  }

  /*
   * Remaining quantities tracked locally as each layer is consumed, so
   * duplicate lines for the same product cannot consume the same units
   * twice (the fetched row is only a snapshot, not a live value).
   */
  const remainingState = new Map();

  const effectiveRemaining = (batch) => {
    const id = String(batch.local_id);
    return remainingState.has(id)
      ? remainingState.get(id)
      : toNumber(batch.quantity_remaining, 0);
  };

  const itemCosts = [];

  for (const plan of plans) {
    const {
      item,
      quantity,
      key,
    } = plan;

    const batches = quantity > 0 ? batchesByKey.get(key) || [] : [];

    if (quantity <= 0 || !batches.length) {
      itemCosts.push({
        sale_item_id: item.sale_item_id || null,
        product_id: item.product_id,
        required_quantity: quantity,
        consumed_quantity: 0,
        /* nothing was required (e.g. a service line) */
        covered: quantity <= 0,
        fifo_cost: 0,
      });
      continue;
    }

    const orderedBatches = sortOpenBatches(batches, method);
    let remainingToConsume = quantity;
    let fifoCost = 0;

    for (const batch of orderedBatches) {
      if (remainingToConsume <= 0) break;

      const available = effectiveRemaining(batch);
      if (available <= 0) continue;

      const consume = Math.min(available, remainingToConsume);
      const nextRemaining = available - consume;

      remainingState.set(String(batch.local_id), nextRemaining);

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

    const consumedQuantity = Math.min(
      quantity,
      quantity - remainingToConsume,
    );

    itemCosts.push({
      sale_item_id: item.sale_item_id || null,
      product_id: item.product_id,
      required_quantity: quantity,
      consumed_quantity: consumedQuantity,
      /*
       * Coverage is a matter of QUANTITY, never of cost: a legitimate
       * layer may cost zero.
       */
      covered: consumedQuantity + 1e-9 >= quantity,
      fifo_cost: fifoCost,
    });
  }

  return itemCosts;
}

/*
 * Sale confirm -> FIFO/LIFO consume open layers, writing one
 * batch_consumptions row per layer touched.
 *
 * operation_id is keyed to the sale id so the consumptions can be found
 * again by operation, and sale_id is written as well so restores still
 * work for rows created before operation_id was populated.
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
      operationId: params.operationId ?? params.saleId,
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
    saleId,
  },
) {
  const consumptions =
    await stockBatchRepository.findConsumptions(
      connection,
      {
        orgId,
        operationType,
        operationId,
        saleId,
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

  /*
   * Locate the sale's consumptions by sale_id, not operation_id, so the
   * restoration also works for historical rows whose operation_id was
   * never populated. The original consumption rows are the source of
   * truth: each batch gets back exactly what it supplied.
   */
  return restoreConsumptions(
    connection,
    {
      orgId,
      userId,
      operationType: 'sale',
      saleId,
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
 *
 * The returned quantity is converted into the product base unit
 * first, because the layers it reduces are stored in base units.
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
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    if (isServiceItem(stockQty)) continue;

    const quantity = toNumber(stockQty.quantity);
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
 *
 * The returned quantity is converted into the product base unit first:
 * both the original sale consumptions and the layers it restores are
 * stored in base units, so a raw line quantity would over- or
 * under-restore a multi-unit product.
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
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    if (isServiceItem(stockQty)) continue;

    const quantity = toNumber(stockQty.quantity);
    if (quantity <= 0) continue;

    const productId = Number(item.product_id);

    /*
     * The original sale layers are looked up by sale_id (works for both
     * new and historical rows). Already-returned quantities are looked up
     * by sale_id too, so a second partial return of the same sale does
     * not restore more than the sale consumed.
     */
    const consumptions =
      await stockBatchRepository.findConsumptions(
        connection,
        {
          orgId,
          operationType: 'sale',
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
 * Adjustment decrease: consume the organization's layers with the same
 * FIFO/LIFO machinery every other stock-out uses, so a negative
 * adjustment can never leave product/warehouse stock ahead of the
 * layers. A shortfall throws INSUFFICIENT_BATCH_STOCK inside the
 * caller's transaction, before anything is written.
 *
 * The adjustment quantity is already expressed in the product base unit,
 * so the item is passed without a unit id (conversion is a no-op).
 */
async function consumeAdjustmentBatches(
  connection,
  {
    orgId,
    userId,
    adjustmentId,
    warehouseId,
    productId,
    quantity,
  },
) {
  const qty = toNumber(quantity);

  if (qty <= 0) {
    return [];
  }

  return consumeBatches(
    connection,
    {
      orgId,
      userId,
      operationType: 'ADJUSTMENT',
      operationId: adjustmentId,
      warehouseId,
      items: [
        {
          product_id: productId,
          quantity: qty,
        },
      ],
    },
  );
}

/*
 * Zero a set of layers: remaining goes to 0 and the layer is archived,
 * exactly like a document reversal (revertBatchesBySource). Batch
 * consumption history is left untouched, so historical COGS stays
 * intact.
 */
async function zeroLayers(
  connection,
  {
    orgId,
    userId,
    batches,
  },
) {
  let zeroed = 0;

  for (const batch of batches || []) {
    if (toNumber(batch.quantity_remaining) !== 0) {
      await stockBatchRepository.updateRemaining(
        connection,
        {
          orgId,
          localId: batch.local_id,
          userId,
          quantityRemaining: 0,
        },
      );
    }

    await stockBatchRepository.softDelete(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
      },
    );

    zeroed += 1;
  }

  return zeroed;
}

/*
 * Zero-stock reset for one product: an inventory reset must clear the
 * product's layers too, otherwise they keep holding stock the
 * organization just declared gone.
 */
async function zeroProductBatches(
  connection,
  {
    orgId,
    userId,
    productId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return 0;
  }

  const batches =
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

  return zeroLayers(
    connection,
    {
      orgId,
      userId,
      batches,
    },
  );
}

/*
 * Catalog-wide zero-stock reset: every active layer of the organization
 * is cleared with the reset.
 */
async function zeroAllBatches(
  connection,
  {
    orgId,
    userId,
  },
) {
  if (!(await requireBatchMethod(connection, orgId))) {
    return 0;
  }

  const batches =
    await stockBatchRepository.findAll(
      connection,
      {
        orgId,
        filters: {
          status: 1,
        },
      },
    );

  return zeroLayers(
    connection,
    {
      orgId,
      userId,
      batches,
    },
  );
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

/*
 * A purchase can only be reversed (reverted to draft or deleted) while
 * its stock is still intact. If any earlier sale, transfer or waste has
 * already consumed one of the purchase's batch layers, reversing would
 * either fabricate stock or zero a layer that other documents still
 * depend on, so the operation is rejected instead.
 *
 * Purchase returns are part of the purchase's own lifecycle and are
 * reversed together with it, so their consumption of the same layers is
 * excluded from this check.
 */
async function assertPurchaseReversible(
  connection,
  {
    orgId,
    purchaseId,
  },
) {
  const method =
    await requireBatchMethod(connection, orgId);

  if (!method) {
    return;
  }

  const batches =
    await stockBatchRepository.findBatchesBySource(
      connection,
      {
        orgId,
        sourceType: 'purchase',
        sourceId: purchaseId,
        status: 1,
      },
    );

  if (!batches.length) {
    return;
  }

  const consumptions =
    await stockBatchRepository.findConsumptionsForBatches(
      connection,
      {
        orgId,
        batchIds: batches.map((batch) => batch.local_id),
      },
    );

  for (const batch of batches) {
    const quantityIn = toNumber(batch.quantity_in, 0);
    const remaining = toNumber(batch.quantity_remaining, 0);

    const returned = consumptions
      .filter(
        (consumption) =>
          String(consumption.stock_batch_id) === String(batch.local_id) &&
          consumption.operation_type === 'purchase_return',
      )
      .reduce(
        (sum, consumption) => sum + toNumber(consumption.quantity, 0),
        0,
      );

    const consumedByLaterOperations =
      quantityIn - remaining - returned;

    if (consumedByLaterOperations > 1e-9) {
      throw new AppError(
        'Cannot reverse this purchase: its stock has already been consumed by later sales, transfers or waste.',
        409,
        'PURCHASE_STOCK_ALREADY_CONSUMED',
      );
    }
  }
}

module.exports = {
  isBatchMethod,
  getInventoryMethod,
  createPurchaseBatches,
  consumeSaleBatches,
  consumeAdjustmentBatches,
  zeroProductBatches,
  zeroAllBatches,
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
  assertPurchaseReversible,
};
