// lib/fetchWithAuth.ts
// A small fetch wrapper that tries cookie-based requests first, then retries with a
// bearer token from a client cookie fallback. Calls `onUnauthorized` callback for 401/403.

type FetchWithAuthOpts = {
  onUnauthorized?: () => void | Promise<void>; // called on 401/403 final
  timeoutMs?: number; // optional timeout (ms). If set, will abort on timeout.
};

function getClientTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)spewn_client_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * fetchWithAuth - tries fetch normally (cookies), and if unauthorized + client token exists,
 * retries with Authorization: Bearer <token>. On 401/403 it will call onUnauthorized (if provided).
 *
 * Usage:
 *   const res = await fetchWithAuth(url, init, { onUnauthorized: () => { ... } });
 */
export default async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit,
  opts?: FetchWithAuthOpts
): Promise<Response> {
  const {onUnauthorized, timeoutMs} = opts || {};

  // Helper to perform fetch with optional abort controller (timeout)
  const doFetch = (reqInit?: RequestInit) => {
    if (!timeoutMs) return fetch(input, reqInit);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const merged = {...(reqInit || {}), signal: controller.signal};
    return fetch(input, merged).finally(() => clearTimeout(timer));
  };

  // 1) try the request as-is (cookie-based if credentials included)
  let res: Response;
  try {
    res = await doFetch(init);
  } catch (err) {
    // Network/abort — surface error to caller
    throw err;
  }

  // If it's not unauthorized, return result immediately (including 2xx or other errors)
  if (res.status !== 401 && res.status !== 403) {
    return res;
  }

  // 2) On 401/403, attempt fallback: if there's a client token cookie, retry with Bearer token
  const fallbackToken = getClientTokenFromCookie();
  if (!fallbackToken) {
    // No fallback token -> call onUnauthorized then return original response
    if (onUnauthorized) {
      try {
        await onUnauthorized();
      } catch {}
    }
    return res;
  }

  // Build a new init that includes Authorization header (do not mutate original init)
  const retryInit: RequestInit = {
    ...(init || {}),
    headers: {
      // preserve original headers (could be Headers object or plain object)
      ...(init && init.headers && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, any>)
        : {}),
      // if init.headers is Headers, convert to plain object (best-effort)
      ...(init && init.headers instanceof Headers
        ? Array.from(init.headers.entries()).reduce<Record<string, string>>(
            (acc, [k, v]) => ((acc[k] = v), acc),
            {}
          )
        : {}),
      Authorization: `Bearer ${fallbackToken}`,
    },
  };

  // Retry
  try {
    const retryRes = await doFetch(retryInit);
    if (retryRes.status !== 401 && retryRes.status !== 403) {
      return retryRes;
    }
    // still unauthorized -> call onUnauthorized and return the retry response
    if (onUnauthorized) {
      try {
        await onUnauthorized();
      } catch {}
    }
    return retryRes;
  } catch (err) {
    // network error on retry - bubble
    throw err;
  }
}
