import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCopilot } from '@/features/adminCopilot/AdminCopilot'
import { Markdown } from '@/features/adminCopilot/Markdown'
import * as copilotApi from '@/features/adminCopilot/api'
import type { CopilotEvent, CopilotProposal, CopilotStatus } from '@/features/adminCopilot/api'
import { ApiError } from '@/lib/apiClient'

vi.mock('@/features/adminCopilot/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/adminCopilot/api')>('@/features/adminCopilot/api')
  return {
    ...actual,
    getCopilotStatus: vi.fn(),
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    listMessages: vi.fn(),
    listProposals: vi.fn(),
    streamCopilotMessage: vi.fn(),
    approveProposal: vi.fn(),
    rejectProposal: vi.fn(),
    sendFeedback: vi.fn(),
    deleteConversation: vi.fn(),
  }
})

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const api = vi.mocked(copilotApi)

const STATUS: CopilotStatus = {
  enabled: true,
  providerConfigured: true,
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  writesEnabled: true,
  phiAllowed: false,
  ragEnabled: false,
}

const proposal: CopilotProposal = {
  id: 'prop-1',
  conversationId: 'conv-1',
  actionType: 'beds.assign',
  summary: 'Assign bed B-2 (Ward A) to patient p1.',
  params: { bedId: 'bed-2', patientId: 'p1' },
  paramsHash: 'a'.repeat(64),
  status: 'pending',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  decidedAt: null,
  executedAt: null,
  result: null,
  errorMessage: null,
  createdAt: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getCopilotStatus.mockResolvedValue(STATUS)
  api.listConversations.mockResolvedValue({ items: [], nextCursor: null })
  api.createConversation.mockResolvedValue({
    id: 'conv-1',
    title: 'Bed occupancy?',
    activeModule: 'beds',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  api.listMessages.mockResolvedValue({ messages: [], hasMore: false })
  api.listProposals.mockResolvedValue([])
})

function renderCopilot(path = '/beds') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminCopilot />
    </MemoryRouter>,
  )
}

async function openPanel() {
  const user = userEvent.setup()
  renderCopilot()
  await user.click(await screen.findByLabelText('Open MediCore Copilot'))
  return user
}

describe('AdminCopilot', () => {
  it('renders nothing when the copilot is disabled on the server', async () => {
    api.getCopilotStatus.mockRejectedValue(new ApiError('Not Found', { status: 404 }))
    const { container } = renderCopilot()
    await waitFor(() => expect(api.getCopilotStatus).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(screen.queryByLabelText('Open MediCore Copilot')).toBeNull()
  })

  it('opens with module context and suggestions, and closes with Escape', async () => {
    const user = await openPanel()

    const panel = screen.getByRole('dialog', { name: 'MediCore Copilot' })
    expect(within(panel).getByText('Context: Beds')).toBeInTheDocument()
    expect(within(panel).getByText('What is the current bed occupancy by department?')).toBeInTheDocument()
    expect(within(panel).getByText('Patient identities masked')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'MediCore Copilot' })).toBeNull()
    expect(screen.getByLabelText('Open MediCore Copilot')).toBeInTheDocument()
  })

  it('streams an answer with tool status, sending the page module as context', async () => {
    let finish: () => void = () => {}
    api.streamCopilotMessage.mockImplementation(async (_id, _input, onEvent: (e: CopilotEvent) => void) => {
      onEvent({ type: 'run', runId: 'run-1', conversationId: 'conv-1' })
      onEvent({ type: 'tool', phase: 'start', id: 't1', name: 'beds.getOccupancy', domain: 'beds' })
      onEvent({ type: 'text', delta: '**12** of 20 beds are occupied.' })
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const user = await openPanel()

    await user.type(screen.getByLabelText('Ask the Copilot'), 'Bed occupancy?{Enter}')

    expect(await screen.findByText('beds · get occupancy')).toBeInTheDocument()
    expect(screen.getByTestId('copilot-streaming')).toHaveTextContent('12 of 20 beds are occupied.')
    expect(api.createConversation).toHaveBeenCalledWith({ activeModule: 'beds', title: 'Bed occupancy?' })
    const [conversationId, input] = api.streamCopilotMessage.mock.calls[0]
    expect(conversationId).toBe('conv-1')
    expect(input).toMatchObject({ message: 'Bed occupancy?', activeModule: 'beds' })
    expect(input.requestKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/)

    api.listMessages.mockResolvedValue({
      messages: [
        { id: 'm1', role: 'user', content: 'Bed occupancy?', runId: 'run-1', createdAt: new Date().toISOString(), feedback: null },
        { id: 'm2', role: 'assistant', content: '**12** of 20 beds are occupied.', runId: 'run-1', createdAt: new Date().toISOString(), feedback: null },
      ],
      hasMore: false,
    })
    finish()

    await waitFor(() => expect(screen.queryByTestId('copilot-streaming')).toBeNull())
    expect(screen.getByLabelText('Helpful')).toBeInTheDocument()
  })

  it('shows the server error and retries with a fresh request key', async () => {
    api.streamCopilotMessage.mockImplementationOnce(async (_id, _input, onEvent: (e: CopilotEvent) => void) => {
      onEvent({ type: 'error', code: 'timeout', message: 'The request took too long and was stopped.' })
    })
    api.streamCopilotMessage.mockResolvedValueOnce(undefined)
    const user = await openPanel()

    await user.type(screen.getByLabelText('Ask the Copilot'), 'Revenue?{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('The request took too long and was stopped.')

    await user.click(screen.getByText('Retry'))
    await waitFor(() => expect(api.streamCopilotMessage).toHaveBeenCalledTimes(2))
    const firstKey = api.streamCopilotMessage.mock.calls[0][1].requestKey
    const secondKey = api.streamCopilotMessage.mock.calls[1][1].requestKey
    expect(secondKey).not.toBe(firstKey)
  })

  it('approves a proposal only after confirmation, quoting its hash', async () => {
    api.streamCopilotMessage.mockImplementation(async (_id, _input, onEvent: (e: CopilotEvent) => void) => {
      onEvent({ type: 'proposal', proposal })
    })
    api.listProposals.mockResolvedValue([proposal])
    api.approveProposal.mockResolvedValue({ ...proposal, status: 'executed', executedAt: new Date().toISOString() })
    const user = await openPanel()

    await user.type(screen.getByLabelText('Ask the Copilot'), 'Assign bed B-2 to p1{Enter}')
    const card = await screen.findByTestId('copilot-proposal')
    expect(within(card).getByText('Awaiting your approval')).toBeInTheDocument()
    expect(within(card).getByText('bed-2')).toBeInTheDocument()

    await user.click(within(card).getByText('Review & approve'))
    expect(api.approveProposal).not.toHaveBeenCalled()
    await user.click(screen.getByText('Approve and run'))

    expect(api.approveProposal).toHaveBeenCalledWith('prop-1', 'a'.repeat(64))
    expect(await within(card).findByText('Done')).toBeInTheDocument()
  })
})

describe('Markdown', () => {
  it('renders formatting without injecting HTML or live links', () => {
    const { container } = render(
      <Markdown text={'# Title\n- **bold** item\n\n<img src=x onerror=alert(1)> [click](https://evil.example)\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>')
  })
})
