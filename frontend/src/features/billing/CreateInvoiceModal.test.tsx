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

beforeEach(() => {
  mockListPatients.mockReset().mockResolvedValue({ patients: [{ id: 'patient-1', fullName: 'Ada Lovelace' }] })
  mockCreateInvoice.mockReset()
})

describe('CreateInvoiceModal', () => {
  it('keeps focus and accepts every keystroke in a line item Description field', async () => {
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

  it('keeps focus and accepts every keystroke in Qty and Unit Price fields', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={onClose} onCreate={vi.fn()} />)

    const qty = await screen.findByLabelText('Qty')
    await user.click(qty)
    await user.clear(qty)
    await user.type(qty, '2')
    expect(qty).toHaveValue(2)
    expect(document.activeElement).toBe(qty)

    const unitPrice = await screen.findByLabelText('Unit price (USD)')
    await user.click(unitPrice)
    await user.clear(unitPrice)
    await user.type(unitPrice, '50')
    expect(unitPrice).toHaveValue(50)
    expect(document.activeElement).toBe(unitPrice)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps typing in the top-level Description field independent of line items', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    const description = await screen.findByPlaceholderText('e.g. August visit charges')
    await user.click(description)
    await user.type(description, 'August visit')

    expect(description).toHaveValue('August visit')
    expect(document.activeElement).toBe(description)
  })

  it('edits two line items independently and computes the total from both', async () => {
    const user = userEvent.setup()
    render(<CreateInvoiceModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />)

    const [desc1] = await screen.findAllByPlaceholderText('e.g. Consultation')
    await user.type(desc1, 'Consultation')
    const [qty1] = screen.getAllByLabelText('Qty')
    await user.clear(qty1)
    await user.type(qty1, '2')
    const [price1] = screen.getAllByLabelText('Unit price (USD)')
    await user.clear(price1)
    await user.type(price1, '50')

    await user.click(screen.getByRole('button', { name: /add item/i }))

    const descriptions = await screen.findAllByPlaceholderText('e.g. Consultation')
    await user.type(descriptions[1], 'Blood Test')
    const qtys = screen.getAllByLabelText('Qty')
    await user.clear(qtys[1])
    await user.type(qtys[1], '1')
    const prices = screen.getAllByLabelText('Unit price (USD)')
    await user.clear(prices[1])
    await user.type(prices[1], '25')

    // Editing item 2 must not have disturbed item 1.
    expect(desc1).toHaveValue('Consultation')
    expect(qty1).toHaveValue(2)
    expect(price1).toHaveValue(50)
    expect(descriptions[1]).toHaveValue('Blood Test')

    await waitFor(() => expect(screen.getByText('$125.00')).toBeInTheDocument())
  })
})
