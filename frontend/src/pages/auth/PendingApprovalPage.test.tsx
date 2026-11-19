import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingApprovalPage } from '@/pages/auth/PendingApprovalPage'

const mockUseAuth = vi.fn()
const mockRefresh = vi.fn()
const mockLogout = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function authWith(approvalStatus: 'pending' | 'rejected', approvalNote: string | null = null) {
  mockUseAuth.mockReturnValue({
    user: { email: 'dana@example.test', role: 'doctor', approvalStatus, approvalNote },
    refresh: mockRefresh,
    logout: mockLogout,
  })
}

beforeEach(() => {
  mockRefresh.mockReset().mockResolvedValue(undefined)
  mockLogout.mockReset().mockResolvedValue(undefined)
})

describe('PendingApprovalPage', () => {
  it('explains the wait and re-checks the status on demand', async () => {
    authWith('pending')
    const user = userEvent.setup()
    render(<PendingApprovalPage />)

    expect(screen.getByText('Your account is awaiting approval')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check again' }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it("shows a rejected applicant the admin's reason, with no 'check again'", () => {
    authWith('rejected', 'Licence could not be verified')
    render(<PendingApprovalPage />)

    expect(screen.getByText('Your account request was not approved')).toBeInTheDocument()
    expect(screen.getByText('Licence could not be verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
  })

  it('lets the user sign out', async () => {
    authWith('pending')
    const user = userEvent.setup()
    render(<PendingApprovalPage />)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockLogout).toHaveBeenCalled()
  })
})
