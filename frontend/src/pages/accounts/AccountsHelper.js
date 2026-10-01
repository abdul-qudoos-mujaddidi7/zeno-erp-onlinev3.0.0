;
import { currencyApi } from '../../api/currencyApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
import { warehouseProductApi } from '../../api/warehouseProductApi.js';

let accounts = [];
let accountTypes = [];
let accountGroups = [];

export async function calculateBalancesOfAllAccounts({ status = 1, account_ids = '' } = {}) {
    let startTime = Date.now();
    const response = await accountApi.getBalances({ status, account_ids });
    const accountBalances = response?.data || {};
    console.log(`Fetched balances via /accounts/balances in ${Date.now() - startTime}ms`);
    return accountBalances;
}

/**
 * Credit/debit breakdown via SQL aggregates — never downloads journals.
 */
export async function calculateCreditDebitOfAllAccounts({ status = 1, account_ids = '' } = {}) {
    let startTime = Date.now();
    const response = await accountApi.getCreditDebit({ status, account_ids });
    const accountBalances = response?.data || {};
    console.log(`Fetched credit/debit via /accounts/credit-debit in ${Date.now() - startTime}ms`);
    return accountBalances;
}

let currencies  = [];
function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = parseFloat(fromCurrency.exchangeRate) || 1;;
    const toRate = parseFloat(toCurrency.exchangeRate) || 1;
    return (amount / toRate) * fromRate;
}

function sumRunning(inputs) {
    let runningBalance = {};
    inputs.forEach((i) => {
        Object.entries(i).forEach(([cur, bal]) => {
        if (runningBalance[cur] === undefined) runningBalance[cur] = 0;
        runningBalance[cur] += bal;
        });
    });
    return runningBalance;
}

export async function getGeneralBenefit() {
    let startTime = Date.now();

    const [
      accountBalances,
      accountsResponse,
      currenciesResponse,
      warehouseProductsResponse,
      productsResponse,
      directionalResponse,
    ] = await Promise.all([
      calculateBalancesOfAllAccounts(),
      accountApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
      warehouseProductApi.getAll({ status: 1 }),
      productApi.getAll({ status: 1 }),
      accountApi.getDirectionalBalances(),
    ]);
    
    accounts = accountsResponse?.data || [];
    accounts = accounts.filter((a) => a.code !== "NOTRACK" && a.code !== "RECEIVABLE" && a.code !== "PAYABLE" && a.code !== "SALES" && a.code !== "PURCHASE"&& a.code !== "EXCHANGE");
    accounts.forEach(acc => {
        if (accountBalances[acc.id]) {
            acc.computedBalances = accountBalances[acc.id];
        }
    });

    let TreasuryBalances = {};
    let AllCustomersBalances = {};
    let AllSupplierBalances = {};
    let AllShareholderBalances = {};
    const directionalByAccount = new Map();
    for (const row of directionalResponse?.data || []) {
      if (!directionalByAccount.has(Number(row.account_id))) directionalByAccount.set(Number(row.account_id), []);
      directionalByAccount.get(Number(row.account_id)).push(row);
    }

    accounts.forEach((a) => {
      if (a.computedBalances) {
        if (a.code == 'TREASURY') {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            TreasuryBalances[b[0]] = TreasuryBalances[b[0]] ? TreasuryBalances[b[0]] + thisBal : thisBal;
          });
        }

        for (const row of directionalByAccount.get(Number(a.id)) || []) {
          const currency = row.currency || 'AFN';
          if (Number(a.can_be_customer) === 1 || a.account_type_id == 4) {
            AllCustomersBalances[currency] = (AllCustomersBalances[currency] || 0) - Number(row.customer_receivable || 0);
          }
          if (Number(a.can_be_supplier) === 1 || a.account_type_id == 3) {
            AllSupplierBalances[currency] = (AllSupplierBalances[currency] || 0) + Number(row.supplier_payable || 0);
          }
        }

        if (a.account_type_id == 7) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            AllShareholderBalances[b[0]] = AllShareholderBalances[b[0]] ? AllShareholderBalances[b[0]] + thisBal : thisBal;
          });
        }
      }
    });

    currencies = currenciesResponse?.data || [];
    let defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';

    let totalPurchaseCostMap = {};
    let warehouse_products = warehouseProductsResponse?.data || [];
    let quantityMap = {};
    warehouse_products.forEach((wp) => {
      if (wp.status === 1) {
        quantityMap[wp.product_id] = (quantityMap[wp.product_id] || 0) + Number(wp.quantity);
      }
    });

    let products = productsResponse?.data || [];
    products.forEach((p) => {
      const buyPrice = parseFloat(p.buy_price) || 0;
      let qty = quantityMap[p.id] || 0;
      const buyCurrency = p.buy_currency;
      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty * -1;
    });

    let profitArray = Object.entries(
      sumRunning([
        TreasuryBalances,
        totalPurchaseCostMap,
        AllCustomersBalances,
        AllSupplierBalances,
        AllShareholderBalances,
      ]),
    );
    let defaultCurrencyProfit = 0;
    profitArray.forEach((pa,i)=>{
      if (pa[0] == defaultCurrency) {
        defaultCurrencyProfit += pa[1];
      } else {
        defaultCurrencyProfit += exchangeRate(pa[1], pa[0], defaultCurrency);
      }
    });

    console.log(`Calculated Net Benefit and took ${Date.now()-startTime}ms which is ${defaultCurrencyProfit} in ${defaultCurrency}`);

    return[defaultCurrency,defaultCurrencyProfit,accountBalances,totalPurchaseCostMap];
}

