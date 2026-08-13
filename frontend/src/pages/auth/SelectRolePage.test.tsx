import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { SelectRolePage } from '@/pages/auth/SelectRolePage'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const mockSelectRole = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ selectRole: mockSelectRole }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockSelectRole.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('SelectRolePage', () => {
  it.each([
    ['Patient', 'patient'],
    ['Doctor', 'doctor'],
  ] as const)('picking %s calls selectRole(%p) and navigates to the dashboard', async (label, role) => {
    mockSelectRole.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SelectRolePage />)

    await user.click(screen.getByRole('button', { name: new RegExp(label) }))

    await waitFor(() => expect(mockSelectRole).toHaveBeenCalledWith(role))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard, { replace: true }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('disables all options while a selection is being submitted', async () => {
    // Deliberately never resolved — on success the component navigates away
    // instead of re-enabling the buttons, so there's nothing useful to
    // observe post-resolution in a test that keeps the page mounted.
    mockSelectRole.mockReturnValue(new Promise<void>(() => {}))
    const user = userEvent.setup()
    render(<SelectRolePage />)

    const patientButton = screen.getByRole('button', { name: /Patient/ })
    const doctorButton = screen.getByRole('button', { name: /Doctor/ })
    await user.click(patientButton)

    await waitFor(() => expect(doctorButton).toBeDisabled())
    expect(patientButton).toBeDisabled()
  })

  it('shows the error and re-enables the options on failure, without navigating', async () => {
    mockSelectRole.mockRejectedValue(new ApiError('Your role has already been set for this account', { status: 403 }))
    const user = userEvent.setup()
    render(<SelectRolePage />)

    await user.click(screen.getByRole('button', { name: /Doctor/ }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Your role has already been set for this account'),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: /Patient/ })).not.toBeDisabled())
  })
})
