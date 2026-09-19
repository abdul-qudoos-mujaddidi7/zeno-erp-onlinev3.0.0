const productRepository =
  require('../repositories/product.repository');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const unitsByExecutor = new WeakMap();
const productsByExecutor = new WeakMap();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildUnitMaps(units) {
  const unitMap = new Map(
    (units || []).map((unit) => [
      Number(unit.id),
      unit,
    ]),
  );

  const childrenMap = {};

  (units || []).forEach((unit) => {
    const parentId = Number(unit.subunit_id || 0);

    if (!parentId) {
      return;
    }

    if (!childrenMap[parentId]) {
      childrenMap[parentId] = [];
    }

    childrenMap[parentId].push(unit);
  });

  return {
    unitMap,
    childrenMap,
  };
}

function convertQuantityBetweenUnits(
  quantity,
  fromUnitId,
  toUnitId,
  units,
) {
  const fromId = Number(fromUnitId || 0);
  const toId = Number(toUnitId || 0);
  const numericQuantity = toNumber(quantity);

  if (!fromId || !toId || fromId === toId) {
    return numericQuantity;
  }

  const {
    unitMap,
    childrenMap,
  } = buildUnitMaps(units);

  const visited = new Set();

  function dfs(unitId, value) {
    if (unitId === toId) {
      return value;
    }

    if (visited.has(unitId)) {
      return null;
    }

    visited.add(unitId);

    const unit = unitMap.get(unitId);

    if (
      unit?.subunit_id &&
      Number(unit.subunit_multiple)
    ) {
      const result = dfs(
        Number(unit.subunit_id),
        value * Number(unit.subunit_multiple),
      );

      if (result !== null) {
        return result;
      }
    }

    const children = childrenMap[unitId] || [];

    for (const child of children) {
      const multiple = Number(child.subunit_multiple || 0);

      if (!multiple) {
        continue;
      }

      const result = dfs(
        Number(child.id),
        value / multiple,
      );

      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  const result = dfs(fromId, numericQuantity);

  if (result === null) {
    return numericQuantity;
  }

  return Number(Number(result).toFixed(9));
}

async function getOrgUnits(executor, orgId) {
  let cache = unitsByExecutor.get(executor);

  if (!cache) {
    cache = new Map();
    unitsByExecutor.set(executor, cache);
  }

  if (!cache.has(orgId)) {
    const units = await productUnitRepository.findAll(
      executor,
      {
        orgId,
        status: 1,
      },
    );

    cache.set(orgId, units || []);
  }

  return cache.get(orgId);
}

async function getProduct(executor, orgId, productId) {
  const key = Number(productId);
  let cache = productsByExecutor.get(executor);

  if (!cache) {
    cache = new Map();
    productsByExecutor.set(executor, cache);
  }

  if (!cache.has(key)) {
    const product = await productRepository.findByLocalId(
      executor,
      {
        orgId,
        localId: productId,
      },
    );

    cache.set(key, product || null);
  }

  return cache.get(key);
}

async function convertItemQuantityToProductUnit(
  executor,
  {
    orgId,
    productId,
    fromUnitId,
    quantity,
  },
) {
  const numericQuantity = toNumber(quantity);

  if (!productId) {
    return {
      quantity: numericQuantity,
      productUnitId: fromUnitId || null,
    };
  }

  const product = await getProduct(
    executor,
    orgId,
    productId,
  );

  const toUnitId = product?.product_unit_id || fromUnitId;
  const units = await getOrgUnits(executor, orgId);
  const converted = convertQuantityBetweenUnits(
    numericQuantity,
    fromUnitId || toUnitId,
    toUnitId,
    units,
  );

  return {
    quantity: converted,
    productUnitId: toUnitId || null,
    isService:
      String(product?.type || '').trim().toLowerCase() === 'service',
  };
}

/*
 * ONE authoritative answer to "what does this document line mean in
 * product base units?".
 *
 * Every stock-affecting service must go through this before it touches
 * products.quantity, warehouse_products.quantity, stock_batches or
 * batch_consumptions, so all inventory balances are kept in the
 * product's base unit while the document line itself stays in whatever
 * business unit the user picked (and stock_transactions keeps the
 * entered quantity together with its product_unit_id so it can be
 * converted back on rebuild).
 */
async function itemQuantityInProductUnit(
  executor,
  {
    orgId,
    item,
  },
) {
  return convertItemQuantityToProductUnit(
    executor,
    {
      orgId,
      productId: item?.product_id,
      fromUnitId: item?.product_unit_id,
      quantity: item?.quantity,
    },
  );
}

module.exports = {
  convertQuantityBetweenUnits,
  convertItemQuantityToProductUnit,
  itemQuantityInProductUnit,
  getOrgUnits,
};
