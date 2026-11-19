import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { PatientSettingsPage } from '@/pages/settings/PatientSettingsPage'
import { StaffSettingsPage } from '@/pages/settings/StaffSettingsPage'

// MFA setup endpoints (POST /users/me/mfa/*) are behind JwtAuthGuard only, so
// every role can enrol -- these pages must expose the card like admin/doctor.
vi.mock('@/features/mfa/MfaCard', () => ({
  MfaCard: () => <div>mfa card</div>,
}))

vi.mock('@/features/auth/SetPasswordCard', () => ({
  SetPasswordCard: () => <div>set password card</div>,
}))

vi.mock('@/features/auth/AccountInfoForm', () => ({
  AccountInfoForm: () => <div>account info form</div>,
}))

vi.mock('@/features/staffPortal/api', () => ({
  getMyProfile: () => new Promise(() => {}),
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: null, deleteAccount: vi.fn() }),
}))

describe('MfaCard placement on settings pages', () => {
  it('renders the MFA card on the patient settings page', () => {
    render(
      <MemoryRouter>
        <PatientSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('mfa card')).toBeInTheDocument()
  })

  it('renders the MFA card on the staff settings page', () => {
    render(
      <MemoryRouter>
        <StaffSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('mfa card')).toBeInTheDocument()
  })
})
