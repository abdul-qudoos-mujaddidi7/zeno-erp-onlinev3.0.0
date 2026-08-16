import { API_URL } from '../config.js';

/**
 * Resolve an image field that may be:
 * - a data URL / absolute URL / relative path
 * - a JSON pointer: { table, fieldName, serveid }
 */
export function resolveMediaUrl(value, fallback = null) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const token = localStorage.getItem('token') || 'none';

      return (
        `${API_URL}/api/v2/system/loadimage/` +
        `${data?.table}/${data?.fieldName}/${data?.serveid}/${token}`
      );
    } catch (error) {
      return fallback;
    }
  }

  return trimmed;
}
