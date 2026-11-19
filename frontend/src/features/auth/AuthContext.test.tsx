import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthContext'
import { useAuth } from '@/features/auth/useAuth'

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

const meResponse = () => jsonResponse({ success: true, message: 'ok', data: rawUser })
const unauthorized = () => jsonResponse({ success: false, message: 'Unauthorized' }, 401)

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

/** Mounts the provider with no session (every request 401s), then hands fetch back for the test to script. */
async function renderLoggedOut() {
  vi.mocked(fetch).mockImplementation(async () => unauthorized())
  const hook = renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
  vi.mocked(fetch).mockReset()
  return hook
}

async function renderLoggedIn() {
  vi.mocked(fetch).mockImplementation(async () => meResponse())
  const hook = renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(hook.result.current.user).not.toBeNull())
  vi.mocked(fetch).mockReset()
  return hook
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores the session on mount by asking the server, sending the cookies', async () => {
    vi.mocked(fetch).mockResolvedValue(meResponse())

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toMatchObject({ email: 'ada@example.test', fullName: 'Ada Lovelace' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/users/me')
    expect(init?.credentials).toBe('include')
  })

  it('starts logged out when there is no session (and the refresh fails too)', async () => {
    const { result } = await renderLoggedOut()

    expect(result.current.user).toBeNull()
  })

  it('login() populates the user from the response on success', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: { user: rawUser } }))

    await result.current.login({ email: 'ada@example.test', password: 'pw', role: 'patient' })

    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('login() returns the MFA challenge instead of signing in when the account has MFA', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { mfaRequired: true, mfaToken: 'challenge' } }),
    )

    const outcome = await result.current.login({ email: 'ada@example.test', password: 'pw', role: 'patient' })

    expect(outcome).toEqual({ mfaRequired: true, mfaToken: 'challenge' })
    expect(result.current.user).toBeNull()
  })

  it('login() failure leaves the session untouched and rethrows', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Invalid email or password' }, 401))

    await expect(
      result.current.login({ email: 'ada@example.test', password: 'wrong', role: 'patient' }),
    ).rejects.toMatchObject({ message: 'Invalid email or password' })

    expect(result.current.user).toBeNull()
  })

  it('signup() does NOT set a user — verification is required first', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: { email: 'ada@example.test' } }))

    await result.current.signup({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      password: 'longenough1',
      role: 'patient',
    })

    const [url] = vi.mocked(fetch).mock.calls.at(-1)!
    expect(url).toBe('/api/auth/signup')
    expect(result.current.user).toBeNull()
  })

  it('verifyOtp() populates the user on success — this is the real sign-in moment', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, message: 'ok', data: { user: rawUser } }))

    await result.current.verifyOtp('ada@example.test', '123456')

    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('verifyOtp() failure leaves the session untouched and rethrows', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Incorrect code' }, 401))

    await expect(result.current.verifyOtp('ada@example.test', '000000')).rejects.toMatchObject({
      message: 'Incorrect code',
    })

    expect(result.current.user).toBeNull()
  })

  it('resendOtp() posts to the resend endpoint without touching the session', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { message: 'Verification code sent' } }),
    )

    await result.current.resendOtp('ada@example.test')

    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!
    expect(url).toBe('/api/auth/resend-otp')
    expect(init?.body).toBe(JSON.stringify({ email: 'ada@example.test' }))
    expect(result.current.user).toBeNull()
  })

  it('completeOAuthCallback() loads the user the cookie session belongs to', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockResolvedValue(meResponse())

    await result.current.completeOAuthCallback()

    await waitFor(() => expect(result.current.user?.email).toBe('ada@example.test'))
  })

  it('completeOAuthCallback() rejects when no session was established', async () => {
    const { result } = await renderLoggedOut()
    vi.mocked(fetch).mockImplementation(async () => unauthorized())

    await expect(result.current.completeOAuthCallback()).rejects.toMatchObject({ status: 401 })
    expect(result.current.user).toBeNull()
  })

  it('selectRole() updates the user with the server response', async () => {
    const { result } = await renderLoggedIn()
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, message: 'ok', data: { ...rawUser, role: 'doctor', roleSelected: true } }),
    )

    await result.current.selectRole('doctor')

    await waitFor(() => expect(result.current.user?.role).toBe('doctor'))
    expect(result.current.user?.roleSelected).toBe(true)
  })

  it('logs the user out when a later request 401s and the session cannot be refreshed', async () => {
    const { result } = await renderLoggedIn()
    vi.mocked(fetch).mockImplementation(async () => unauthorized())

    await expect(result.current.updateProfile({ firstName: 'A' })).rejects.toMatchObject({ status: 401 })

    await waitFor(() => expect(result.current.user).toBeNull())
  })

  it('logout() revokes the session on the server, then clears the user', async () => {
    const { result } = await renderLoggedIn()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await result.current.logout()

    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(result.current.user).toBeNull())
  })

  it('logout() still clears the local user even if the server request fails', async () => {
    const { result } = await renderLoggedIn()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))

    await result.current.logout()

    await waitFor(() => expect(result.current.user).toBeNull())
  })
})
