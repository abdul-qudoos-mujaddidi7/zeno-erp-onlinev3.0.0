const db = require('../database/pool');
const dashboardService = require('./dashboard.service');

const AppError =
  require('../errors/AppError');

const productionRepository =
  require('../repositories/production.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  itemQuantityInProductUnit,
} = require('../utils/unitConversion');

const fiscalPostingGuard =
  require('./fiscal-posting-guard.service');

const TIME_TO_SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 2592000,
  year: 31536000,
};

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

function isConfirmed(status) {
  return String(status || '').trim().toLowerCase() === 'confirmed';
}

function convertTime(amount, fromUnit, toUnit) {
  const from = TIME_TO_SECONDS[String(fromUnit || 'hour').toLowerCase()] || 3600;
  const to = TIME_TO_SECONDS[String(toUnit || 'hour').toLowerCase()] || 3600;
  return (Number(amount || 0) * from) / to;
}

function computeOperationsTotal(operations, quantity, currency) {
  return (operations || []).reduce((sum, operation) => {
    if (
      operation.cost_currency &&
      currency &&
      operation.cost_currency !== currency
    ) {
      return sum;
    }

    if (operation.cost_per_hour) {
      const runHours = convertTime(
        (Number(operation.run_time) || 0) * (Number(quantity) || 1),
        operation.run_time_unit,
        'hour',
      );
      const setupHours = convertTime(
        Number(operation.setup_time) || 0,
        operation.setup_time_unit,
        'hour',
      );

      return sum + ((runHours + setupHours) * Number(operation.cost_per_hour));
    }

    if (operation.fixed_cost) {
      return sum + Number(operation.fixed_cost || 0);
    }

    return sum;
  }, 0);
}

async function createJournalEntry(
  connection,
  {
    orgId,
    userId,
    requestContext,
    data,
    description,
  },
) {
  /*
   * Step 4.5: no journal may be written into a CLOSED fiscal year. Guarding
   * here — not only at each document entry point — covers every call site of
   * this module, present and future, and the guard throws before this
   * transaction can commit any part of the operation.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: data.date,
      operation: 'production.journal',
    },
  );

  const localId = generateLocalId();

  const journal =
    await journalRepository.create(
      connection,
      {
        orgId,
        localId,
        userId,
        data,
      },
    );

  await activityRepository.create(
    connection,
    {
      orgId,
      userId,

      action: 'create',
      tableName: 'journals',
      entityId: journal.id,

      oldValues: null,
      newValues: journal,

      description:
        description || `Created journal entry ${journal.id}`,

      ipAddress:
        requestContext.ipAddress,

      sessionId:
        requestContext.sessionId,

      deviceInfo:
        requestContext.deviceInfo,
    },
  );

  return journal;
}

/*
 * ONE answer to "what does this material line take out of stock?" in the
 * product's base unit, matching sale, purchase, waste and transfer.
 */
async function materialStockQuantity(
  connection,
  {
    orgId,
    item,
  },
) {
  return itemQuantityInProductUnit(
    connection,
    {
      orgId,
      item,
    },
  );
}

/*
 * A production may only consume material the warehouse actually holds.
 *
 * The requirement is aggregated per product (a BOM may list the same
 * material twice) and checked against the selected warehouse balance,
 * locking the row so a concurrent movement cannot slip between the check
 * and the deduction. A shortfall throws before any row is written, so the
 * surrounding transaction rolls back and no partial production survives.
 * `enable_stock_minus` deliberately does not relax this: a production
 * started without its raw material has no real cost to capitalise.
 */
async function assertMaterialStockAvailable(
  connection,
  {
    orgId,
    warehouseId,
    items,
  },
) {
  if (!warehouseId) {
    return;
  }

  const requiredByProduct = new Map();

  for (const item of items || []) {
    if (Number(item.quantity || 0) <= 0) continue;

    const stockQty = await materialStockQuantity(
      connection,
      {
        orgId,
        item,
      },
    );

    /* A service is not inventory: it is never consumed out of stock. */
    if (stockQty.isService) continue;

    const quantity = Number(stockQty.quantity || 0);

    if (quantity <= 0) continue;

    const key = Number(item.product_id);
    const entry = requiredByProduct.get(key);

    if (entry) {
      entry.required += quantity;
    } else {
      requiredByProduct.set(key, {
        productId: key,
        required: quantity,
      });
    }
  }

  if (!requiredByProduct.size) {
    return;
  }

  const shortages = [];

  for (const entry of requiredByProduct.values()) {
    const balance =
      await warehouseProductRepository.findByWarehouseProduct(
        connection,
        {
          orgId,
          warehouseId,
          productId: entry.productId,
          forUpdate: true,
        },
      );

    const available = Number(balance?.quantity || 0);

    if (available + 1e-9 < entry.required) {
      shortages.push({
        product_id: entry.productId,
        required: entry.required,
        available,
      });
    }
  }

  if (!shortages.length) {
    return;
  }

  const names =
    await productionRepository.findProductNames(
      connection,
      {
        orgId,
        productIds: shortages.map((shortage) => shortage.product_id),
      },
    );

  const nameById = new Map(
    (names || []).map((product) => [
      Number(product.id),
      product.name,
    ]),
  );

  throw new AppError(
    'Not enough raw material stock in the selected warehouse for this production.',
    409,
    'INSUFFICIENT_MATERIAL_STOCK',
    {
      shortages: shortages.map((shortage) => ({
        ...shortage,
        product_name:
          nameById.get(shortage.product_id)
          || `#${shortage.product_id}`,
      })),
    },
  );
}

async function applyMaterialStock(
  connection,
  {
    orgId,
    userId,
    productionId,
    warehouseId,
    productionDate,
    defaultCurrency,
    items,
    sign = -1,
  },
) {
  if (sign < 0) {
    await assertMaterialStockAvailable(
      connection,
      {
        orgId,
        warehouseId,
        items,
      },
    );
  }

  for (const item of items || []) {
    const enteredQuantity = Number(item.quantity || 0);
    if (enteredQuantity <= 0) continue;

    /*
     * Product and warehouse balances are kept in the product base unit,
     * while the movement keeps the entered quantity together with its
     * product_unit_id (the ledger convention used everywhere else).
     */
    const stockQty = await materialStockQuantity(
      connection,
      {
        orgId,
        item,
      },
    );

    /* A service is not inventory: no stock balance, no movement. */
    if (stockQty.isService) continue;

    const quantity = Number(stockQty.quantity || 0);
    if (quantity <= 0) continue;

    await productionRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: sign * quantity,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: sign * quantity,
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: warehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: productionId,
          reference_type: 'production',
          transaction_type: sign < 0
            ? 'production_in'
            : 'production_in_revert',
          quantity: sign * enteredQuantity,
          unit_cost: Number(item.unit_price || 0),
          total_cost: sign * Number(item.subtotal || 0),
          currency: item.currency || defaultCurrency || null,
          date: productionDate || new Date(),
          description: sign < 0
            ? `Stock used as material for Production #${productionId}`
            : `Production #${productionId} material stock reverted`,
          status: 1,
        },
      },
    );
  }
}

