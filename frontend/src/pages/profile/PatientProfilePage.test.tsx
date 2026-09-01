import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { PatientProfilePage } from '@/pages/profile/PatientProfilePage'
import { ApiError } from '@/lib/apiClient'
import type { AuthUser } from '@/features/auth/AuthContext'

const baseUser: AuthUser = {
  id: 'patient-1',
  email: 'neymar@example.test',
  firstName: 'Neymar',
  lastName: 'Jr',
  fullName: 'Neymar Jr',
  phone: null,
  picture: null,
  dateOfBirth: '2000-02-05T00:00:00.000Z',
  gender: 'male',
  address: '123 Main St',
  emergencyContact: 'Jane Doe - +14155552671',
  role: 'patient',
  roleSelected: true,
  hasPassword: true,
  emailVerified: true,
  mustChangePassword: false,
  mfaEnabled: false,
  staffType: null,
}

const mockUpdateProfile = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: baseUser,
    updateProfile: mockUpdateProfile,
    refresh: mockRefresh,
  }),
}))

vi.mock('@/features/auth/SetPasswordCard', () => ({
  SetPasswordCard: () => null,
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useBlocker: () => ({ state: 'unblocked' as const }) }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockUpdateProfile.mockReset().mockResolvedValue(undefined)
  mockRefresh.mockReset().mockResolvedValue(undefined)
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <PatientProfilePage />
    </MemoryRouter>,
  )
}

describe('PatientProfilePage', () => {
  it('loads and displays existing patient information', () => {
    renderPage()

    expect(screen.getByDisplayValue('Neymar')).toBeInTheDocument()
    expect(screen.getByLabelText('Date of birth')).toHaveValue('2000-02-05')
    expect(screen.getByLabelText('Gender')).toHaveValue('male')
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Jane Doe - +14155552671')).toBeInTheDocument()
  })

  it('does not show doctor-only fields', () => {
    renderPage()

    expect(screen.queryByLabelText('Specialization')).toBeNull()
    expect(screen.queryByLabelText('Consultation fee (USD)')).toBeNull()
  })

  it('saves edited fields via the existing /users/me endpoint, shows success, and stays on the page', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByDisplayValue('123 Main St'))
    await user.type(screen.getByLabelText('Address'), '456 Oak Ave')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Neymar', lastName: 'Jr', address: '456 Oak Ave', gender: 'male' }),
    ))
    expect(toast.success).toHaveBeenCalledWith('Profile updated successfully.')
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByDisplayValue('456 Oak Ave')).toBeInTheDocument()
  })

  it('rejects an empty required field (first name) client-side', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByLabelText('Full name'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('shows a friendly error and keeps entered values when saving fails', async () => {
    mockUpdateProfile.mockRejectedValue(new ApiError('Something went wrong', { status: 500 }))
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByDisplayValue('123 Main St'))
    await user.type(screen.getByLabelText('Address'), '456 Oak Ave')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Something went wrong'))
    expect(screen.getByDisplayValue('456 Oak Ave')).toBeInTheDocument()
  })

  it('warns before discarding unsaved changes via Cancel, and reverts them on confirm', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Junior')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Discard your changes?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(screen.getByDisplayValue('Neymar')).toBeInTheDocument())
  })
})
