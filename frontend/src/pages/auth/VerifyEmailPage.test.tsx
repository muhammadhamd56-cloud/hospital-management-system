import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const mockVerifyOtp = vi.fn()
const mockResendOtp = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ verifyOtp: mockVerifyOtp, resendOtp: mockResendOtp }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockVerifyOtp.mockReset()
  mockResendOtp.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderWithEmail(email: string | undefined) {
  const initialEntries = [
    { pathname: ROUTES.verifyEmail, state: email ? { email } : null },
  ]
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('VerifyEmailPage', () => {
  it('redirects to login when no email was passed in via navigation state', async () => {
    renderWithEmail(undefined)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }))
  })

  it('shows the email that was passed in', () => {
    renderWithEmail('ada@example.test')

    expect(screen.getByText('ada@example.test')).toBeInTheDocument()
  })

  it('shows a validation error for a code that is not exactly 6 characters', async () => {
    const user = userEvent.setup()
    renderWithEmail('ada@example.test')

    await user.type(screen.getByLabelText('Verification code'), '123')
    await user.click(screen.getByRole('button', { name: /verify/i }))

    expect(await screen.findByText('Enter the 6-digit code')).toBeInTheDocument()
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('submits the code and navigates to the dashboard on success', async () => {
    mockVerifyOtp.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithEmail('ada@example.test')

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('ada@example.test', '123456'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard, { replace: true }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('shows the server error and does not navigate when the code is rejected', async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError('Incorrect code', { status: 401 }))
    const user = userEvent.setup()
    renderWithEmail('ada@example.test')

    await user.type(screen.getByLabelText('Verification code'), '000000')
    await user.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Incorrect code'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('starts with the resend button disabled, showing the cooldown countdown', () => {
    renderWithEmail('ada@example.test')

    const resendButton = screen.getByRole('button', { name: /resend code \(\d+s\)/i })
    expect(resendButton).toBeDisabled()
  })

  it('enables resend after the cooldown elapses, and clicking it requests a new code', async () => {
    vi.useFakeTimers()
    renderWithEmail('ada@example.test')

    await vi.advanceTimersByTimeAsync(60_000)

    const resendButton = screen.getByRole('button', { name: /^resend code$/i })
    expect(resendButton).not.toBeDisabled()

    mockResendOtp.mockResolvedValue(undefined)
    resendButton.click()

    await vi.waitFor(() => expect(mockResendOtp).toHaveBeenCalledWith('ada@example.test'))
  })
})
