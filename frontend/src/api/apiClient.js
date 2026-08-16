const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001';

const GET_CACHE_TTL_MS = 90_000;
const getCache = new Map();
const inflightGets = new Map();

function getToken() {
  return localStorage.getItem('token');
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
  const useCache =
    method === 'GET' &&
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
    const token = getToken();

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
