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

export function readStoredPermissions() {
  return parsePermissions(localStorage.getItem('permissions') || '[]');
}

export function writeStoredPermissions(permissions) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions(permissions);
  localStorage.setItem('permissions', JSON.stringify(list));
  return list;
}
