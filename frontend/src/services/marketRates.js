const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_MS = 15 * 60 * 1000;

let cachedRates = null;
let cachedAt = 0;

function parseRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function fetchUsdEurToAfnRates({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedRates && now - cachedAt < CACHE_MS) {
    return cachedRates;
  }

  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) throw new Error(`Rates request failed (${res.status})`);

    const data = await res.json();
    if (data?.result !== 'success') throw new Error('Rates response was not successful');

    const usdToAfn = parseRate(data?.rates?.AFN);
    const eurRate = parseRate(data?.rates?.EUR);
    const eurToAfn = usdToAfn && eurRate ? usdToAfn / eurRate : null;

    if (!usdToAfn || !eurToAfn) throw new Error('AFN rates missing from API response');

    cachedRates = {
      usdToAfn,
      eurToAfn,
      source: 'open.er-api.com',
      updatedAt: data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000) : new Date(),
    };
    cachedAt = now;
    return cachedRates;
  } catch (error) {
    console.warn('Live exchange rate fetch failed:', error);
    throw error;
  }
}

export async function fetchLocalUsdEurToAfnRates() {
  const { currencyApi } = await import('../api/currencyApi.js');
  const currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  const afn = currencies.find((c) => c.code === 'AFN' || c.isDefault == 1);
  const usd = currencies.find((c) => c.code === 'USD');
  const eur = currencies.find((c) => c.code === 'EUR');

  const afnRate = parseRate(afn?.exchangeRate) || 1;
  const usdToAfn = usd ? (parseRate(usd.exchangeRate) || 0) / afnRate : null;
  const eurToAfn = eur ? (parseRate(eur.exchangeRate) || 0) / afnRate : null;

  if (!usdToAfn || !eurToAfn) return null;

  return {
    usdToAfn,
    eurToAfn,
    source: 'local',
    updatedAt: usd?.exchangeRateDate || eur?.exchangeRateDate
      ? new Date(usd?.exchangeRateDate || eur?.exchangeRateDate)
      : new Date(),
  };
}

export async function getDashboardExchangeRates({ force = false } = {}) {
  try {
    return await fetchUsdEurToAfnRates({ force });
  } catch {
    return (await fetchLocalUsdEurToAfnRates()) || null;
  }
}
