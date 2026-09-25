import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { CreateEmergencyModal } from '@/features/emergency/CreateEmergencyModal'
import { createEmergency } from '@/features/emergency/api'
import { ApiError } from '@/lib/apiClient'
import { buildEmergencyCaseUrl } from '@/constants/routes'

const mockNavigate = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/features/emergency/api', () => ({
  createEmergency: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  vi.mocked(createEmergency).mockReset()
  vi.mocked(toast.error).mockClear()
})

describe('CreateEmergencyModal', () => {
  it('does not create a case when the modal is closed', () => {
    render(<CreateEmergencyModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByText(/emergency assistance/i)).not.toBeInTheDocument()
  })

  it('does nothing when Cancel is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CreateEmergencyModal isOpen onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(createEmergency).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a bare emergency request immediately on confirm and navigates to the case', async () => {
    vi.mocked(createEmergency).mockResolvedValue({
      emergencyCase: {
        id: 'case-1',
        patientId: 'patient-1',
        patientName: 'Pat Patient',
        emergencyType: 'other',
        priority: 'normal',
        status: 'new',
        locationShared: false,
        assignedDoctorName: null,
        assignedStaffName: null,
        assignedTeamName: null,
        createdAt: new Date().toISOString(),
        acknowledgedAt: null,
        assignedAt: null,
        respondingAt: null,
        arrivedAt: null,
        resolvedAt: null,
        cancelledAt: null,
      },
    })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CreateEmergencyModal isOpen onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /confirm emergency/i }))

    await waitFor(() => expect(createEmergency).toHaveBeenCalledWith({}))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(buildEmergencyCaseUrl('case-1')))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the server error and does not navigate when creation fails', async () => {
    vi.mocked(createEmergency).mockRejectedValue(
      new ApiError('You already have an active emergency request.', { status: 409 }),
    )
    const user = userEvent.setup()
    render(<CreateEmergencyModal isOpen onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /confirm emergency/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You already have an active emergency request.'),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