async function applyFinishedGoodStock(
  connection,
  {
    orgId,
    userId,
    productionId,
    warehouseId,
    productId,
    productUnitId,
    quantity,
    unitCost,
    totalCost,
    currency,
    productionDate,
    sign = 1,
  },
) {
  const qty = Number(quantity || 0);
  if (!productId || qty <= 0) return;

  await productionRepository.adjustProductQuantity(
    connection,
    {
      orgId,
      productId,
      delta: sign * qty,
    },
  );

  await warehouseProductRepository.adjustQuantity(
    connection,
    {
      orgId,
      userId,
      warehouseId,
      productId,
      productUnitId,
      delta: sign * qty,
    },
  );

  await stockTransactionRepository.recordMovement(
    connection,
    {
      orgId,
      userId,
      data: {
        warehouse_id: warehouseId,
        product_id: productId,
        product_unit_id: productUnitId,
        reference_id: productionId,
        reference_type: 'production',
        transaction_type: sign > 0
          ? 'production_out'
          : 'production_out_revert',
        quantity: sign * qty,
        unit_cost: Number(unitCost || 0),
        total_cost: sign * Number(totalCost || 0),
        currency: currency || null,
        date: productionDate || new Date(),
        description: sign > 0
          ? `Production Out from Production #${productionId}`
          : `Production #${productionId} finished-good stock reverted`,
        status: 1,
      },
    },
  );
}

