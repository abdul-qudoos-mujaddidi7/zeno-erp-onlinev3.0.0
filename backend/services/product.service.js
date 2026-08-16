const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productRepository =
  require('../repositories/product.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const batchLedger =
  require('./batch-ledger.service');


const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

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

async function listProducts({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return productRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      type: filters.type || null,
      exclude_type: filters.exclude_type || null,
      categoryId: filters.category_id || null,
      pagination,
    },
  );
}

async function getProduct({
  user,
  productId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const product =
    await productRepository.findByLocalId(
      db,
      {
        orgId,
        localId: productId,
      },
    );

  if (!product) {
    throw new AppError(
      'Product not found.',
      404,
      'PRODUCT_NOT_FOUND',
    );
  }

  return product;
}

async function createProduct({
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

    /*
     * Seed the current MySQL quantity from the opening stock
     * entered at product creation. The Dexie inventory engine
     * (applyOpeningStock/calculateProductStock) only updates
     * the local products table, so the online record must carry
     * the quantity itself or it would read back as 0.
     */
    const createData = {
      ...data,
      quantity:
        data.quantity ??
        data.initial_quantity ??
        0,
    };

    const product =
      await productRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data: createData,
        },
      );

    /*
     * Warehouse balances: opening stock entered at product
     * creation lands in the chosen warehouse inside the same
     * transaction, so the per-warehouse row matches the product
     * quantity from day one.
     */
    if (
      data.initial_warehouse_id &&
      Number(createData.quantity || 0) > 0
    ) {
      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId: data.initial_warehouse_id,
          productId: localId,
          productUnitId: data.product_unit_id,
          delta: Number(createData.quantity || 0),
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id: data.initial_warehouse_id,
            product_id: localId,
            product_unit_id: data.product_unit_id,
            reference_id: localId,
            reference_type: 'manual_adjustment',
            transaction_type: 'adjustment_in',
            quantity: Number(createData.quantity || 0),
            unit_cost: Number(data.buy_price || 0),
            total_cost: Number(data.buy_price || 0) * Number(createData.quantity || 0),
            currency: data.buy_currency || null,
            peer_price: Number(data.sell_price || 0),
            peer_currency: data.sell_currency || null,
            date: new Date(),
            description: `Initial stock for product ${product.name}`,
            status: 1,
          },
        },
      );

      await batchLedger.createOpeningStockBatch(
        connection,
        {
          orgId,
          userId,
          productId: localId,
          warehouseId: data.initial_warehouse_id,
          quantity: createData.quantity,
          unitCost: data.buy_price,
          currency: data.buy_currency,
          receivedAt: new Date(),
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'products',
        entityId: product.id,

        oldValues: null,
        newValues: product,

        description:
          `Created product ${product.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return product;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProduct({
  user,
  productId,
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

    const oldProduct =
      await productRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productId,
          forUpdate: true,
        },
      );

    if (!oldProduct) {
      throw new AppError(
        'Product not found.',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    /*
     * Opening stock on edit: when a product that had no initial
     * warehouse gets one (with a quantity) during editing, the
     * online record must carry the quantity and the per-warehouse
     * row must be seeded the same way creation does - otherwise
     * edit-time stock only existed in the local Dexie engine.
     */
    const updateData = {
      ...data,
      quantity:
        Number(oldProduct.initial_warehouse_id) === 0 &&
        data.initial_warehouse_id &&
        Number(data.initial_quantity || 0) > 0
          ? Number(data.initial_quantity || 0)
          : data.quantity,
    };

    const updatedProduct =
      await productRepository.update(
        connection,
        {
          orgId,
          localId: productId,
          userId,
          data: updateData,
        },
      );

    if (
      Number(oldProduct.initial_warehouse_id) === 0 &&
      data.initial_warehouse_id &&
      Number(data.initial_quantity || 0) > 0
    ) {
      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId: data.initial_warehouse_id,
          productId,
          productUnitId: data.product_unit_id,
          delta: Number(data.initial_quantity || 0),
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id: data.initial_warehouse_id,
            product_id: productId,
            product_unit_id: data.product_unit_id,
            reference_id: productId,
            reference_type: 'manual_adjustment',
            transaction_type: 'adjustment_in',
            quantity: Number(data.initial_quantity || 0),
            unit_cost: Number(data.buy_price || 0),
            total_cost: Number(data.buy_price || 0) * Number(data.initial_quantity || 0),
            currency: data.buy_currency || null,
            peer_price: Number(data.sell_price || 0),
            peer_currency: data.sell_currency || null,
            date: new Date(),
            description: `Opening stock for product ${updatedProduct.name}`,
            status: 1,
          },
        },
      );

      await batchLedger.createOpeningStockBatch(
        connection,
        {
          orgId,
          userId,
          productId,
          warehouseId: data.initial_warehouse_id,
          quantity: data.initial_quantity,
          unitCost: data.buy_price,
          currency: data.buy_currency,
          receivedAt: new Date(),
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'products',
        entityId: updatedProduct.id,

        oldValues: oldProduct,
        newValues: updatedProduct,

        description:
          `Updated product ${updatedProduct.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedProduct;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProduct({
  user,
  productId,
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

    const oldProduct =
      await productRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productId,
          forUpdate: true,
        },
      );

    if (!oldProduct) {
      throw new AppError(
        'Product not found.',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    if (Number(oldProduct.status) === 0) {
      throw new AppError(
        'Product is already deleted.',
        409,
        'PRODUCT_ALREADY_DELETED',
      );
    }

    const deletedProduct =
      await productRepository.softDelete(
        connection,
        {
          orgId,
          localId: productId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'products',
        entityId: deletedProduct.id,

        oldValues: oldProduct,
        newValues: deletedProduct,

        description:
          `Deleted product ${oldProduct.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedProduct;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
