import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { EmergencyRouteSwitch } from '@/pages/emergency/EmergencyRouteSwitch'
import type { AuthUser } from '@/features/auth/AuthContext'

const mockUseAuth = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/pages/emergency/PatientEmergencyPage', () => ({
  PatientEmergencyPage: () => <div>patient emergency page</div>,
}))

vi.mock('@/pages/emergency/EmergencyCenterPage', () => ({
  EmergencyCenterPage: () => <div>emergency center page</div>,
}))

function buildUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.test',
    fullName: 'Test User',
    role: 'patient',
    staffType: null,
    emailVerified: true,
    roleSelected: true,
    mustChangePassword: false,
    mfaEnabled: false,
    ...overrides,
  } as AuthUser
}

function renderSwitch() {
  return render(
    <MemoryRouter initialEntries={['/emergency']}>
      <EmergencyRouteSwitch />
    </MemoryRouter>,
  )
}

describe('EmergencyRouteSwitch', () => {
  it('renders the patient page for a patient', () => {
    mockUseAuth.mockReturnValue({ user: buildUser({ role: 'patient' }) })
    renderSwitch()
    expect(screen.getByText('patient emergency page')).toBeInTheDocument()
  })

  it('renders the Emergency Center for an admin', () => {
    mockUseAuth.mockReturnValue({ user: buildUser({ role: 'admin' }) })
    renderSwitch()
    expect(screen.getByText('emergency center page')).toBeInTheDocument()
  })

  it('renders the Emergency Center for a doctor', () => {
    mockUseAuth.mockReturnValue({ user: buildUser({ role: 'doctor' }) })
    renderSwitch()
    expect(screen.getByText('emergency center page')).toBeInTheDocument()
  })

  it('renders the Emergency Center for a nurse-type staff account', () => {
    mockUseAuth.mockReturnValue({ user: buildUser({ role: 'staff', staffType: 'nurse' }) })
    renderSwitch()
    expect(screen.getByText('emergency center page')).toBeInTheDocument()
  })

  it('redirects a non-nurse staff account away instead of rendering the center', () => {
    mockUseAuth.mockReturnValue({ user: buildUser({ role: 'staff', staffType: 'receptionist' }) })
    renderSwitch()
    expect(screen.queryByText('emergency center page')).not.toBeInTheDocument()
    expect(screen.queryByText('patient emergency page')).not.toBeInTheDocument()
  })
})
