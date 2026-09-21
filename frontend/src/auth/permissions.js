/**
 * Normalize permissions from API / localStorage (string JSON, array, or empty).
 */
export function parsePermissions(value) {
  if (!value) return [];

  try {
    const parsed =
      typeof value === 'string' ? JSON.parse(value) : value;

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse permissions:', error);
    return [];
  }
}

/**
 * Dashboard visibility.
 *
 * The dashboard aggregates every module, so the plain legacy rule (no entry for
 * the code = allowed) is narrowed here: a permission set that denies every
 * module it mentions, while never mentioning Dashboard, is a fully restricted
 * account — not a legacy grant. A set with nothing saved at all stays allowed,
 * so a support login or a brand-new user still sees the dashboard while the
 * cards themselves stay permission-gated.
 */
export function canViewDashboard(permissions) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions(permissions);
  const dashboard = list.find((item) => item && item.code === 'Dashboard');

  if (dashboard && dashboard.view !== undefined && dashboard.view !== null) {
    return dashboard.view !== false && dashboard.view !== 0 && dashboard.view !== '0';
  }

  const mentioned = list.filter((item) => item && item.code);

  if (
    mentioned.length > 0 &&
    mentioned.every((item) => item.view === false || item.view === 0 || item.view === '0')
  ) {
    return false;
  }

  return true;
}

/**
 * Module view check for permission-gated pages and cards.
 *
 * Legacy rule: a permission set that carries NO entry for the code keeps the
 * previous behaviour (allowed). A page or card therefore only disappears when
 * an explicit entry denies `view`, so adding a new code (Dashboard) can never
 * lock an existing user out of screens they could already open.
 */
export function canViewModule(permissions, code) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions(permissions);
  const entry = list.find((item) => item && item.code === code);

  if (!entry || entry.view === undefined || entry.view === null) return true;

  return entry.view !== false && entry.view !== 0 && entry.view !== '0';
}

/*
 * Dashboard cards each own a permission code, so an operator can hide a single
 * card without taking the module — or the whole dashboard — away.
 *
 * A card that has no decision of its own follows the module that owns its
 * data, which is exactly how the dashboard behaved before these codes existed.
 * The currency-rates panel is deliberately NOT in this list: it shows public
 * market rates, not company figures, so it stays visible for everyone.
 */
export const DASHBOARD_CARDS = [
  { key: 'benefit', code: 'Dashboard Benefit', modules: ['Benefit'] },
  { key: 'expenses', code: 'Dashboard Expenses', modules: ['Accounts'] },
  { key: 'netProfit', code: 'Dashboard Net Profit', modules: ['Benefit'] },
  { key: 'trend', code: 'Dashboard Trend', modules: ['Benefit', 'Accounts'] },
  { key: 'revenueMix', code: 'Dashboard Revenue Mix', modules: ['Sales', 'Purchases', 'Products'] },
  { key: 'treasury', code: 'Dashboard Treasury', modules: ['Accounts'] },
  { key: 'topProducts', code: 'Dashboard Top Products', modules: ['Sales'] },
  { key: 'stockAlerts', code: 'Dashboard Stock Alerts', modules: ['Products'] },
];

export const DASHBOARD_CARD_CODES = DASHBOARD_CARDS.map((card) => card.code);

function isGranted(entry) {
  if (!entry || entry.view === undefined || entry.view === null) return null;

  return !(entry.view === false || entry.view === 0 || entry.view === '0');
}

function entriesOf(permissions) {
  return Array.isArray(permissions) ? permissions : parsePermissions(permissions);
}

/**
 * Visibility of one dashboard card: an explicit card row decides, otherwise the
 * card follows the module(s) that own its data.
 */
export function canViewDashboardCard(permissions, cardKey) {
  const card = DASHBOARD_CARDS.find((item) => item.key === cardKey);

  if (!card) return true;

  const list = entriesOf(permissions);
  const decision = isGranted(list.find((item) => item && item.code === card.code));

  if (decision !== null) return decision;

  return card.modules.some((code) => canViewModule(list, code));
}

/**
 * Materialises the dashboard-card rows of a permission list for editing.
 *
 * `decided` lists the codes the saved permission JSON already answered. A card
 * row the operator has never touched is shown at the value it currently
 * resolves to (its module's), so saving a user keeps today's dashboard and
 * unchecking one card really hides that one card.
 */
export function expandDashboardCards(permissions, decided = []) {
  const list = entriesOf(permissions);
  const answered = new Set(Array.isArray(decided) ? decided : []);

  return list.map((entry) => {
    const card = DASHBOARD_CARDS.find((item) => item.code === entry?.code);

    if (!card || answered.has(card.code)) return entry;

    const visible = card.modules.some((code) => canViewModule(list, code));

    return { ...entry, view: visible };
  });
}

export function readStoredPermissions() {
  return parsePermissions(localStorage.getItem('permissions') || '[]');
}

export function writeStoredPermissions(permissions) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions(permissions);
  localStorage.setItem('permissions', JSON.stringify(list));
  return list;
}
