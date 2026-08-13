import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage'
import { ROUTES } from '@/constants/routes'

const mockCompleteOAuthCallback = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ completeOAuthCallback: mockCompleteOAuthCallback }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockCompleteOAuthCallback.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.error).mockClear()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OAuthCallbackPage />
    </MemoryRouter>,
  )
}

describe('OAuthCallbackPage', () => {
  it('completes sign-in and navigates to the dashboard when a token is present', async () => {
    mockCompleteOAuthCallback.mockResolvedValue(undefined)

    renderAt('/oauth/callback?token=valid.jwt.token')

    await waitFor(() => expect(mockCompleteOAuthCallback).toHaveBeenCalledWith('valid.jwt.token'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard, { replace: true }),
    )
  })

  it('redirects to login without calling the API when Google reports an error', async () => {
    renderAt('/oauth/callback?error=access_denied')

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
    expect(mockCompleteOAuthCallback).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Google sign-in failed. Please try again.')
  })

  it('redirects to login without calling the API when the token is missing', async () => {
    renderAt('/oauth/callback')

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
    expect(mockCompleteOAuthCallback).not.toHaveBeenCalled()
  })

  it('shows an error and redirects to login when completing the callback fails', async () => {
    mockCompleteOAuthCallback.mockRejectedValue(new Error('network error'))

    renderAt('/oauth/callback?token=valid.jwt.token')

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not complete sign-in'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
  })
})
