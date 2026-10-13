const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001';

const GET_CACHE_TTL_MS = 90_000;
const getCache = new Map();
const inflightGets = new Map();
let invalidatedToken = null;

function getToken() {
  return localStorage.getItem('token');
}

function invalidateAuthentication(token, error) {
  if (!token || invalidatedToken === token) return;
  invalidatedToken = token;

  invalidateApiCache();

  if (typeof window === 'undefined') return;

  const message =
    error.data?.message ||
    'Your session is no longer valid. Please sign in again.';
  try {
    sessionStorage.setItem('auth_notice', message);
  } catch (storageError) {
    // The redirect still proceeds when browser storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent('erp:authentication-invalid', {
      detail: { message, code: error.code, status: error.status },
    }),
  );
}

export function invalidateApiCache() {
  getCache.clear();
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  return text
    ? { message: text }
    : null;
}

async function request(
  path,
  {
    method = 'GET',
    body,
    headers = {},
    signal,
    cache,
  } = {},
) {
  const token = getToken();
  const useCache =
    method === 'GET' &&
    !token &&
    cache !== false &&
    !/[?&]page=/.test(path);

  if (useCache) {
    const hit = getCache.get(path);
    if (hit && Date.now() - hit.at < GET_CACHE_TTL_MS) {
      return hit.value;
    }

    const pending = inflightGets.get(path);
    if (pending) {
      return pending;
    }
  }

  const run = (async () => {
    let response;

    try {
      response = await fetch(
        `${API_BASE_URL}${path}`,
        {
          method,
          signal,

          headers: {
            Accept: 'application/json',

            ...(body !== undefined
              ? {
                  'Content-Type':
                    'application/json',
                }
              : {}),

            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`,
                }
              : {}),

            ...headers,
          },

          body:
            body !== undefined
              ? JSON.stringify(body)
              : undefined,
        },
      );
    } catch (cause) {
      const error = new Error(
        navigator.onLine
          ? 'The server could not be reached.'
          : 'Internet connection is required.',
      );

      error.code = 'NETWORK_ERROR';
      error.cause = cause;

      throw error;
    }

    const result =
      await parseResponse(response);

    if (!response.ok) {
      const error = new Error(
        result?.message ||
          `Request failed: ${response.status}`,
      );

      error.status = response.status;
      error.code =
        result?.code || 'HTTP_ERROR';
      error.errors =
        result?.errors || null;
      error.data = result;

      if (
        token &&
        (response.status === 401 || response.status === 402) &&
        (response.status === 401 ||
          String(error.code).startsWith('SUBSCRIPTION_'))
      ) {
        invalidateAuthentication(token, error);
      }

      throw error;
    }

    if (useCache) {
      getCache.set(path, {
        at: Date.now(),
        value: result,
      });
    } else if (method !== 'GET') {
      invalidateApiCache();
    }

    return result;
  })();

  if (useCache) {
    inflightGets.set(path, run);
    try {
      return await run;
    } finally {
      inflightGets.delete(path);
    }
  }

  return run;
}

export const api = {
  get(path, options = {}) {
    return request(path, {
      ...options,
      method: 'GET',
    });
  },

  post(path, body, options = {}) {
    return request(path, {
      ...options,
      method: 'POST',
      body,
    });
  },

  put(path, body, options = {}) {
    return request(path, {
      ...options,
      method: 'PUT',
      body,
    });
  },

  patch(path, body, options = {}) {
    return request(path, {
      ...options,
      method: 'PATCH',
      body,
    });
  },

  delete(path, body, options = {}) {
    return request(path, {
      ...options,
      method: 'DELETE',
      body,
    });
  },
};