async function confirmProductionEffects(
  connection,
  {
    orgId,
    userId,
    requestContext,
    productionId,
    header,
    items,
    operations,
  },
) {
  await applyMaterialStock(
    connection,
    {
      orgId,
      userId,
      productionId,
      warehouseId: header.warehouse_id,
      productionDate: header.production_end_date,
      defaultCurrency: header.currency,
      items,
      sign: -1,
    },
  );

  const qty = Number(header.quantity || 0) || 1;
  const totalAmount = Number(header.total_amount || 0);
  const unitCost = qty ? totalAmount / qty : 0;

  await applyFinishedGoodStock(
    connection,
    {
      orgId,
      userId,
      productionId,
      warehouseId: header.warehouse_id,
      productId: header.product_id,
      productUnitId: header.product_unit_id,
      quantity: header.quantity,
      unitCost,
      totalCost: totalAmount,
      currency: header.currency,
      productionDate: header.production_end_date,
      sign: 1,
    },
  );

  await productionRepository.updateProductBuyPrice(
    connection,
    {
      orgId,
      productId: header.product_id,
      buyPrice: unitCost,
      buyCurrency: header.currency || null,
    },
  );

  const operationsTotal = computeOperationsTotal(
    operations,
    header.quantity,
    header.currency,
  );

  if (operationsTotal > 0) {
    const treasuryAccount =
      await productionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'TREASURY',
        },
      );

    if (!treasuryAccount) {
      throw new AppError(
        'TREASURY account not found.',
        500,
        'TREASURY_ACCOUNT_NOT_FOUND',
      );
    }

    const expensesAccount =
      await productionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'EXPENSES',
        },
      );

    if (!expensesAccount) {
      throw new AppError(
        'EXPENSES account not found.',
        500,
        'EXPENSES_ACCOUNT_NOT_FOUND',
      );
    }

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: header.production_end_date || new Date().toISOString().slice(0, 10),
          reference_id: productionId,
          reference_type: 'production',
          description:
            header.description
            || `Production Operations Cost #${header.production_number || productionId}`,
          currency: header.currency || null,
          first_entry_account: expensesAccount.id,
          first_entry_debit: operationsTotal,
          first_entry_credit: 0,
          second_entry_account: treasuryAccount.id,
          second_entry_debit: 0,
          second_entry_credit: operationsTotal,
          status: 1,
        },
        description:
          `Created production journal for production ${productionId}`,
      },
    );
  }
}

async function revertProductionEffects(
  connection,
  {
    orgId,
    userId,
    productionId,
    header,
    items,
  },
) {
  await applyMaterialStock(
    connection,
    {
      orgId,
      userId,
      productionId,
      warehouseId: header.warehouse_id,
      productionDate: header.production_end_date,
      defaultCurrency: header.currency,
      items,
      sign: 1,
    },
  );

  const qty = Number(header.quantity || 0) || 1;
  const totalAmount = Number(header.total_amount || 0);

  await applyFinishedGoodStock(
    connection,
    {
      orgId,
      userId,
      productionId,
      warehouseId: header.warehouse_id,
      productId: header.product_id,
      productUnitId: header.product_unit_id,
      quantity: header.quantity,
      unitCost: qty ? totalAmount / qty : 0,
      totalCost: totalAmount,
      currency: header.currency,
      productionDate: header.production_end_date,
      sign: -1,
    },
  );

  await journalRepository.softDeleteByReference(
    connection,
    {
      orgId,
      referenceId: productionId,
      referenceType: 'production',
      userId,
    },
  );
}

async function replaceNested(
  connection,
  {
    orgId,
    userId,
    productionId,
    items = [],
    operations = [],
  },
) {
  await productionRepository.softDeleteItemsByProduction(
    connection,
    {
      orgId,
      productionId,
      userId,
    },
  );

  await productionRepository.softDeleteOperationsByProduction(
    connection,
    {
      orgId,
      productionId,
      userId,
    },
  );

  const createdItems = [];
  const createdOperations = [];

  for (const item of items) {
    const itemLocalId = generateLocalId();

    const createdItem =
      await productionRepository.createItem(
        connection,
        {
          orgId,
          localId: itemLocalId,
          userId,
          data: {
            ...item,
            production_id: productionId,
          },
        },
      );

    createdItems.push(createdItem);
  }

  for (const operation of operations) {
    const operationLocalId = generateLocalId();

    const createdOperation =
      await productionRepository.createOperation(
        connection,
        {
          orgId,
          localId: operationLocalId,
          userId,
          data: {
            ...operation,
            production_id: productionId,
          },
        },
      );

    createdOperations.push(createdOperation);
  }

  return {
    createdItems,
    createdOperations,
  };
}

