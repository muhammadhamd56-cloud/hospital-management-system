import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountApprovalsPage } from '@/pages/accountApprovals/AccountApprovalsPage'
import type { AccountRequest } from '@/features/accountApprovals/api'

const mockList = vi.fn()
const mockReview = vi.fn()

vi.mock('@/features/accountApprovals/api', () => ({
  listAccountRequests: (...args: unknown[]) => mockList(...args),
  reviewAccountRequest: (...args: unknown[]) => mockReview(...args),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

function request(overrides: Partial<AccountRequest> = {}): AccountRequest {
  return {
    id: 'user-1',
    fullName: 'Dana Doctor',
    email: 'dana@example.test',
    role: 'doctor',
    status: 'pending',
    specialization: 'Cardiology',
    department: 'Cardiology',
    requestedAt: '2026-10-16T09:00:00.000Z',
    reviewedAt: null,
    note: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue({ requests: [request()] })
  mockReview.mockReset().mockResolvedValue({ request: request({ status: 'approved' }) })
})

describe('AccountApprovalsPage', () => {
  it('lists pending doctor and staff applicants', async () => {
    render(<AccountApprovalsPage />)

    expect(await screen.findByText('Dana Doctor')).toBeInTheDocument()
    expect(screen.getByText('dana@example.test')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith('pending')
  })

  it('approves an applicant and removes them from the queue', async () => {
    const user = userEvent.setup()
    render(<AccountApprovalsPage />)
    await screen.findByText('Dana Doctor')

    await user.click(screen.getByRole('button', { name: 'Approve Dana Doctor' }))

    await waitFor(() => expect(mockReview).toHaveBeenCalledWith('user-1', { decision: 'approve', note: undefined }))
    await waitFor(() => expect(screen.queryByText('Dana Doctor')).toBeNull())
    expect(screen.getByText('No accounts waiting for approval')).toBeInTheDocument()
  })

  it('rejects with the reason the admin typed', async () => {
    const user = userEvent.setup()
    render(<AccountApprovalsPage />)
    await screen.findByText('Dana Doctor')

    await user.click(screen.getByRole('button', { name: 'Reject Dana Doctor' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Reason/), 'Licence could not be verified')
    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }))

    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith('user-1', { decision: 'reject', note: 'Licence could not be verified' }),
    )
  })

  it('shows the load error instead of an empty queue when the request fails', async () => {
    const { ApiError } = await import('@/lib/apiClient')
    mockList.mockRejectedValue(new ApiError('Forbidden resource', { status: 403 }))

    render(<AccountApprovalsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden resource')
    expect(screen.queryByText('No accounts waiting for approval')).toBeNull()
  })
})
