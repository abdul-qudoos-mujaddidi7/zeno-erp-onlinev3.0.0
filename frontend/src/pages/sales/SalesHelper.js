import { saleApi } from '../../api/saleApi.js';
import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';

import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
import { getInventoryMethod, isBatchMethod } from '../../stores/organizationStore.js';
import { currencyApi } from '../../api/currencyApi.js';
import { productApi } from '../../api/productApi.js';

let currencies = [];
let products = [];

function normalizeCurrencyCode(code) {
  return String(code || '').trim();
}

function exchangeRate(amount, fromCurrencyCode, toCurrencyCode, currencyList = currencies) {
  const fromCode = normalizeCurrencyCode(fromCurrencyCode);
  const toCode = normalizeCurrencyCode(toCurrencyCode);
  if (!fromCode || !toCode || fromCode === toCode) return Number(amount) || 0;
  const fromCurrency = currencyList.find((c) => normalizeCurrencyCode(c.code) === fromCode);
  const toCurrency = currencyList.find((c) => normalizeCurrencyCode(c.code) === toCode);
  if (!fromCurrency || !toCurrency) return Number(amount) || 0;
  const fromRate = Number(fromCurrency.exchangeRate || 1);
  const toRate = Number(toCurrency.exchangeRate || 1);
  return ((Number(amount) || 0) / toRate) * fromRate;
}

/*
 * buy_price is stored in the product purchase currency. Some save paths
 * used to write the sale/sell currency onto buy_price_currency, which
 * made 12.6 USD subtract as 12.6 AFN. Prefer the product buy currency
 * whenever the stored currency matches the sale or sell currency.
 */
export function resolveCostCurrency(item, product, saleCurrency) {
  const productBuy = normalizeCurrencyCode(product?.buy_currency || item?.buy_currency);
  const stored = normalizeCurrencyCode(item?.buy_price_currency);
  const saleCode = normalizeCurrencyCode(saleCurrency);
  const sellCode = normalizeCurrencyCode(item?.currency || saleCurrency);

  if (productBuy && stored && stored !== productBuy && (stored === saleCode || stored === sellCode)) {
    return productBuy;
  }
  return stored || productBuy || saleCode;
}

export function resolveBuyPriceCurrency(item, product, saleCurrency) {
  return (
    normalizeCurrencyCode(item?.buy_price_currency) ||
    normalizeCurrencyCode(product?.buy_currency) ||
    normalizeCurrencyCode(item?.buy_currency) ||
    normalizeCurrencyCode(saleCurrency)
  );
}

export function resolveItemCostPrice(item, product, sale, currencyList = currencies) {
  const saleCurrency = sale?.currency;
  const costCurrency = resolveCostCurrency(item, product, saleCurrency);
  if (isBatchMethod(getInventoryMethod()) && item.fifo_cost != null && Number(item.fifo_cost) > 0) {
    const fifoUnit = Number(item.fifo_cost) / Number(item.quantity || 1);
    return exchangeRate(fifoUnit, costCurrency, saleCurrency, currencyList);
  }
  return exchangeRate(
    Number(item.buy_price || product.buy_price) || 0,
    costCurrency,
    saleCurrency,
    currencyList,
  );
}

export function usesBatchCost(item) {
  return isBatchMethod(getInventoryMethod()) && item.fifo_cost != null && Number(item.fifo_cost) > 0;
}

