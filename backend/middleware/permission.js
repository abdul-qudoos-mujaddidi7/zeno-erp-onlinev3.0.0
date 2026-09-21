const AppError = require('../errors/AppError');

/*
 * Module permission guard.
 *
 * Until now the permission matrix in `users.permissions` was only read by the
 * frontend: hiding a menu item or a card never stopped the request itself, so
 * anyone with a valid token could still fetch every module's data. This
 * middleware makes the same matrix real on the API.
 *
 * Two rules keep it safe on a live database:
 *
 * 1. Legacy permission sets win. A set with NO entry for a module behaves
 *    exactly as before (allowed). Only an explicit `view: false` denies —
 *    the same rule the frontend uses — so nobody loses access because a code
 *    was added later.
 *
 * 2. Reading and writing are separate lists. A mount may declare that other
 *    modules need to read its data (an accountant's report screen reads
 *    journal rows) or write it (the service product form writes the shared
 *    product table). Writes otherwise need the owning module.
 *
 * Denying `view` denies the whole module — reads and writes — because a user
 * who cannot see a module must not be able to change it. The finer action
 * flags (create/edit/approve/delete) stay a frontend concern for now: real
 * production permission sets carry `delete: false` while their screens still
 * offer deletes, so enforcing those flags here would break live workflows.
 */

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Fields a user may always change on their own user row (the topbar saves the
// theme and language for every user, whatever their permissions are).
const SELF_SERVICE_FIELDS = ['theme', 'language'];

function permissionEntries(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/*
 * true  -> the permission set allows the module
 * false -> the permission set explicitly denies the module
 * null  -> the permission set says nothing about the module (legacy)
 */
function moduleState(user, code) {
  const entry = permissionEntries(user?.permissions).find(
    (permission) => permission && permission.code === code,
  );

  if (!entry || entry.view === undefined || entry.view === null) {
    return null;
  }

  return !(entry.view === false || entry.view === 0 || entry.view === '0');
}

function allowsAny(user, codes) {
  return codes.some((code) => moduleState(user, code) !== false);
}

/*
 * True for a set that denies every module it mentions. An empty set (no
 * permissions saved at all — the support login) and a set with any grant both
 * return false: only a deliberately locked-down account matches.
 */
function deniesEverythingMentioned(user) {
  const entries = permissionEntries(user?.permissions).filter(
    (entry) => entry && entry.code,
  );

  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        (entry.view === false || entry.view === 0 || entry.view === '0'),
    )
  );
}

function isSelfRequest(req, user) {
  const id = req.params?.id;

  if (id === undefined || id === null || id === '') {
    return false;
  }

  /*
   * The route addresses a user row by `local_id` (that is the value the token
   * stores), so only that match counts. Matching the primary key as well could
   * match somebody else whose local_id happens to equal the caller's id.
   */
  const own = (user.local_id !== undefined && user.local_id !== null
    ? user.local_id
    : user.id);

  if (own === undefined || own === null || String(own) !== String(id)) {
    return false;
  }

  if (READ_METHODS.has(req.method)) {
    return true;
  }

  // Self-service writes are the theme/language saves only. Permissions, role,
  // password or status on the own row still need the Users module.
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body =
      req.body && typeof req.body === 'object' ? req.body : {};

    const keys = Object.keys(body).filter(
      (key) => body[key] !== undefined,
    );

    return (
      keys.length > 0 &&
      keys.every((key) => SELF_SERVICE_FIELDS.includes(key))
    );
  }

  return false;
}

/**
 * Build a guard for one module mount.
 *
 * @param {string} moduleCode permission code that owns the mount
 * @param {object} [options]
 * @param {string[]} [options.read]  extra modules allowed to READ the mount
 * @param {string[]} [options.write] extra modules allowed to WRITE the mount
 * @param {boolean}  [options.selfService] allow read/theme/language on own row
 * @param {boolean}  [options.allDeniedBlocks] a set that denies every module it
 *   mentions (and never mentions this one) is treated as denied. Used by the
 *   dashboard, which aggregates every module: a fully restricted account must
 *   not read the whole company's totals. An empty set is still allowed, so the
 *   support login keeps working.
 */
function requireModulePermission(moduleCode, options = {}) {
  const readCodes = [moduleCode, ...(options.read || [])];
  const writeCodes = [moduleCode, ...(options.write || [])];

  return function modulePermissionGuard(req, res, next) {
    const user = req.user;

    if (!user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    if (options.selfService && isSelfRequest(req, user)) {
      return next();
    }

    const codes = READ_METHODS.has(req.method) ? readCodes : writeCodes;

    if (options.allDeniedBlocks && deniesEverythingMentioned(user)) {
      return next(denied(req, moduleCode));
    }

    if (allowsAny(user, codes)) {
      return next();
    }

    return next(denied(req, moduleCode));
  };
}

function denied(req, moduleCode) {
  return new AppError(
    `You do not have permission for ${moduleCode}.`,
    403,
    'PERMISSION_DENIED',
    {
      module: moduleCode,
      method: req.method,
      path: req.originalUrl,
    },
  );
}

module.exports = requireModulePermission;
module.exports.moduleState = moduleState;
module.exports.permissionEntries = permissionEntries;
module.exports.deniesEverythingMentioned = deniesEverythingMentioned;
module.exports.SELF_SERVICE_FIELDS = SELF_SERVICE_FIELDS;
