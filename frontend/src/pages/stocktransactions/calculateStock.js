import { productUnitApi } from '../../api/productUnitApi.js';
import { productApi } from '../../api/productApi.js';
import {
  recalculateProductStock as recalculateFromService,
} from '../../lib/inventory/inventoryService.js';
import {
  getInventoryMethod,
  fetchOrganizationInventoryMethod,
  InventoryMethod,
} from '../../stores/organizationStore.js';

let units = [];
let unitMap = new Map();
let childrenMap = {};
let unitsLoadPromise = null;

const VALID_METHODS = new Set([
  InventoryMethod.CLASSIC,
  InventoryMethod.FIFO,
  InventoryMethod.LIFO,
]);

function normalizeInventoryMethod(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  return VALID_METHODS.has(normalized)
    ? normalized
    : null;
}

async function loadUnits(force = false) {
  if (!force && units.length) {
    return units;
  }

  if (!force && unitsLoadPromise) {
    return unitsLoadPromise;
  }

  unitsLoadPromise = (async () => {
    /*
     * Online: product_units are owned by /api/v2/product-units
     * (synced rows keep the same local_id values as Dexie used).
     */
    const response =
      await productUnitApi.getAll({ status: 1 });

    units = (response?.data || []).filter(
      (unit) => Number(unit.status) === 1,
    );

    buildUnitMaps();

    return units;
  })();
  try {
    return await unitsLoadPromise;
  } finally {
    unitsLoadPromise = null;
  }
}

function buildUnitMaps() {
  unitMap = new Map(
    units.map((unit) => [
      Number(unit.id),
      unit,
    ]),
  );

  childrenMap = {};

  units.forEach((unit) => {
    const parentId = Number(unit.subunit_id || 0);

    if (!parentId) return;

    if (!childrenMap[parentId]) {
      childrenMap[parentId] = [];
    }

    childrenMap[parentId].push(unit);
  });
}

/**
 * Resolve the real inventory method.
 *
 * Never silently fall back to CLASSIC because that can recalculate FIFO/LIFO
 * organizations from the wrong source.
 */
export async function resolveInventoryMethod(
  methodOverride = null,
) {
  const override = normalizeInventoryMethod(
    methodOverride,
  );

  if (override) {
    return override;
  }

  const current = normalizeInventoryMethod(
    getInventoryMethod(),
  );

  if (current) {
    return current;
  }

  const fetched = normalizeInventoryMethod(
    await fetchOrganizationInventoryMethod(),
  );

  if (!fetched) {
    throw new Error(
      'A valid inventory method is required.',
    );
  }

  return fetched;
}

function convertQuantityBetweenUnits(
  quantity,
  fromUnitId,
  toUnitId,
) {
  const fromId = Number(fromUnitId || 0);
  const toId = Number(toUnitId || 0);
  const numericQuantity = Number(quantity || 0);

  if (
    !fromId ||
    !toId ||
    fromId === toId
  ) {
    return numericQuantity;
  }

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
      const multiple = Number(
        child.subunit_multiple || 0,
      );

      if (!multiple) continue;

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
    console.warn(
      'Could not convert product units. Original quantity was used.',
      {
        quantity: numericQuantity,
        fromUnitId: fromId,
        toUnitId: toId,
      },
    );

    return numericQuantity;
  }

  return result;
}

export async function ensureProductUnitsLoaded() {
  await loadUnits();
}

export function convertUnitSync(
  quantity,
  fromUnitId,
  toUnitId,
) {
  return convertQuantityBetweenUnits(
    quantity,
    fromUnitId,
    toUnitId,
  );
}

export async function getMultiple(
  fromUnitId,
  toUnitId,
) {
  await loadUnits();

  if (
    Number(fromUnitId) === Number(toUnitId)
  ) {
    return 1;
  }

  return convertQuantityBetweenUnits(
    1,
    fromUnitId,
    toUnitId,
  );
}

export async function convertUnit(
  quantity,
  fromUnitId,
  toUnitId,
) {
  await loadUnits();

  return convertQuantityBetweenUnits(
    quantity,
    fromUnitId,
    toUnitId,
  );
}

function roundQty(value) {
  return Number(Number(value || 0).toFixed(9));
}

function hasLinkedSubunit(unit) {
  return Number(unit?.subunit_id) > 0 && Number(unit?.subunit_multiple) > 0;
}

