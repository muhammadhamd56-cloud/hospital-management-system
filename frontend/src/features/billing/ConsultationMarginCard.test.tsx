import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { ConsultationMarginCard } from '@/features/billing/ConsultationMarginCard'
import { ApiError } from '@/lib/apiClient'

const mockGetPlatformSettings = vi.fn()
const mockUpdatePlatformSettings = vi.fn()

vi.mock('@/features/billing/api', () => ({
  getPlatformSettings: (...args: unknown[]) => mockGetPlatformSettings(...args),
  updatePlatformSettings: (...args: unknown[]) => mockUpdatePlatformSettings(...args),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockGetPlatformSettings.mockReset().mockResolvedValue({ consultationMargin: 5 })
  mockUpdatePlatformSettings.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('ConsultationMarginCard', () => {
  it('loads and displays the current margin', async () => {
    render(<ConsultationMarginCard />)

    expect(await screen.findByText('$5.00')).toBeInTheDocument()
  })

  it('edits and saves a new margin', async () => {
    mockUpdatePlatformSettings.mockResolvedValue({ consultationMargin: 10 })
    const user = userEvent.setup()

    render(<ConsultationMarginCard />)
    await screen.findByText('$5.00')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = screen.getByLabelText('Margin (USD)')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockUpdatePlatformSettings).toHaveBeenCalledWith({ consultationMargin: 10 }))
    expect(await screen.findByText('$10.00')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalled()
  })

  it('rejects a negative margin without calling the API', async () => {
    const user = userEvent.setup()

    render(<ConsultationMarginCard />)
    await screen.findByText('$5.00')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = screen.getByLabelText('Margin (USD)')
    await user.clear(input)
    await user.type(input, '-1')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Enter a valid, non-negative amount'))
    expect(mockUpdatePlatformSettings).not.toHaveBeenCalled()
  })

  it('shows a friendly error and keeps editing open when the save fails', async () => {
    mockUpdatePlatformSettings.mockRejectedValue(new ApiError('Something went wrong', { status: 500 }))
    const user = userEvent.setup()

    render(<ConsultationMarginCard />)
    await screen.findByText('$5.00')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Something went wrong'))
    expect(screen.getByLabelText('Margin (USD)')).toBeInTheDocument()
  })
})
