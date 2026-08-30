import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute'
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
    role: 'patient',
    roleSelected: true,
    hasPassword: true,
    emailVerified: true,
    mustChangePassword: false,
    mfaEnabled: false,
    staffType: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
})

function renderProtected(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={ROUTES.login} element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path={ROUTES.selectRole} element={<div>Select Role Page</div>} />
          <Route path={ROUTES.setPassword} element={<div>Set Password Page</div>} />
          <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a spinner while auth state is loading, rendering neither the route nor the login redirect', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true })
    const { container } = renderProtected(ROUTES.dashboard)

    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('Dashboard Page')).toBeNull()
    expect(screen.queryByText('Login Page')).toBeNull()
  })

  it('redirects to login when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderProtected(ROUTES.dashboard)

    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('redirects to select-role when the user has not picked a role yet', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ roleSelected: false }), isLoading: false })
    renderProtected(ROUTES.dashboard)

    expect(screen.getByText('Select Role Page')).toBeInTheDocument()
  })

  it('does NOT redirect away from select-role itself when roleSelected is false', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ roleSelected: false }), isLoading: false })
    renderProtected(ROUTES.selectRole)

    expect(screen.getByText('Select Role Page')).toBeInTheDocument()
  })

  it('renders the protected route when logged in with a role already selected', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ roleSelected: true }), isLoading: false })
    renderProtected(ROUTES.dashboard)

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })

  it('redirects to set-password when the account must change its password', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ mustChangePassword: true }), isLoading: false })
    renderProtected(ROUTES.dashboard)

    expect(screen.getByText('Set Password Page')).toBeInTheDocument()
  })

  it('does NOT redirect away from set-password itself when mustChangePassword is true', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ mustChangePassword: true }), isLoading: false })
    renderProtected(ROUTES.setPassword)

    expect(screen.getByText('Set Password Page')).toBeInTheDocument()
  })

  it('renders the protected route when mustChangePassword is false', () => {
    mockUseAuth.mockReturnValue({ user: baseUser({ mustChangePassword: false }), isLoading: false })
    renderProtected(ROUTES.dashboard)

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })
})

describe('PublicOnlyRoute', () => {
  function renderPublicOnly(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={ROUTES.dashboard} element={<div>Dashboard Page</div>} />
          <Route element={<PublicOnlyRoute />}>
            <Route path={ROUTES.login} element={<div>Login Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders the login page when logged out', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false })
    renderPublicOnly(ROUTES.login)

    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('redirects a logged-in user away from the login page to the dashboard', () => {
    mockUseAuth.mockReturnValue({ user: baseUser(), isLoading: false })
    renderPublicOnly(ROUTES.login)

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
  })

  it('shows a spinner while loading, revealing neither page', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true })
    const { container } = renderPublicOnly(ROUTES.login)

    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('Login Page')).toBeNull()
  })
})
