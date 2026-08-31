import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateInvoiceModal } from '@/features/billing/CreateInvoiceModal'

const mockListPatients = vi.fn()
const mockCreateInvoice = vi.fn()

vi.mock('@/features/patients/api', () => ({
  listPatients: (...args: unknown[]) => mockListPatients(...args),
}))

vi.mock('@/features/billing/api', () => ({
  createInvoice: (...args: unknown[]) => mockCreateInvoice(...args),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const patients = [
  { id: 'patient-1', fullName: 'Ada Lovelace', email: 'ada@example.test', phone: '+15551234567', picture: null, joinedAt: '2026-01-01', appointmentCount: 0, lastVisit: null },
  { id: 'patient-2', fullName: 'Neymar Jr', email: 'neymar@example.test', phone: null, picture: null, joinedAt: '2026-01-01', appointmentCount: 0, lastVisit: null },
]

beforeEach(() => {
  mockListPatients.mockReset().mockResolvedValue({ patients })
  mockCreateInvoice.mockReset()
})

async function selectPatient(user: ReturnType<typeof userEvent.setup>, name: string) {
  const search = await screen.findByPlaceholderText('Search patient by name...')
  await user.type(search, name)
  await user.click(await screen.findByText(name))
}

describe('CreateInvoiceModal', () => {
  it('searches and selects a patient, showing the selected patient card', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    await selectPatient(user, 'Neymar Jr')

    expect(screen.getByText('Neymar Jr')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search patient by name...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change patient/i })).toBeInTheDocument()
  })

  it('keeps focus and accepts every keystroke in a service Description field', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={onClose} onCreate={vi.fn()} />)

    const itemDescription = await screen.findByPlaceholderText('e.g. Consultation')
    await user.click(itemDescription)
    await user.type(itemDescription, 'Consultation')

    expect(itemDescription).toHaveValue('Consultation')
    expect(document.activeElement).toBe(itemDescription)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps focus and accepts every keystroke in Qty, Unit Price, and Discount fields', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={onClose} onCreate={vi.fn()} />)

    const qty = await screen.findByLabelText('Qty')
    await user.click(qty)
    await user.clear(qty)
    await user.type(qty, '2')
    expect(qty).toHaveValue(2)
    expect(document.activeElement).toBe(qty)

    const unitPrice = await screen.findByLabelText('Unit Price')
    await user.click(unitPrice)
    await user.clear(unitPrice)
    await user.type(unitPrice, '50')
    expect(unitPrice).toHaveValue(50)
    expect(document.activeElement).toBe(unitPrice)

    const discount = await screen.findByLabelText('Discount')
    await user.click(discount)
    await user.type(discount, '5')
    expect(discount).toHaveValue(5)
    expect(document.activeElement).toBe(discount)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps typing in the Invoice description field independent of line items', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    const description = await screen.findByPlaceholderText('e.g. Consultation and laboratory services')
    await user.click(description)
    await user.type(description, 'August visit')

    expect(description).toHaveValue('August visit')
    expect(document.activeElement).toBe(description)
  })

  it('keeps focus while typing in the invoice-level discount and tax fields', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    const invoiceDiscount = await screen.findByLabelText('Invoice discount (USD)')
    await user.click(invoiceDiscount)
    await user.type(invoiceDiscount, '5')
    expect(invoiceDiscount).toHaveValue(5)
    expect(document.activeElement).toBe(invoiceDiscount)

    const tax = await screen.findByLabelText('Tax (USD)')
    await user.click(tax)
    await user.type(tax, '10')
    expect(tax).toHaveValue(10)
    expect(document.activeElement).toBe(tax)
  })

  it('edits two services independently and computes subtotal/discount/tax/total correctly', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    const [desc1] = await screen.findAllByPlaceholderText('e.g. Consultation')
    await user.type(desc1, 'Consultation')
    const [qty1] = screen.getAllByLabelText('Qty')
    await user.clear(qty1)
    await user.type(qty1, '1')
    const [price1] = screen.getAllByLabelText('Unit Price')
    await user.clear(price1)
    await user.type(price1, '50')

    await user.click(screen.getByRole('button', { name: /add service/i }))

    const descriptions = await screen.findAllByPlaceholderText('e.g. Consultation')
    await user.type(descriptions[1], 'Blood Test')
    const qtys = screen.getAllByLabelText('Qty')
    await user.clear(qtys[1])
    await user.type(qtys[1], '2')
    const prices = screen.getAllByLabelText('Unit Price')
    await user.clear(prices[1])
    await user.type(prices[1], '25')

    // Editing service 2 must not have disturbed service 1.
    expect(desc1).toHaveValue('Consultation')
    expect(qty1).toHaveValue(1)
    expect(price1).toHaveValue(50)
    expect(descriptions[1]).toHaveValue('Blood Test')

    // Subtotal: 1x50 + 2x25 = 100
    await waitFor(() => {
      const subtotalRow = screen.getByText('Subtotal').closest('div')
      expect(subtotalRow).toHaveTextContent('$100.00')
    })

    await user.type(screen.getByLabelText('Invoice discount (USD)'), '5')
    await user.type(screen.getByLabelText('Tax (USD)'), '10')

    // Total: 100 - 5 + 10 = 105
    await waitFor(() => {
      const totalRow = screen.getByText('Total').closest('div')
      expect(totalRow).toHaveTextContent('$105.00')
    })
  })
})
