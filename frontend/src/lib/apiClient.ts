// Normally empty: requests go to relative '/api' on the app's own origin --
// proxied by Vite in dev (vite.config.ts) and by the vercel.json rewrite in
// production. Same-origin is what makes the httpOnly session cookies
// first-party; a cross-site API URL here would break sign-in.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

// The session lives in httpOnly cookies the backend sets (see
// backend/api/src/auth/auth-cookies.ts), so this client never sees a token.
// Sessions from before that switch kept one in localStorage -- drop it.
try {
  localStorage.removeItem('hms_access_token')
} catch {
  // Storage can be unavailable (private mode, blocked site data) -- nothing to clean up then.
}

/** The backend rejects cookie-authenticated writes without this header (its CSRF defence). */
const CSRF_HEADER = 'X-HMS-CSRF'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

/** AuthProvider registers this once, so an expired/revoked session can be
 *  cleared from here without apiClient needing React context. */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  status: number
  errors: string[]

  constructor(message: string, options: { status: number; errors?: string[] }) {
    super(message)
    this.status = options.status
    this.errors = options.errors ?? []
  }
}

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: string[]
}

function send(path: string, options?: RequestInit): Promise<Response> {
  const method = (options?.method ?? 'GET').toUpperCase()

  return fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(SAFE_METHODS.has(method) ? {} : { [CSRF_HEADER]: '1' }),
      ...options?.headers,
    },
  })
}

// Shared so a burst of requests that all 401 at once triggers one refresh, not one each.
let refreshInFlight: Promise<boolean> | null = null

/** Swaps the refresh cookie for a new access cookie. Resolves false when the session is really over. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

/**
 * The raw Response, with the same cookies, CSRF header and refresh-once-on-401
 * as every other call. For callers that read the body themselves (streams).
 */
export async function fetchWithSession(path: string, options?: RequestInit): Promise<Response> {
  let res = await send(path, options)

  // The access cookie is short-lived, so a 401 usually just means it expired:
  // refresh once and retry. /auth/* is excluded -- a 401 there is a real
  // answer (wrong password, bad code, dead refresh cookie), not an expiry.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await send(path, options)
    }
    if (res.status === 401) {
      unauthorizedHandler?.()
    }
  }
  return res
}

/** Turns a non-2xx Response from this API into an ApiError. */
export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null
  return new ApiError(body?.message ?? 'Request failed', { status: res.status, errors: body?.errors })
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchWithSession(path, options)

  if (res.status === 204) return undefined as T

  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!res.ok || !body?.success) {
    throw new ApiError(body?.message ?? 'Request failed', {
      status: res.status,
      errors: body?.errors,
    })
  }

  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
