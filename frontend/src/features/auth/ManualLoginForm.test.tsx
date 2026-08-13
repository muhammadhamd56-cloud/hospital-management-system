import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { ManualLoginForm } from '@/features/auth/ManualLoginForm'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const mockLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ login: mockLogin }),
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
    mockLogin.mockResolvedValue(undefined)
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
    mockLogin.mockReturnValue(new Promise<void>((resolve) => (resolveLogin = resolve)))
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
})