/*
 * Balances come from the SQL aggregate endpoint (/accounts/balances).
 * Downloading every journal row to add two columns client-side cost
 * hundreds of ms and tens of MB once an org passed a few thousand
 * entries; the aggregate answers the same question in a few ms.
 */
export async function calculateBalanceOfAccount(id) {
    let startTime = Date.now();
    const accountId = Number(id);
    const response = await accountApi.getBalances({ status: 1, account_ids: String(accountId) });
    const allBalances = response?.data || {};
    const balance = allBalances[accountId] || allBalances[String(accountId)] || {};
    console.log(`Calculated Balance of Account with ID (${id}) via /accounts/balances in ${Date.now()-startTime}ms`, balance);
    return balance;
}

/*
 * The account behind the dashboard Treasury card.
 *
 * Treasury balances arrive as a currency map, which carries no account id, so
 * the id is read back from the same system code those balances belong to
 * (`TREASURY`). Returns null when the org has no active treasury account, or
 * when the lookup is not allowed, so callers can keep an aggregate fallback.
 */
export async function findTreasuryAccountId() {
    const response = await accountApi.getAll({ status: 1, code: 'TREASURY' });
    const rows = response?.data || [];
    const treasury = rows.find((a) => a.code === 'TREASURY') || rows[0];

    return treasury?.id != null ? Number(treasury.id) : null;
}

export async function calculateBalanceOfTreasury() {
    let startTime = Date.now();

    const accountsResponse = await accountApi.getAll({ status: 1 });
    const allAccounts = accountsResponse?.data || [];
    let treasuryAccount = allAccounts.find((a) => a.code === 'TREASURY' && a.status === 1) || null;
    if (!treasuryAccount) return {};

    const response = await accountApi.getBalances({ status: 1, account_ids: String(treasuryAccount.id) });
    const allBalances = response?.data || {};
    const balance = allBalances[treasuryAccount.id] || allBalances[String(treasuryAccount.id)] || {};

    console.log(`Calculated Balance of TREASURY with ID (${treasuryAccount.id}) via /accounts/balances in ${Date.now()-startTime}ms`, balance);
    return balance;
}
