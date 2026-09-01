import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { DoctorProfilePage } from '@/pages/profile/DoctorProfilePage'
import { getDoctorProfile, upsertDoctorProfile } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { AuthUser } from '@/features/auth/AuthContext'

const baseUser: AuthUser = {
  id: 'doc-1',
  email: 'dana@example.test',
  firstName: 'Dana',
  lastName: 'Doctor',
  fullName: 'Dana Doctor',
  phone: null,
  picture: null,
  dateOfBirth: null,
  gender: null,
  address: null,
  emergencyContact: null,
  role: 'doctor',
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

vi.mock('@/features/doctorDashboard/api', () => ({
  getDoctorProfile: vi.fn(),
  upsertDoctorProfile: vi.fn(),
}))

// AvailabilityToggle and SetPasswordCard hit their own endpoints on mount --
// stub the ones AvailabilityToggle needs so this test stays focused on the
// unified profile form, not those already-independently-tested components.
vi.mock('@/features/doctorDashboard/AvailabilityToggle', () => ({
  AvailabilityToggle: () => null,
}))
vi.mock('@/features/auth/SetPasswordCard', () => ({
  SetPasswordCard: () => null,
}))

// useUnsavedChangesGuard's useBlocker requires a data router; a plain
// MemoryRouter (declarative) doesn't provide one. The blocking behavior
// itself belongs to react-router; here it's stubbed idle so the page can
// render under a plain MemoryRouter like every other page test in this repo.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useBlocker: () => ({ state: 'unblocked' as const }) }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const existingProfile = {
  id: 'profile-1',
  fullName: 'Dana Doctor',
  specialization: 'Cardiology',
  qualifications: 'MBBS, FCPS',
  department: 'Cardiology',
  bio: 'Heart specialist',
  experienceYears: 8,
  rating: 4.8,
  acceptsOnline: true,
  isAvailable: true,
  consultationFee: 50,
  appointmentDurationMinutes: 30,
  email: 'dana@example.test',
}

beforeEach(() => {
  mockUpdateProfile.mockReset().mockResolvedValue(undefined)
  mockRefresh.mockReset().mockResolvedValue(undefined)
  vi.mocked(getDoctorProfile).mockReset().mockResolvedValue({ profile: existingProfile })
  vi.mocked(upsertDoctorProfile).mockReset().mockResolvedValue({ profile: existingProfile })
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DoctorProfilePage />
    </MemoryRouter>,
  )
}

describe('DoctorProfilePage', () => {
  it('loads and displays the existing name, specialization, and consultation fee', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Dana')).toBeInTheDocument()
    expect(screen.getByLabelText('Specialization')).toHaveValue('Cardiology')
    expect(screen.getByLabelText('Department')).toHaveValue('Cardiology')
    expect(screen.getByDisplayValue('MBBS, FCPS')).toBeInTheDocument()
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
  })

  it('Save Changes is disabled until something is edited', async () => {
    renderPage()
    await screen.findByDisplayValue('Dana')

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('saves edited name, specialization, and consultation fee via the existing endpoints, then shows success and stays on the page', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Dana')

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Danielle')
    await user.clear(screen.getByLabelText('Consultation fee (USD)'))
    await user.type(screen.getByLabelText('Consultation fee (USD)'), '75')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Danielle', lastName: 'Doctor' }),
    ))
    await waitFor(() => expect(upsertDoctorProfile).toHaveBeenCalledWith(
      expect.objectContaining({ specialization: 'Cardiology', consultationFee: 75, appointmentDurationMinutes: 30 }),
    ))
    expect(toast.success).toHaveBeenCalledWith('Profile updated successfully.')
    expect(mockRefresh).toHaveBeenCalled()
    // Stayed on the profile page (no navigation import used/asserted) and the field reflects the save.
    expect(screen.getByDisplayValue('Danielle')).toBeInTheDocument()
  })

  it('rejects a negative consultation fee client-side without calling the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Dana')

    await user.clear(screen.getByLabelText('Consultation fee (USD)'))
    await user.type(screen.getByLabelText('Consultation fee (USD)'), '-10')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument()
    expect(upsertDoctorProfile).not.toHaveBeenCalled()
  })

  it('rejects an empty required field (specialization) client-side', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Dana')

    await user.clear(screen.getByLabelText('Specialization'))
    // Type and clear something else to mark the form dirty so Save is enabled.
    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Dana')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Specialization is required')).toBeInTheDocument()
    expect(upsertDoctorProfile).not.toHaveBeenCalled()
  })

  it('shows a friendly error and keeps entered values when saving fails', async () => {
    mockUpdateProfile.mockRejectedValue(new ApiError('Something went wrong', { status: 500 }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Dana')

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Danielle')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Something went wrong'))
    expect(screen.getByDisplayValue('Danielle')).toBeInTheDocument()
  })

  it('warns before discarding unsaved changes via Cancel, and reverts them on confirm', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Dana')

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Danielle')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Discard your changes?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(screen.getByDisplayValue('Dana')).toBeInTheDocument())
  })
})
