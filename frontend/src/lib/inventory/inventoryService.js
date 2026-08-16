import { productApi } from '../../api/productApi.js';

/*
 * The local Dexie inventory engine (applyOpeningStock / applyPurchase /
 * applySale / applyPurchaseReturn / applySaleReturn and all of their
 * helpers) has been fully replaced by the online modules: purchases,
 * sales, returns, stock transfers, wastes and product opening stock all
 * adjust product quantity, warehouse balance, stock movements, batches
 * and journals inside their own MySQL transactions on the backend.
 *
 * This file now only provides the online "recalculation" used by
 * calculateStock.js.
 */
export async function recalculateProductStock(
  productId,
  methodOverride = null,
) {
  /*
   * Online: product.quantity is owned by the backend (confirmed
   * purchases add stock, confirmed sales deduct it inside their own
   * MySQL transactions), so a "recalculation" is a refresh from the
   * API rather than a local replay of Dexie stock transactions.
   */
  const response =
    await productApi.getById(
      Number(productId),
    );

  return response?.data || null;
}
