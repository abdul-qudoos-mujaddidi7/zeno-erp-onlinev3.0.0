import { writable } from 'svelte/store';
import { stockTransactionApi } from '../api/stockTransactionApi.js';

export const stockTransactions = writable([]);

export async function loadStockTransactions() {
  const txs = (await stockTransactionApi.getAll())?.data || [];
  stockTransactions.set(txs);
}

export async function addStockTransaction(tx) {
  await stockTransactionApi.create(tx);
  await loadStockTransactions();
}

export async function updateStockTransaction(id, tx) {
  await stockTransactionApi.update(id, tx);
  await loadStockTransactions();
}

export async function deleteStockTransaction(id) {
  await stockTransactionApi.remove(id);
  await loadStockTransactions();
}
