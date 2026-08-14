import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { setPassword } from '@/features/auth/api'
import { ApiError } from '@/lib/apiClient'
import type { AuthUser } from '@/features/auth/AuthContext'

const mockUseAuth = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/features/auth/api', () => ({
  setPassword: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

function baseUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'ada@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
    picture: null,
    role: 'patient',
    roleSelected: true,
    hasPassword: false,
    emailVerified: true,
    mustChangePassword: false,
    ...overrides,
  }
}

beforeEach(() => {
  mockRefresh.mockReset().mockResolvedValue(undefined)
  vi.mocked(setPassword).mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('SetPasswordCard — Google-only account (hasPassword: false)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser({ hasPassword: false }), refresh: mockRefresh })
  })

  it('renders no current-password field and the "Set a password" copy', () => {
    render(<SetPasswordCard />)

    expect(screen.getByText('Set a password')).toBeInTheDocument()
    expect(screen.queryByLabelText('Current password')).toBeNull()
  })

  it('sets a password with no currentPassword and refreshes the session on success', async () => {
    vi.mocked(setPassword).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SetPasswordCard />)

    await user.type(screen.getByLabelText('New password'), 'brandnewpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'brandnewpass123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() =>
      expect(setPassword).toHaveBeenCalledWith({
        currentPassword: undefined,
        newPassword: 'brandnewpass123',
      }),
    )
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith(
      'Password set — you can now sign in with email and password',
    )
  })

  it('blocks submission when new and confirm passwords do not match', async () => {
    const user = userEvent.setup()
    render(<SetPasswordCard />)

    await user.type(screen.getByLabelText('New password'), 'brandnewpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'somethingelse1')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(setPassword).not.toHaveBeenCalled()
  })
})

describe('SetPasswordCard — existing local account (hasPassword: true)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser({ hasPassword: true }), refresh: mockRefresh })
  })

  it('renders the current-password field and the "Change password" copy', () => {
    render(<SetPasswordCard />)

    expect(screen.getByText('Change password')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  })

  it('blocks submission with a client-side error when currentPassword is left empty', async () => {
    const user = userEvent.setup()
    render(<SetPasswordCard />)

    await user.type(screen.getByLabelText('New password'), 'brandnewpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'brandnewpass123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Enter your current password'))
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('submits with currentPassword when provided', async () => {
    vi.mocked(setPassword).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SetPasswordCard />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'brandnewpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'brandnewpass123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() =>
      expect(setPassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'brandnewpass123',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Password updated')
  })

  it('shows the server error message when the API call fails and does not refresh', async () => {
    vi.mocked(setPassword).mockRejectedValue(
      new ApiError('Current password is incorrect', { status: 401 }),
    )
    const user = userEvent.setup()
    render(<SetPasswordCard />)

    await user.type(screen.getByLabelText('Current password'), 'wrong-password')
    await user.type(screen.getByLabelText('New password'), 'brandnewpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'brandnewpass123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Current password is incorrect'))
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
