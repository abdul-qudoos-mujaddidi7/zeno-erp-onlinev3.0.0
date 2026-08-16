import { productApi } from '../api/productApi.js';

/**
 * Fetch only the products needed for a detail page / payment section.
 * Avoids dumping the full product catalog into the browser.
 */
export async function fetchProductsByIds(ids = []) {
  const unique = [
    ...new Set(
      (ids || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  if (!unique.length) return [];

  const rows = await Promise.all(
    unique.map((id) =>
      productApi.getById(id).then((res) => res?.data).catch(() => null),
    ),
  );

  return rows.filter(Boolean);
}
