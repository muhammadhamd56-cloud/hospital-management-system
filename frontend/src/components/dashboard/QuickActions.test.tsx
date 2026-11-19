import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuickActions } from '@/components/dashboard/QuickActions'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

// Stand-ins that "create" an account as soon as they open, so the test is
// about what QuickActions does with the result -- not the forms themselves.
vi.mock('@/features/doctors/AddDoctorModal', () => ({
  AddDoctorModal: ({ isOpen, onCreated }: { isOpen: boolean; onCreated: (r: unknown) => void }) =>
    isOpen ? (
      <button onClick={() => onCreated({ staff: { fullName: 'Dr. Grace Hopper' }, tempPassword: 'Temp-Doc-123' })}>
        submit doctor
      </button>
    ) : null,
}))
vi.mock('@/features/patients/AddPatientModal', () => ({
  AddPatientModal: ({ isOpen, onCreated }: { isOpen: boolean; onCreated: (r: unknown) => void }) =>
    isOpen ? (
      <button onClick={() => onCreated({ patient: { fullName: 'Ada Lovelace' }, tempPassword: 'Temp-Pat-456' })}>
        submit patient
      </button>
    ) : null,
}))
vi.mock('@/features/appointments/BookAppointmentModal', () => ({ BookAppointmentModal: () => null }))
vi.mock('@/features/billing/CreateInvoiceModal', () => ({ CreateInvoiceModal: () => null }))
vi.mock('@/features/laboratory/RequestLabTestModal', () => ({ RequestLabTestModal: () => null }))

describe('QuickActions', () => {
  it("shows a new doctor's temporary password instead of dropping it", async () => {
    const user = userEvent.setup()
    render(<QuickActions />)

    await user.click(screen.getByRole('button', { name: /add doctor/i }))
    await user.click(screen.getByRole('button', { name: 'submit doctor' }))

    expect(await screen.findByText('Temp-Doc-123')).toBeInTheDocument()
    expect(screen.getByText(/Relay this temporary password to Dr\. Grace Hopper/)).toBeInTheDocument()
  })

  it("shows a new patient's temporary password", async () => {
    const user = userEvent.setup()
    render(<QuickActions />)

    await user.click(screen.getByRole('button', { name: /add patient/i }))
    await user.click(screen.getByRole('button', { name: 'submit patient' }))

    expect(await screen.findByText('Temp-Pat-456')).toBeInTheDocument()
  })
})
