const TOKEN_KEY = 'hms_access_token'

// In dev, Vite's server.proxy forwards relative '/api' calls to the backend
// (see vite.config.ts), so this stays empty. In production the frontend and
// backend are typically deployed on different origins, so VITE_API_URL must
// be set to the backend's absolute URL at build time.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY)
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken()

  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  })

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
