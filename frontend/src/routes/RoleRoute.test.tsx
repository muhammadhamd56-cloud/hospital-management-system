import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleRoute } from '@/routes/RoleRoute'
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
    picture: null,
    role: 'patient',
    roleSelected: true,
    hasPassword: true,
    emailVerified: true,
    ...overrides,
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
})

function renderRoleGated(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
        <Route element={<RoleRoute allow={['admin', 'doctor']} />}>
          <Route path={ROUTES.doctors} element={<div>Doctors Admin Page</div>} />
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
  })

  it("redirects to the dashboard when the user's role is not in the allow-list", () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'patient' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })

  it('renders the route when the role is allowed', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'doctor' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Doctors Admin Page')).toBeInTheDocument()
  })

  it('renders the route for a different allowed role too (admin)', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ role: 'admin' }) })
    renderRoleGated(ROUTES.doctors)

    expect(screen.getByText('Doctors Admin Page')).toBeInTheDocument()
  })
})
