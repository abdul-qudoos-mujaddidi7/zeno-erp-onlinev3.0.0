/**
 * Unit picker rules for the product form.
 *
 * The product form lets the user pick a unit category first and then shows
 * only the units that belong to it, so these two filters are the whole
 * behaviour. They live here, outside the component, so they can be tested
 * against realistic data without a browser or a database:
 *
 *   1. the category narrows the list — no category means "every unit";
 *   2. the typed search narrows what is left, case-insensitively.
 *
 * Ids arrive from the API as strings when large (BIGINT local ids are returned
 * as strings by the driver), so every comparison goes through `Number`.
 */

function toComparableId(value) {
  const id = Number(value);

  return Number.isFinite(id) && id !== 0 ? id : null;
}

/**
 * The units of one category. An empty/absent category keeps every unit, which
 * is what the "All Units" option means.
 */
export function unitsInCategory(units = [], categoryId = '') {
  const wanted = toComparableId(categoryId);

  if (!wanted) {
    return units || [];
  }

  return (units || []).filter(
    (unit) => toComparableId(unit?.unit_category_id) === wanted,
  );
}

/**
 * Case-insensitive name search. A blank search returns the list untouched.
 */
export function matchUnitSearch(units = [], search = '') {
  const query = String(search ?? '').trim().toLowerCase();

  if (!query) {
    return units || [];
  }

  return (units || []).filter((unit) => {
    const name = unit?.name;

    return Boolean(name) && String(name).toLowerCase().includes(query);
  });
}

/**
 * What the unit dropdown shows: the chosen category first, then the search.
 */
export function unitOptionsFor(units = [], categoryId = '', search = '') {
  return matchUnitSearch(unitsInCategory(units, categoryId), search);
}

/**
 * Whether the currently selected unit survives a category change. `false`
 * means the picker must clear its selection, because a unit from another
 * category would otherwise stay selected behind a filtered list.
 */
export function unitBelongsToCategory(units = [], unitId = '', categoryId = '') {
  const wantedUnit = toComparableId(unitId);

  if (!wantedUnit) {
    return false;
  }

  return unitsInCategory(units, categoryId).some(
    (unit) => toComparableId(unit?.id) === wantedUnit,
  );
}

/**
 * The category a unit belongs to, so opening a product can select the right
 * category before the user touches anything.
 */
export function categoryIdOfUnit(units = [], unitId = '') {
  const wantedUnit = toComparableId(unitId);

  if (!wantedUnit) {
    return '';
  }

  const unit = (units || []).find(
    (entry) => toComparableId(entry?.id) === wantedUnit,
  );

  return unit?.unit_category_id ?? '';
}