export async function calculateRemainingAndBenefit(saleId) {
  currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

  const saleResponse = await saleApi.getById(saleId);
  const sale = saleResponse?.data;
  if (!sale || Number(sale.status) === 0) return;

  const saleItems = (sale.items || []).filter((item) => Number(item.status) === 1);
  if (
    saleItems.length === 0 &&
    (sale.items || []).some((item) => Number(item.status) === 0)
  ) {
    return;
  }
  products = await fetchProductsByIds(saleItems.map((item) => item.product_id));

  let benefit = 0;
  for (const item of saleItems) {
    const product = products.find((p) => Number(p.id) === Number(item.product_id));
    if (!product) continue;
    let costPrice = resolveItemCostPrice(item, product, sale);
    if (!usesBatchCost(item) && item.product_unit_id != product.product_unit_id) {
      const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
      costPrice = multiple * costPrice;
    }
    const sellPrice = exchangeRate(Number(item.unit_price) || 0, item.currency || sale.currency, sale.currency);
    benefit += (sellPrice - costPrice) * Number(item.quantity);
  }

  benefit -= calculateDiscountAmount(sale);
  const salePayments = (sale.payments || []).filter((p) => Number(p.status) === 1);

  let totalPayments = salePayments.reduce((sum, p) => {
    if (p.currency === sale.currency) {
      return sum + Number(p.amount);
    }
    return sum + Number(exchangeRate(Number(p.amount), p.currency, sale.currency));
  }, 0);

  const saleReturns = (sale.returns || []).filter((r) => Number(r.status) === 1);

  let totalReturnAmount = 0;

  saleReturns.forEach((ret) => {
    totalReturnAmount += Number(ret.total_amount);
  });

  const remaining = Number(sale.total_amount) - totalPayments - totalReturnAmount;

  /*
   * Always send total_amount too. A benefit/remaining-only PATCH used to
   * make the backend rewrite the sale journal as 0 (undefined → 0), which
   * left the payment credit on WALKIN and inflated the balance.
   */
  await saleApi.update(saleId, {
    benefit,
    remaining,
    items_count: saleItems.length,
    total_amount: Number(sale.total_amount) || 0,
  });
  console.log('Calculated Sale id:', saleId, 'benefit:', benefit, 'Remaining:', remaining);
  return { benefit, remaining };
}

export function calculateDiscountAmount(sale) {
  if (!sale) return 0;
  if (sale.discount_type === 'percent') {
    let dif = 100 - Number(sale.discount_amount || 0);
    return (Number(sale.total_amount || 0) - Number(sale.expense_amount || 0)) / dif * Number(sale.discount_amount || 0);
  } else {
    return Number(sale.discount_amount || 0);
  }
}

export async function calculateRemainingAndBenefitOfAllSales() {
  currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  products = (await productApi.getAll({ status: 1 }))?.data || [];
  console.log('Calculating remaining and benefit for all sales...');

  const modalElement = document.getElementById('salesCalculationModal');
  const progressBar = document.getElementById('salesCalculationProgress');
  const progressText = document.getElementById('salesCalculationText');

  if (progressBar) {
    progressBar.style.width = `${0}%`;
  }
  const modal = new window.mdb.Modal(modalElement);

  modal.show();

  try {
    const sales = (await saleApi.getAll({ status: 1 }))?.data || [];

    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const saleResponse = await saleApi.getById(sale.id);
      const fullSale = saleResponse?.data;
      if (!fullSale) continue;

      const items = (fullSale.items || []).filter((item) => Number(item.status) === 1);
      let benefit = 0;
      for (const item of items) {
        const product = products.find((p) => Number(p.id) === Number(item.product_id));
        if (!product) continue;
        let costPrice = resolveItemCostPrice(item, product, fullSale);
        if (!usesBatchCost(item) && item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }
        const sellPrice = exchangeRate(
          Number(item.unit_price) || 0,
          item.currency || fullSale.currency,
          fullSale.currency,
        );
        benefit += (sellPrice - costPrice) * Number(item.quantity);
      }
      benefit -= calculateDiscountAmount(fullSale);
      const payments = (fullSale.payments || []).filter((p) => Number(p.status) === 1);
      let totalPayments = payments.reduce((sum, p) => {
        if (p.currency === fullSale.currency) {
          return sum + Number(p.amount);
        }
        return sum + Number(exchangeRate(Number(p.amount), p.currency, fullSale.currency));
      }, 0);

      const returns = (fullSale.returns || []).filter((r) => Number(r.status) === 1);
      let totalReturnAmount = 0;
      returns.forEach((ret) => {
        totalReturnAmount += Number(ret.total_amount);
      });

      const remaining = Number(fullSale.total_amount) - totalPayments - totalReturnAmount;
      await saleApi.update(fullSale.id, {
        benefit,
        remaining,
        items_count: items.length,
        total_amount: Number(fullSale.total_amount) || 0,
      });

      const percent = Math.round(((i + 1) / sales.length) * 100);

      if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.innerText = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
      }

      if (progressText) {
        progressText.innerText =
          `${i + 1} of ${sales.length} | ` +
          `Sale ID: ${fullSale.id}`;
      }

      console.log(
        `${i + 1} of ${sales.length} - ` +
        `Sale ID: ${fullSale.id}, ` +
        `Benefit: ${fullSale.benefit}, ` +
        `Remaining: ${fullSale.remaining}`
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
