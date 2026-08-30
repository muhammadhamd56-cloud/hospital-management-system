import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { ManualLoginForm } from '@/features/auth/ManualLoginForm'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const mockLogin = vi.fn()
const mockVerifyMfa = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ login: mockLogin, verifyMfa: mockVerifyMfa }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockLogin.mockReset()
  mockVerifyMfa.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('ManualLoginForm', () => {
  it('shows required-field errors and does not call login when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('shows a validation error for a malformed email', async () => {
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'somepassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('calls login with the entered credentials and the default role, then navigates on success', async () => {
    mockLogin.mockResolvedValue({ mfaRequired: false })
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'ada@example.test',
        password: 'longenough1',
        role: 'patient',
      }),
    )
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard))
    expect(toast.success).toHaveBeenCalled()
  })

  it('shows the server error message and does not navigate when login fails', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid email or password', { status: 401 }))
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid email or password'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('disables the submit button while the login request is pending', async () => {
    let resolveLogin!: () => void
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = () => resolve({ mfaRequired: false })
      }),
    )
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    const button = screen.getByRole('button', { name: /sign in/i })
    await user.click(button)

    await waitFor(() => expect(button).toBeDisabled())

    resolveLogin()
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it('shows an authentication-code step instead of navigating when login requires MFA, then completes sign-in on a correct code', async () => {
    mockLogin.mockResolvedValue({ mfaRequired: true, mfaToken: 'challenge-token' })
    mockVerifyMfa.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByLabelText('Authentication code')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Authentication code'), '123456')
    await user.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => expect(mockVerifyMfa).toHaveBeenCalledWith('challenge-token', '123456'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard))
    expect(toast.success).toHaveBeenCalled()
  })

  it('shows the server error and stays on the code step when the MFA code is wrong', async () => {
    mockLogin.mockResolvedValue({ mfaRequired: true, mfaToken: 'challenge-token' })
    mockVerifyMfa.mockRejectedValue(new ApiError('Incorrect code', { status: 401 }))
    const user = userEvent.setup()
    render(<ManualLoginForm />)

    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByLabelText('Authentication code')
    await user.type(screen.getByLabelText('Authentication code'), '000000')
    await user.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Incorrect code'))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument()
  })
})
