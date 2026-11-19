import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, onUnauthorized } from '@/lib/apiClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ok = () => jsonResponse({ success: true, message: 'ok', data: { id: '1' } })
const unauthorized = () => jsonResponse({ success: false, message: 'Unauthorized' }, 401)

describe('apiClient request()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    onUnauthorized(() => {})
  })

  it('unwraps the envelope data on success', async () => {
    vi.mocked(fetch).mockResolvedValue(ok())

    const result = await api.get<{ id: string }>('/users/me')

    expect(result).toEqual({ id: '1' })
  })

  it('always sends the session cookies and never an Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(ok())

    await api.get('/doctors')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('adds the CSRF header to writes but not to reads', async () => {
    vi.mocked(fetch).mockImplementation(async () => ok())

    await api.get('/doctors')
    await api.post('/emergency', {})

    const [[, getInit], [, postInit]] = vi.mocked(fetch).mock.calls
    expect((getInit?.headers as Record<string, string>)['X-HMS-CSRF']).toBeUndefined()
    expect((postInit?.headers as Record<string, string>)['X-HMS-CSRF']).toBe('1')
  })

  it('refreshes the session once and retries when a request 401s', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok', data: {} }))
      .mockResolvedValueOnce(ok())

    const result = await api.get<{ id: string }>('/users/me')

    expect(result).toEqual({ id: '1' })
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url)
    expect(urls).toEqual(['/api/users/me', '/api/auth/refresh', '/api/users/me'])
  })

  it('shares one refresh between requests that 401 at the same time', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') return jsonResponse({ success: true, message: 'ok', data: {} })
      const refreshed = vi.mocked(fetch).mock.calls.some(([u]) => u === '/api/auth/refresh')
      return refreshed ? ok() : unauthorized()
    })

    await Promise.all([api.get('/a'), api.get('/b')])

    const refreshCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
  })

  it('reports the session as over when the refresh fails too', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    vi.mocked(fetch).mockImplementation(async () => unauthorized())

    await expect(api.get('/users/me')).rejects.toMatchObject({ status: 401 })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not try to refresh on a 401 from an /auth endpoint (e.g. a wrong password)', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, message: 'Invalid email or password', errors: ['bad'] }, 401),
    )

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
      errors: ['bad'],
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  it('throws ApiError on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Nope' }, 400))

    await expect(api.post('/appointments', {})).rejects.toBeInstanceOf(ApiError)
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
