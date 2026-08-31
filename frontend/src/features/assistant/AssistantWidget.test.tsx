import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { AssistantWidget } from '@/features/assistant/AssistantWidget'
import { sendAssistantMessage } from '@/features/assistant/api'
import { ApiError } from '@/lib/apiClient'

vi.mock('@/features/assistant/api', () => ({
  sendAssistantMessage: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

let mockRole = 'patient'
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  vi.mocked(sendAssistantMessage).mockReset()
  vi.mocked(toast.error).mockClear()
  mockNavigate.mockReset()
  mockRole = 'patient'
})

function renderWidget() {
  return render(
    <MemoryRouter initialEntries={['/billing?invoiceId=inv-1']}>
      <AssistantWidget />
    </MemoryRouter>,
  )
}

describe('AssistantWidget', () => {
  it('starts closed, showing only the floating trigger button', () => {
    renderWidget()
    expect(screen.getByLabelText('Open AI Assistant')).toBeInTheDocument()
    expect(screen.queryByText('Hi! How can I help you?', { exact: false })).toBeNull()
  })

  it('opens the panel with a greeting and role-appropriate suggestions', async () => {
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))

    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(screen.getByText('Show my appointments')).toBeInTheDocument()
    expect(screen.getByText('Show my unpaid invoices')).toBeInTheDocument()
  })

  it('sends a suggestion as a message, shows a loading state, then the reply', async () => {
    let resolveResponse: (value: { reply: string }) => void = () => {}
    vi.mocked(sendAssistantMessage).mockImplementation(
      () => new Promise((resolve) => { resolveResponse = resolve }),
    )
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))
    await user.click(screen.getByText('Show my appointments'))

    expect(screen.getByText('Show my appointments')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Thinking…')).toBeInTheDocument())

    resolveResponse({ reply: 'Sure — opening your appointments.' })

    expect(await screen.findByText('Sure — opening your appointments.')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).toBeNull()
  })

  it('sends the current page context and recent history with the message', async () => {
    vi.mocked(sendAssistantMessage).mockResolvedValue({ reply: 'It is invoice INV-0007, due soon.' })
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))
    await user.type(screen.getByPlaceholderText('Ask something…'), 'What is this?')
    await user.click(screen.getByLabelText('Send'))

    await waitFor(() => expect(sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'What is this?',
        context: { path: '/billing', search: '?invoiceId=inv-1' },
        history: [],
      }),
    ))
  })

  it('navigates when the assistant returns an action pointing at a real, known route', async () => {
    vi.mocked(sendAssistantMessage).mockResolvedValue({
      reply: 'Opening your invoice.',
      action: { type: 'open_invoice', path: '/billing?invoiceId=inv-1' },
    })
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))
    await user.click(screen.getByText('Show my unpaid invoices'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/billing?invoiceId=inv-1'))
  })

  it('never navigates when the action path is not a known internal route (frontend action validation)', async () => {
    vi.mocked(sendAssistantMessage).mockResolvedValue({
      reply: 'Here you go.',
      action: { type: 'navigate_to_page', path: 'https://evil.example.com' } as never,
    })
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))
    await user.click(screen.getByText('Take me to my profile'))

    await screen.findByText('Here you go.')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a friendly error and toast when the request fails, without crashing', async () => {
    vi.mocked(sendAssistantMessage).mockRejectedValue(new ApiError('The AI Assistant is not configured.', { status: 500 }))
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))
    await user.click(screen.getByText('Open my messages'))

    expect(await screen.findByText('The AI Assistant is not configured.')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('The AI Assistant is not configured.')
  })

  it('shows doctor-specific suggestions for a doctor account', async () => {
    mockRole = 'doctor'
    const user = userEvent.setup()
    renderWidget()

    await user.click(screen.getByLabelText('Open AI Assistant'))

    expect(screen.getByText("Show today's appointments")).toBeInTheDocument()
    expect(screen.getByText('How do I change my consultation fee?')).toBeInTheDocument()
  })
})
