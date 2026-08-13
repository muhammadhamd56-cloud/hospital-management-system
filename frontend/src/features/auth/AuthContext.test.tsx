import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthContext'
import { useAuth } from '@/features/auth/useAuth'
import { getAccessToken, setAccessToken } from '@/lib/apiClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const rawUser = {
  id: 'user-1',
  email: 'ada@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  picture: null,
  role: 'patient' as const,
  roleSelected: true,
  hasPassword: true,
  emailVerified: true,
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts logged out with no stored token and makes no request', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('restores the session on mount when a valid token is already stored', async () => {
    setAccessToken('existing-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: rawUser }))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toMatchObject({ email: 'ada@example.test', fullName: 'Ada Lovelace' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/users/me')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer existing-token')
  })

  it('clears the stored token and logs out when the server rejects it (expired/invalid session)', async () => {
    setAccessToken('stale-token')
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, message: 'Unauthorized' }, 401),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('login() stores the token and populates the user on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { token: 'new-token', user: rawUser } }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.login({ email: 'ada@example.test', password: 'pw', role: 'patient' })

    expect(getAccessToken()).toBe('new-token')
    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('login() failure leaves the session untouched and rethrows', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, message: 'Invalid email or password' }, 401),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      result.current.login({ email: 'ada@example.test', password: 'wrong', role: 'patient' }),
    ).rejects.toMatchObject({ message: 'Invalid email or password' })

    expect(getAccessToken()).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('signup() does NOT store a token or set a user — verification is required first', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { email: 'ada@example.test' } }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.signup({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      password: 'longenough1',
      role: 'patient',
    })

    const [url] = vi.mocked(fetch).mock.calls.at(-1)!
    expect(url).toBe('/api/auth/signup')
    expect(getAccessToken()).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('verifyOtp() stores the token and populates the user on success — this is the real sign-in moment', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { token: 'verify-token', user: rawUser } }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.verifyOtp('ada@example.test', '123456')

    expect(getAccessToken()).toBe('verify-token')
    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('verifyOtp() failure leaves the session untouched and rethrows', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Incorrect code' }, 401))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(result.current.verifyOtp('ada@example.test', '000000')).rejects.toMatchObject({
      message: 'Incorrect code',
    })

    expect(getAccessToken()).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('resendOtp() posts to the resend endpoint without touching the session', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { message: 'Verification code sent' } }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.resendOtp('ada@example.test')

    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!
    expect(url).toBe('/api/auth/resend-otp')
    expect(init?.body).toBe(JSON.stringify({ email: 'ada@example.test' }))
    expect(getAccessToken()).toBeNull()
  })

  it('completeOAuthCallback stores the token then refreshes the user', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: rawUser }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.completeOAuthCallback('oauth-token')

    expect(getAccessToken()).toBe('oauth-token')
    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('selectRole() updates the user with the server response', async () => {
    setAccessToken('existing-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, message: 'ok', data: { ...rawUser, roleSelected: false } }),
    )

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, message: 'ok', data: { ...rawUser, role: 'doctor', roleSelected: true } }),
    )

    await result.current.selectRole('doctor')

    await waitFor(() => expect(result.current.user?.role).toBe('doctor'))
    expect(result.current.user?.roleSelected).toBe(true)
  })

  it('logout() revokes the session on the server, then clears the token and the user', async () => {
    setAccessToken('existing-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: rawUser }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await result.current.logout()

    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(result.current.user).toBeNull())
    expect(getAccessToken()).toBeNull()
  })

  it('logout() still clears the local session even if the server request fails', async () => {
    setAccessToken('existing-token')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: rawUser }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    await result.current.logout()

    await waitFor(() => expect(result.current.user).toBeNull())
    expect(getAccessToken()).toBeNull()
  })
})