async function attachRelations(
  executor,
  {
    orgId,
    production,
  },
) {
  const [
    items,
    operations,
    returns,
  ] = await Promise.all([
    productionRepository.findItemsByProduction(
      executor,
      {
        orgId,
        productionId: production.id,
      },
    ),
    productionRepository.findOperationsByProduction(
      executor,
      {
        orgId,
        productionId: production.id,
      },
    ),
    productionRepository.findReturnsByProduction(
      executor,
      {
        orgId,
        productionId: production.id,
      },
    ),
  ]);

  const returnsWithItems = [];

  for (const productionReturn of returns) {
    const returnItems =
      await productionRepository.findReturnItemsByReturn(
        executor,
        {
          orgId,
          returnId: productionReturn.id,
        },
      );

    returnsWithItems.push({
      ...productionReturn,
      items: returnItems,
    });
  }

  return {
    ...production,
    items,
    operations,
    returns: returnsWithItems,
  };
}

async function listProductions({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return productionRepository.findAll(
    db,
    {
      orgId,
      status: filters.status ?? 1,
      productionStatus: filters.production_status || null,
      search: filters.search || '',
    },
  );
}

async function getProduction({
  user,
  productionId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const production =
    await productionRepository.findByLocalId(
      db,
      {
        orgId,
        localId: productionId,
      },
    );

  if (!production) {
    throw new AppError(
      'Production not found.',
      404,
      'PRODUCTION_NOT_FOUND',
    );
  }

  return attachRelations(
    db,
    {
      orgId,
      production,
    },
  );
}

async function createProduction({
  user,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const localId = generateLocalId();

    const production =
      await productionRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    const {
      createdItems,
      createdOperations,
    } = await replaceNested(
      connection,
      {
        orgId,
        userId,
        productionId: localId,
        items: data.items || [],
        operations: data.operations || [],
      },
    );

    if (isConfirmed(data.production_status)) {
      await confirmProductionEffects(
        connection,
        {
          orgId,
          userId,
          requestContext,
          productionId: localId,
          header: {
            ...data,
            ...production,
          },
          items: createdItems,
          operations: createdOperations,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'productions',
        entityId: production.id,

        oldValues: null,
        newValues: {
          ...production,
          items: createdItems,
          operations: createdOperations,
        },

        description:
          `Created production ${production.production_number || `#${production.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Production changes affect dashboard aggregates. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...production,
      items: createdItems,
      operations: createdOperations,
      returns: [],
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProduction({
  user,
  productionId,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldProduction =
      await productionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productionId,
          forUpdate: true,
        },
      );

    if (!oldProduction) {
      throw new AppError(
        'Production not found.',
        404,
        'PRODUCTION_NOT_FOUND',
      );
    }

    const oldItems =
      await productionRepository.findItemsByProduction(
        connection,
        {
          orgId,
          productionId,
        },
      );

    const oldOperations =
      await productionRepository.findOperationsByProduction(
        connection,
        {
          orgId,
          productionId,
        },
      );

    const nextStatus =
      data.production_status ?? oldProduction.production_status;

    if (
      isConfirmed(oldProduction.production_status) &&
      nextStatus &&
      !isConfirmed(nextStatus)
    ) {
      await revertProductionEffects(
        connection,
        {
          orgId,
          userId,
          productionId,
          header: oldProduction,
          items: oldItems,
        },
      );
    }

    const updatedProduction =
      await productionRepository.update(
        connection,
        {
          orgId,
          localId: productionId,
          userId,
          data,
        },
      );

    const {
      createdItems,
      createdOperations,
    } = await replaceNested(
      connection,
      {
        orgId,
        userId,
        productionId,
        items: data.items || [],
        operations: data.operations || [],
      },
    );

    if (
      !isConfirmed(oldProduction.production_status) &&
      isConfirmed(nextStatus)
    ) {
      await confirmProductionEffects(
        connection,
        {
          orgId,
          userId,
          requestContext,
          productionId,
          header: {
            ...oldProduction,
            ...data,
            ...updatedProduction,
          },
          items: createdItems,
          operations: createdOperations,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'productions',
        entityId: productionId,

        oldValues: {
          ...oldProduction,
          items: oldItems,
          operations: oldOperations,
        },
        newValues: {
          ...updatedProduction,
          items: createdItems,
          operations: createdOperations,
        },

        description:
          `Updated production ${updatedProduction.production_number || `#${productionId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Production changes affect dashboard aggregates. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return attachRelations(
      connection,
      {
        orgId,
        production: updatedProduction,
      },
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProduction({
  user,
  productionId,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldProduction =
      await productionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productionId,
          forUpdate: true,
        },
      );

    if (!oldProduction) {
      throw new AppError(
        'Production not found.',
        404,
        'PRODUCTION_NOT_FOUND',
      );
    }

    if (Number(oldProduction.status) === 0) {
      throw new AppError(
        'Production is already deleted.',
        409,
        'PRODUCTION_ALREADY_DELETED',
      );
    }

    const oldItems =
      await productionRepository.findItemsByProduction(
        connection,
        {
          orgId,
          productionId,
        },
      );

    const returns =
      await productionRepository.findReturnsByProduction(
        connection,
        {
          orgId,
          productionId,
        },
      );

    for (const productionReturn of returns) {
      const returnItems =
        await productionRepository.findReturnItemsByReturn(
          connection,
          {
            orgId,
            returnId: productionReturn.id,
          },
        );

      for (const item of returnItems) {
        const quantity = Number(item.quantity || 0);
        if (quantity <= 0) continue;

        await productionRepository.adjustProductQuantity(
          connection,
          {
            orgId,
            productId: item.product_id,
            delta: -quantity,
          },
        );

        await warehouseProductRepository.adjustQuantity(
          connection,
          {
            orgId,
            userId,
            warehouseId:
              productionReturn.warehouse_id
              || oldProduction.warehouse_id,
            productId: item.product_id,
            productUnitId: item.product_unit_id,
            delta: -quantity,
          },
        );

        await stockTransactionRepository.recordMovement(
          connection,
          {
            orgId,
            userId,
            data: {
              warehouse_id:
                productionReturn.warehouse_id
                || oldProduction.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: productionReturn.id,
              reference_type: 'production_return',
              transaction_type: 'production_return_revert',
              quantity: -quantity,
              unit_cost: Number(item.unit_price || 0),
              total_cost: -Number(item.subtotal || 0),
              currency:
                item.currency
                || productionReturn.currency
                || oldProduction.currency
                || null,
              date: new Date(),
              description:
                `Deleted production return #${productionReturn.id}`,
              status: 1,
            },
          },
        );
      }

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: productionReturn.id,
          referenceType: 'production_return',
          userId,
        },
      );
    }

    if (isConfirmed(oldProduction.production_status)) {
      await revertProductionEffects(
        connection,
        {
          orgId,
          userId,
          productionId,
          header: oldProduction,
          items: oldItems,
        },
      );
    }

    const deletedProduction =
      await productionRepository.softDelete(
        connection,
        {
          orgId,
          localId: productionId,
          userId,
        },
      );

    await productionRepository.softDeleteItemsByProduction(
      connection,
      {
        orgId,
        productionId,
        userId,
      },
    );

    await productionRepository.softDeleteOperationsByProduction(
      connection,
      {
        orgId,
        productionId,
        userId,
      },
    );

    await productionRepository.softDeleteReturnItemsByProduction(
      connection,
      {
        orgId,
        productionId,
        userId,
      },
    );

    await productionRepository.softDeleteReturnsByProduction(
      connection,
      {
        orgId,
        productionId,
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'productions',
        entityId: productionId,

        oldValues: {
          ...oldProduction,
          items: oldItems,
        },
        newValues: deletedProduction,

        description:
          `Deleted production ${oldProduction.production_number || `#${productionId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Production changes affect dashboard aggregates. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return deletedProduction;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createReturn({
  user,
  productionId,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  /* Returns need tables this database may not have (see the repository). */
  if (!(await productionRepository.hasReturnTables(db))) {
    throw new AppError(
      'Production returns are not available on this database.',
      409,
      'PRODUCTION_RETURNS_UNAVAILABLE',
    );
  }

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const production =
      await productionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productionId,
          forUpdate: true,
        },
      );

    if (!production) {
      throw new AppError(
        'Production not found.',
        404,
        'PRODUCTION_NOT_FOUND',
      );
    }

    if (!isConfirmed(production.production_status)) {
      throw new AppError(
        'Only confirmed productions can be returned.',
        409,
        'PRODUCTION_NOT_CONFIRMED',
      );
    }

    const returnLocalId = generateLocalId();

    const productionReturn =
      await productionRepository.createReturn(
        connection,
        {
          orgId,
          localId: returnLocalId,
          userId,
          data: {
            ...data,
            production_id: productionId,
            warehouse_id:
              data.warehouse_id ?? production.warehouse_id,
            return_status: data.return_status || 'confirmed',
          },
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await productionRepository.createReturnItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              production_return_id: returnLocalId,
            },
          },
        );

      createdItems.push(createdItem);

      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) continue;

      /*
       * Production return puts materials back into stock
       * (frontend ProductionReturnModal: stock in).
       */
      await productionRepository.adjustProductQuantity(
        connection,
        {
          orgId,
          productId: item.product_id,
          delta: quantity,
        },
      );

      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId:
            data.warehouse_id ?? production.warehouse_id,
          productId: item.product_id,
          productUnitId: item.product_unit_id,
          delta: quantity,
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id:
              data.warehouse_id ?? production.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnLocalId,
            reference_type: 'production_return',
            transaction_type: 'production_return',
            quantity,
            unit_cost: Number(item.unit_price || 0),
            total_cost: Number(item.subtotal || 0),
            currency:
              item.currency
              || productionReturn.currency
              || production.currency
              || null,
            date: data.return_date || new Date(),
            description:
              `Production return for Production #${production.production_number || productionId}`,
            status: 1,
          },
        },
      );
    }

    const receivableAccount =
      await productionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'RECEIVABLE',
        },
      );

    if (!receivableAccount) {
      throw new AppError(
        'RECEIVABLE account not found.',
        500,
        'RECEIVABLE_ACCOUNT_NOT_FOUND',
      );
    }

    if (data.account_id) {
      await createJournalEntry(
        connection,
        {
          orgId,
          userId,
          requestContext,
          data: {
            date:
              data.return_date
              || new Date().toISOString().slice(0, 10),
            reference_id: returnLocalId,
            reference_type: 'production_return',
            description:
              `Production Return Transaction for Production #${production.production_number || productionId}`,
            currency:
              productionReturn.currency
              || production.currency
              || null,
            first_entry_account: data.account_id,
            first_entry_debit: 0,
            first_entry_credit: Number(productionReturn.total_amount || 0),
            second_entry_account: receivableAccount.id,
            second_entry_debit: Number(productionReturn.total_amount || 0),
            second_entry_credit: 0,
            status: 1,
          },
          description:
            `Created production return journal for return ${productionReturn.id}`,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'production_returns',
        entityId: productionReturn.id,

        oldValues: null,
        newValues: {
          ...productionReturn,
          items: createdItems,
        },

        description:
          `Created production return ${productionReturn.return_number || `#${productionReturn.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Production changes affect dashboard aggregates. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...productionReturn,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteReturn({
  user,
  returnId,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const productionReturn =
      await productionRepository.findReturnByLocalId(
        connection,
        {
          orgId,
          localId: returnId,
          forUpdate: true,
        },
      );

    if (!productionReturn) {
      throw new AppError(
        'Production return not found.',
        404,
        'PRODUCTION_RETURN_NOT_FOUND',
      );
    }

    if (Number(productionReturn.status) === 0) {
      throw new AppError(
        'Production return is already deleted.',
        409,
        'PRODUCTION_RETURN_ALREADY_DELETED',
      );
    }

    const production =
      await productionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productionReturn.production_id,
        },
      );

    const returnItems =
      await productionRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
        },
      );

    for (const item of returnItems) {
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) continue;

      await productionRepository.adjustProductQuantity(
        connection,
        {
          orgId,
          productId: item.product_id,
          delta: -quantity,
        },
      );

      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId:
            productionReturn.warehouse_id
            || production?.warehouse_id,
          productId: item.product_id,
          productUnitId: item.product_unit_id,
          delta: -quantity,
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id:
              productionReturn.warehouse_id
              || production?.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnId,
            reference_type: 'production_return',
            transaction_type: 'production_return_revert',
            quantity: -quantity,
            unit_cost: Number(item.unit_price || 0),
            total_cost: -Number(item.subtotal || 0),
            currency:
              item.currency
              || productionReturn.currency
              || null,
            date: new Date(),
            description:
              `Deleted production return #${returnId}`,
            status: 1,
          },
        },
      );
    }

    const deletedReturn =
      await productionRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: returnId,
          userId,
        },
      );

    await productionRepository.softDeleteReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId,
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: returnId,
        referenceType: 'production_return',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'production_returns',
        entityId: returnId,

        oldValues: {
          ...productionReturn,
          items: returnItems,
        },
        newValues: deletedReturn,

        description:
          `Deleted production return #${returnId}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Production changes affect dashboard aggregates. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return deletedReturn;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listProductions,
  getProduction,
  createProduction,
  updateProduction,
  deleteProduction,
  createReturn,
  deleteReturn,
};
