import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { ManualSignupForm } from '@/features/auth/ManualSignupForm'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const mockSignup = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ signup: mockSignup }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  mockSignup.mockReset()
  mockNavigate.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

async function fillBaseFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('First name'), 'Ada')
  await user.type(screen.getByLabelText('Last name'), 'Lovelace')
  await user.type(screen.getByLabelText('Email'), 'ada@example.test')
  await user.type(screen.getByLabelText('Password'), 'longenough1')
  await user.type(screen.getByLabelText('Confirm password'), 'longenough1')
}

describe('ManualSignupForm', () => {
  it('shows required-field errors when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Last name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(mockSignup).not.toHaveBeenCalled()
  })

  it('shows a mismatch error when password and confirm password differ', async () => {
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await user.type(screen.getByLabelText('First name'), 'Ada')
    await user.type(screen.getByLabelText('Last name'), 'Lovelace')
    await user.type(screen.getByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.type(screen.getByLabelText('Confirm password'), 'different1')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(mockSignup).not.toHaveBeenCalled()
  })

  it('signs up a patient (default role) with no doctor fields required', async () => {
    mockSignup.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await fillBaseFields(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(mockSignup).toHaveBeenCalledWith({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        password: 'longenough1',
        role: 'patient',
      }),
    )
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.verifyEmail, {
        state: { email: 'ada@example.test' },
      }),
    )
  })

  it('blocks submission client-side (no API call) when doctor role is missing doctor fields', async () => {
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await user.click(screen.getByRole('radio', { name: /doctor/i }))
    await fillBaseFields(user)
    // Doctor fields (specialization/department/bio/experienceYears) left empty.
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Please complete your doctor profile fields'),
    )
    expect(mockSignup).not.toHaveBeenCalled()
  })

  it('signs up a doctor with all doctor fields filled in', async () => {
    mockSignup.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await user.click(screen.getByRole('radio', { name: /doctor/i }))
    await fillBaseFields(user)
    await user.type(screen.getByLabelText('Specialization'), 'Cardiology')
    await user.selectOptions(screen.getByLabelText('Department'), 'Cardiology')
    await user.type(screen.getByLabelText('Bio'), 'Heart stuff')
    await user.type(screen.getByLabelText('Years of experience'), '10')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(mockSignup).toHaveBeenCalledWith({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        password: 'longenough1',
        role: 'doctor',
        specialization: 'Cardiology',
        department: 'Cardiology',
        bio: 'Heart stuff',
        experienceYears: 10,
      }),
    )
  })

  it('shows the server error message when signup fails (e.g. duplicate email)', async () => {
    mockSignup.mockRejectedValue(new ApiError('An account with this email already exists', { status: 409 }))
    const user = userEvent.setup()
    render(<ManualSignupForm />)

    await fillBaseFields(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('An account with this email already exists'),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
