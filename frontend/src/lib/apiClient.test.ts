import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, clearAccessToken, getAccessToken, setAccessToken } from '@/lib/apiClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiClient token storage', () => {
  it('returns null when no token is stored', () => {
    expect(getAccessToken()).toBeNull()
  })

  it('stores and retrieves a token', () => {
    setAccessToken('abc.def.ghi')
    expect(getAccessToken()).toBe('abc.def.ghi')
  })

  it('clears a stored token', () => {
    setAccessToken('abc.def.ghi')
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })
})

describe('apiClient request()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('unwraps the envelope data on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { id: '1' } }),
    )

    const result = await api.get<{ id: string }>('/users/me')

    expect(result).toEqual({ id: '1' })
  })

  it('does not send an Authorization header when no token is stored', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: null }))

    await api.get('/doctors')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('sends a Bearer Authorization header when a token is stored', async () => {
    setAccessToken('my-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: null }))

    await api.get('/doctors')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer my-token')
  })

  it('throws ApiError with the status and message on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, message: 'Invalid email or password', errors: ['bad'] }, 401),
    )

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
      errors: ['bad'],
    })
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('throws ApiError when the body says success:false even on a 200 status', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Something odd' }, 200))

    await expect(api.get('/users/me')).rejects.toMatchObject({ message: 'Something odd' })
  })

  it('falls back to a generic message when the response body is not valid JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not json', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    )

    await expect(api.get('/users/me')).rejects.toMatchObject({ status: 500, message: 'Request failed' })
  })

  it('returns undefined for a 204 No Content response without parsing a body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))

    const result = await api.del('/appointments/1')

    expect(result).toBeUndefined()
  })

  it('serializes the body and sets the method for post/patch/put', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: null }))

    await api.patch('/users/me/role', { role: 'doctor' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('PATCH')
    expect(init?.body).toBe(JSON.stringify({ role: 'doctor' }))
  })
})
