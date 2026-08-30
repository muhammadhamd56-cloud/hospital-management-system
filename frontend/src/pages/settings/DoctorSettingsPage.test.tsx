import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { DoctorSettingsPage } from '@/pages/settings/DoctorSettingsPage'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import type { AuthUser } from '@/features/auth/AuthContext'

const mockDeleteAccount = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'doc-1',
      email: 'dana@example.test',
      firstName: 'Dana',
      lastName: 'Doctor',
      fullName: 'Dana Doctor',
      phone: null,
      picture: null,
      role: 'doctor',
      roleSelected: true,
      hasPassword: true,
      emailVerified: true,
      mustChangePassword: false,
      mfaEnabled: false,
      staffType: null,
    } satisfies AuthUser,
    deleteAccount: mockDeleteAccount,
  }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

// DoctorProfileForm loads via GET /doctor-portal/profile on mount — stub it
// out so this test stays focused on account deletion, not the form.
vi.mock('@/features/doctorDashboard/api', () => ({
  getDoctorProfile: vi.fn().mockResolvedValue({ profile: null }),
  upsertDoctorProfile: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockDeleteAccount.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

async function openConfirmDialog() {
  const user = userEvent.setup()
  render(<DoctorSettingsPage />)

  await user.click(screen.getByRole('button', { name: /delete account/i }))
  expect(await screen.findByText('Delete your account?')).toBeInTheDocument()

  return { user, dialog: screen.getByRole('dialog') }
}

describe('DoctorSettingsPage — account deletion', () => {
  it('deletes the account and navigates to login on success', async () => {
    mockDeleteAccount.mockResolvedValue(undefined)
    const { user, dialog } = await openConfirmDialog()

    await user.click(within(dialog).getByRole('button', { name: /delete account/i }))

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.login, { replace: true }),
    )
    expect(toast.success).toHaveBeenCalledWith('Your account has been deleted')
  })

  it('shows the server error and does not navigate when deletion fails', async () => {
    mockDeleteAccount.mockRejectedValue(new ApiError('Something went wrong', { status: 500 }))
    const { user, dialog } = await openConfirmDialog()

    await user.click(within(dialog).getByRole('button', { name: /delete account/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Something went wrong'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
