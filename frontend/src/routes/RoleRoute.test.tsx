import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmergencyRoute, LaboratoryRoute, RoleRoute } from '@/routes/RoleRoute'
import { ROUTES } from '@/constants/routes'
import type { AuthUser } from '@/features/auth/AuthContext'

const mockUseAuth = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function baseUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'ada@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
    phone: null,
    picture: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    role: 'patient',
    roleSelected: true,
    hasPassword: true,
    emailVerified: true,
    mustChangePassword: false,
    mfaEnabled: false,
    approvalStatus: 'approved',
    approvalNote: null,
    staffType: null,
    ...overrides,
  }
}

const ACCESS_DENIED = /you don't have access to this page/i

beforeEach(() => {
  mockUseAuth.mockReset()
})

function renderRoleGated(initialPath: string, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
        <Route element={<RoleRoute allow={['admin', 'doctor']} />}>
          <Route path={ROUTES.doctors} element={<div>Doctors Admin Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

function renderLabGated() {
  return render(
    <MemoryRouter initialEntries={[ROUTES.laboratory]}>
      <Routes>
        <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
        <Route element={<LaboratoryRoute />}>
          <Route path={ROUTES.laboratory} element={<div>Laboratory Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function renderEmergencyCaseGated() {
  return render(
    <MemoryRouter initialEntries={['/emergency/cases/case-1']}>
      <Routes>
        <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
        <Route element={<EmergencyRoute />}>
          <Route path={ROUTES.emergencyCase} element={<div>Emergency Case Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RoleRoute', () => {
  it('redirects to the dashboard when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
    expect(screen.queryByText(ACCESS_DENIED)).not.toBeInTheDocument()
  })

  it("shows an access-denied message instead of the page when the user's role is not in the allow-list", () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'patient' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByRole('heading', { name: ACCESS_DENIED })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Doctors Admin Page')).not.toBeInTheDocument()
    // No silent redirect: the user stays on the URL they asked for.
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', ROUTES.dashboard)
  })

  it('renders the access-denied state exactly once under StrictMode', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'staff' }) })
    renderRoleGated(ROUTES.doctors, { strict: true })

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getAllByText(ACCESS_DENIED)).toHaveLength(1)
  })

  it('renders the route when the role is allowed', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'doctor' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Doctors Admin Page')).toBeInTheDocument()
    expect(screen.queryByText(ACCESS_DENIED)).not.toBeInTheDocument()
  })

  it('renders the route for a different allowed role too (admin)', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'admin' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Doctors Admin Page')).toBeInTheDocument()
  })
})

describe('LaboratoryRoute', () => {
  it.each([
    ['admin', null],
    ['doctor', null],
    ['staff', 'lab_technician'],
  ] as const)('renders the page for %s (staffType %s)', (role, staffType) => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role, staffType }) })
    renderLabGated()

    expect(screen.getByText('Laboratory Page')).toBeInTheDocument()
  })

  it.each([
    ['patient', null],
    ['staff', 'nurse'],
    ['staff', null],
  ] as const)('shows access denied for %s (staffType %s)', (role, staffType) => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role, staffType }) })
    renderLabGated()

    expect(screen.getByRole('heading', { name: ACCESS_DENIED })).toBeInTheDocument()
    expect(screen.queryByText('Laboratory Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument()
  })

  it('redirects to the dashboard when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderLabGated()

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })
})

describe('EmergencyRoute (/emergency/cases/:id)', () => {
  it.each([
    ['patient', null],
    ['admin', null],
    ['doctor', null],
    ['staff', 'nurse'],
  ] as const)('renders the case page for %s (staffType %s)', (role, staffType) => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role, staffType }) })
    renderEmergencyCaseGated()

    expect(screen.getByText('Emergency Case Page')).toBeInTheDocument()
  })

  it.each([
    ['staff', 'receptionist'],
    ['staff', 'lab_technician'],
    ['staff', null],
  ] as const)('shows access denied for %s (staffType %s)', (role, staffType) => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role, staffType }) })
    renderEmergencyCaseGated()

    expect(screen.getByRole('heading', { name: ACCESS_DENIED })).toBeInTheDocument()
    expect(screen.queryByText('Emergency Case Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument()
  })

  it('redirects to the dashboard when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderEmergencyCaseGated()

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })
})