export function decomposeQuantityWithUnits(
  quantity,
  unitId,
  unitsList = [],
) {
  const list = unitsList || [];
  const unitsById = new Map(
    list.map((unit) => [
      Number(unit.id),
      unit,
    ]),
  );

  const start = unitsById.get(Number(unitId));
  const numericQuantity = Number(quantity || 0);

  if (!start) {
    if (!numericQuantity) return [];

    return [
      {
        unit_id: Number(unitId) || 0,
        unit_name: '',
        quantity: numericQuantity,
      },
    ];
  }

  const down = [];
  const seenDown = new Set();
  let current = start;

  while (current && !seenDown.has(Number(current.id))) {
    seenDown.add(Number(current.id));
    down.push(current);

    if (!hasLinkedSubunit(current)) {
      break;
    }

    const next = unitsById.get(Number(current.subunit_id));
    if (!next) {
      break;
    }

    current = next;
  }

  const up = [];
  const used = new Set([Number(start.id)]);
  current = start;

  while (current) {
    const parent = list.find(
      (unit) =>
        Number(unit.subunit_id) === Number(current.id) &&
        Number(unit.subunit_multiple) > 0 &&
        !used.has(Number(unit.id)),
    );

    if (!parent) {
      break;
    }

    used.add(Number(parent.id));
    up.unshift(parent);
    current = parent;
  }

  const chain = [...up, ...down];
  const sign = numericQuantity < 0 ? -1 : 1;
  let qtyInLargest = Math.abs(numericQuantity);

  for (let index = up.length - 1; index >= 0; index -= 1) {
    qtyInLargest /= Number(up[index].subunit_multiple);
  }

  if (chain.length === 1) {
    return [
      {
        unit_id: Number(start.id),
        unit_name: start.name,
        quantity: roundQty(numericQuantity),
      },
    ];
  }

  let smallestQty = qtyInLargest;

  for (let index = 0; index < chain.length - 1; index += 1) {
    smallestQty *= Number(chain[index].subunit_multiple || 1);
  }

  smallestQty = roundQty(smallestQty);

  const result = [];

  for (let index = 0; index < chain.length; index += 1) {
    const unit = chain[index];
    const isLast = index === chain.length - 1;
    let factor = 1;

    for (
      let childIndex = index;
      childIndex < chain.length - 1;
      childIndex += 1
    ) {
      factor *= Number(chain[childIndex].subunit_multiple || 1);
    }

    const rawAmount = isLast
      ? smallestQty / factor
      : Math.floor(smallestQty / factor);
    const amount = roundQty(rawAmount);

    if (amount !== 0) {
      result.push({
        unit_id: Number(unit.id),
        unit_name: unit.name,
        quantity: amount * sign,
      });
    }

    smallestQty = roundQty(smallestQty - Math.floor(rawAmount) * factor);

    if (isLast) {
      smallestQty = 0;
    }
  }

  return result;
}

export async function decomposeQuantity(
  quantity,
  unitId,
) {
  await loadUnits();

  return decomposeQuantityWithUnits(
    quantity,
    unitId,
    units,
  );
}

/**
 * Recalculate every active product with one resolved organization method.
 *
 * CLASSIC  -> stock_transactions
 * FIFO/LIFO -> stock_batches.quantity_remaining
 *
 * warehouse_products is not cleared first. Each product/warehouse row is
 * safely overwritten by the canonical recalculation.
 */
export async function calculateAllStocks(
  methodOverride = null,
) {
  const modalElement = document.getElementById(
    'salesCalculationModal',
  );

  const progressBar = document.getElementById(
    'salesCalculationProgress',
  );

  const progressText = document.getElementById(
    'salesCalculationText',
  );

  let modalInstance = null;

  if (
    modalElement &&
    progressBar &&
    window.mdb?.Modal
  ) {
    progressBar.style.width = '0%';
    progressBar.innerText = '0%';
    progressBar.setAttribute(
      'aria-valuenow',
      '0',
    );

    modalInstance =
      window.mdb.Modal.getInstance?.(
        modalElement,
      ) ||
      new window.mdb.Modal(modalElement);

    modalInstance.show();
  }

  await loadUnits();

  const method = await resolveInventoryMethod(
    methodOverride,
  );

  const products =
    (await productApi.getAll({ status: 1 }))?.data || [];

  console.log('Recalculating inventory stock', {
    organizationId:
      localStorage.getItem('org_id'),
    inventoryMethod: method,
    productCount: products.length,
  });

  try {
    for (
      let index = 0;
      index < products.length;
      index += 1
    ) {
      const product = products[index];

      if (progressBar) {
        const percentage = products.length
          ? Math.round(
              ((index + 1) / products.length) *
                100,
            )
          : 100;

        progressBar.style.width =
          `${percentage}%`;

        progressBar.innerText =
          `${percentage}%`;

        progressBar.setAttribute(
          'aria-valuenow',
          String(percentage),
        );

        if (progressText) {
          progressText.innerText =
            `${index + 1} of ` +
            `${products.length} | ` +
            `Product ID: ${product.id}`;
        }
      }

      try {
        await productApi.reconcileStock(product.id);
      } catch (error) {
        console.error(
          'Failed to reconcile stock for product',
          product.id,
          error,
        );
      }
    }

    return {
      method,
      productCount: products.length,
    };
  } finally {
    if (modalInstance) {
      setTimeout(() => {
        try {
          modalInstance.hide();
        } catch (error) {
          console.warn(
            'Could not close stock calculation modal.',
            error,
          );
        }
      }, 800);
    }
  }
}

/**
 * Recalculate one product through the inventory service.
 *
 * The inventoryService replacement supplied with these files passes the unit
 * converter into CLASSIC recalculation and uses batches for FIFO/LIFO.
 */
export async function calculateProductStock(
  productId,
  methodOverride = null,
) {
  /*
   * Online: product.quantity is owned by the backend (confirmed
   * purchases add stock, confirmed sales deduct it inside their own
   * transactions), so a "recalculation" refreshes the product from
   * the API instead of replaying local Dexie stock transactions.
   */
  return recalculateFromService(
    productId,
    methodOverride,
  );
}

/**
 * Calculate and persist one warehouse/product balance using the correct
 * inventory source.
 */
export async function calculateCurrentStock(
  warehouseId,
  productId,
  methodOverride = null,
) {
  /*
   * Online: the backend owns the canonical product.quantity, so the
   * current stock is read straight from the API.
   */
  const response =
    await productApi.getById(
      Number(productId),
    );

  const product = response?.data;

  if (!product) {
    return null;
  }

  return Number(product.quantity || 0);
}

