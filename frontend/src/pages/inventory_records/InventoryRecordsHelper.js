import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';
import { productApi } from '../../api/productApi.js';
import { currencyApi } from '../../api/currencyApi.js';

import { getMultiple } from '../stocktransactions/calculateStock.js';

let currencies = [];
let products = [];

function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
  if (!fromCurrencyCode || !toCurrencyCode) return amount;
  const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
  const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
  if (!fromCurrency || !toCurrency) return amount;
  const fromRate = Number(fromCurrency.exchangeRate || 1);
  const toRate = Number(toCurrency.exchangeRate || 1);
  return (amount / toRate) * fromRate;
}

export async function calculateRemainingAndBenefit(inventory_recordId) {
  currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  products = (await productApi.getAll({ status: 1 }))?.data || [];

  const inventory_recordResponse = await inventoryRecordApi.getById(inventory_recordId);
  const inventory_record = inventory_recordResponse?.data;
  if (!inventory_record) return;

  const inventory_recordItems = (inventory_record.items || []).filter(
    (item) => Number(item.status) === 1,
  );
  let benefit = 0;
  for (const item of inventory_recordItems) {
    const product = products.find((p) => Number(p.id) === Number(item.product_id));
    if (!product) continue;
    let costPrice = exchangeRate(
      Number(item.buy_price || product.buy_price),
      item.buy_price_currency || product.buy_currency,
      inventory_record.currency,
    );
    if (item.product_unit_id != product.product_unit_id) {
      const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
      costPrice = multiple * costPrice;
    }
    const itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
    benefit += itemBenefit;
  }

  benefit -= calculateDiscountAmount(inventory_record);
  const inventory_recordPayments = (inventory_record.payments || []).filter(
    (p) => Number(p.status) === 1,
  );

  let totalPayments = inventory_recordPayments.reduce((sum, p) => {
    if (p.currency === inventory_record.currency) {
      return sum + Number(p.amount);
    }
    return sum;
  }, 0);

  const inventory_recordReturns = (inventory_record.returns || []).filter(
    (r) => Number(r.status) === 1,
  );

  let totalReturnAmount = 0;

  inventory_recordReturns.forEach((ret) => {
    totalReturnAmount += Number(ret.total_amount);
  });

  const remaining = Number(inventory_record.total_amount) - totalPayments - totalReturnAmount;

  await inventoryRecordApi.update(inventory_recordId, {
    benefit,
    remaining,
    items_count: inventory_recordItems.length,
    total_amount: Number(inventory_record.total_amount) || 0,
  });
  console.log('Calculated InventoryRecord id:', inventory_recordId, 'benefit:', benefit, 'Remaining:', remaining);
  return { benefit, remaining };
}

export function calculateDiscountAmount(inventory_record) {
  if (!inventory_record) return 0;
  if (inventory_record.discount_type === 'percent') {
    let dif = 100 - Number(inventory_record.discount_amount || 0);
    return (
      ((Number(inventory_record.total_amount || 0) - Number(inventory_record.expense_amount || 0)) / dif) *
      Number(inventory_record.discount_amount || 0)
    );
  } else {
    return Number(inventory_record.discount_amount || 0);
  }
}

export async function calculateRemainingAndBenefitOfAllInventoryRecords() {
  currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  products = (await productApi.getAll({ status: 1 }))?.data || [];
  console.log('Calculating remaining and benefit for all inventory_records...');

  const modalElement = document.getElementById('inventory_recordsCalculationModal');
  const progressBar = document.getElementById('inventory_recordsCalculationProgress');
  const progressText = document.getElementById('inventory_recordsCalculationText');

  if (progressBar) {
    progressBar.style.width = `${0}%`;
  }
  const modal = new window.mdb.Modal(modalElement);

  modal.show();

  try {
    const inventory_records = (await inventoryRecordApi.getAll({ status: 1 }))?.data || [];

    for (let i = 0; i < inventory_records.length; i++) {
      const inventory_record = inventory_records[i];
      const inventory_recordResponse = await inventoryRecordApi.getById(inventory_record.id);
      const fullRecord = inventory_recordResponse?.data;
      if (!fullRecord) continue;

      const items = (fullRecord.items || []).filter((item) => Number(item.status) === 1);
      let benefit = 0;
      for (const item of items) {
        const product = products.find((p) => Number(p.id) === Number(item.product_id));
        if (!product) continue;
        let costPrice = exchangeRate(
          Number(item.buy_price || product.buy_price),
          item.buy_price_currency || product.buy_currency,
          fullRecord.currency,
        );
        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }
        const itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        benefit += itemBenefit;
      }
      benefit -= calculateDiscountAmount(fullRecord);
      const payments = (fullRecord.payments || []).filter((p) => Number(p.status) === 1);
      let totalPayments = payments.reduce((sum, p) => {
        if (p.currency === fullRecord.currency) {
          return sum + Number(p.amount);
        }
        return sum;
      }, 0);

      const returns = (fullRecord.returns || []).filter((r) => Number(r.status) === 1);
      let totalReturnAmount = 0;
      returns.forEach((ret) => {
        totalReturnAmount += Number(ret.total_amount);
      });

      const remaining = Number(fullRecord.total_amount) - totalPayments - totalReturnAmount;
      await inventoryRecordApi.update(fullRecord.id, {
        benefit,
        remaining,
        items_count: items.length,
      });

      const percent = Math.round(((i + 1) / inventory_records.length) * 100);

      if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.innerText = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
      }

      if (progressText) {
        progressText.innerText =
          `${i + 1} of ${inventory_records.length} | ` +
          `InventoryRecord ID: ${fullRecord.id}`;
      }

      console.log(
        `${i + 1} of ${inventory_records.length} - ` +
          `InventoryRecord ID: ${fullRecord.id}, ` +
          `Benefit: ${fullRecord.benefit}, ` +
          `Remaining: ${fullRecord.remaining}`,
      );

      // Allow UI repaint
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (progressText) {
      progressText.innerText = 'Calculation completed!';
    }
  } catch (error) {
    console.error(error);
    if (progressText) {
      progressText.innerText = 'Calculation failed!';
    }
  }

  // Small delay so user sees 100%
  setTimeout(() => {
    modal.hide();
  }, 800);
}
