import { api, fetchWithSession, toApiError } from '@/lib/apiClient'
import { createSseParser } from '@/features/adminCopilot/sse'

export const COPILOT_MODULES = [
  'dashboard',
  'emergency',
  'announcements',
  'patients',
  'doctors',
  'appointments',
  'beds',
  'laboratory',
  'billing',
  'reports',
  'staff',
  'approvals',
  'scheduling',
  'profile',
  'settings',
] as const

export type CopilotModule = (typeof COPILOT_MODULES)[number]

export interface CopilotStatus {
  enabled: boolean
  providerConfigured: boolean
  provider: string
  model: string
  writesEnabled: boolean
  phiAllowed: boolean
  ragEnabled: boolean
}

export interface CopilotConversation {
  id: string
  title: string
  activeModule: string | null
  createdAt: string
  updatedAt: string
}

export interface CopilotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  runId: string | null
  createdAt: string
  feedback: 'up' | 'down' | null
}

export type ProposalStatus = 'pending' | 'executing' | 'executed' | 'failed' | 'rejected' | 'expired'

export interface CopilotProposal {
  id: string
  conversationId: string
  actionType: string
  summary: string
  params: Record<string, unknown>
  paramsHash: string
  status: ProposalStatus
  expiresAt: string
  decidedAt: string | null
  executedAt: string | null
  result: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
}

export type CopilotEvent =
  | { type: 'run'; runId: string; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; phase: 'start'; id: string; name: string; domain: string }
  | { type: 'tool'; phase: 'end'; id: string; name: string; domain: string; status: string; durationMs: number }
  | { type: 'proposal'; proposal: CopilotProposal }
  | { type: 'done'; runId: string; status: string; message: CopilotMessage | null; replayed?: boolean }
  | { type: 'error'; code: string; message: string }

export function getCopilotStatus(): Promise<CopilotStatus> {
  return api.get('/admin-ai/status')
}

export function listConversations(cursor?: string): Promise<{ items: CopilotConversation[]; nextCursor: string | null }> {
  return api.get(`/admin-ai/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
}

export function createConversation(input: { activeModule?: CopilotModule; title?: string }): Promise<CopilotConversation> {
  return api.post('/admin-ai/conversations', input)
}

export function renameConversation(id: string, title: string): Promise<{ id: string; title: string }> {
  return api.patch(`/admin-ai/conversations/${encodeURIComponent(id)}`, { title })
}

export function deleteConversation(id: string): Promise<void> {
  return api.del(`/admin-ai/conversations/${encodeURIComponent(id)}`)
}

export function listMessages(id: string, before?: string): Promise<{ messages: CopilotMessage[]; hasMore: boolean }> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  return api.get(`/admin-ai/conversations/${encodeURIComponent(id)}/messages${query}`)
}

export function listProposals(id: string): Promise<CopilotProposal[]> {
  return api.get(`/admin-ai/conversations/${encodeURIComponent(id)}/proposals`)
}

export function approveProposal(id: string, paramsHash: string): Promise<CopilotProposal> {
  return api.post(`/admin-ai/proposals/${encodeURIComponent(id)}/approve`, { paramsHash })
}

export function rejectProposal(id: string, note?: string): Promise<CopilotProposal> {
  return api.post(`/admin-ai/proposals/${encodeURIComponent(id)}/reject`, note ? { note } : {})
}

export function sendFeedback(messageId: string, rating: 'up' | 'down'): Promise<void> {
  return api.post(`/admin-ai/messages/${encodeURIComponent(messageId)}/feedback`, { rating })
}

export interface StreamInput {
  message: string
  activeModule?: CopilotModule
  requestKey: string
}

/**
 * POSTs a message and reads the SSE answer from the same response. Cookie
 * session + CSRF header like every other call -- no token in any URL.
 * Rejects with ApiError for pre-stream failures (4xx/5xx JSON); events after
 * that arrive through `onEvent`. Abort `signal` to cancel the run.
 */
export async function streamCopilotMessage(
  conversationId: string,
  input: StreamInput,
  onEvent: (event: CopilotEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetchWithSession(`/admin-ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { Accept: 'text/event-stream' },
    signal,
  })

  if (!res.ok) throw await toApiError(res)
  if (!res.body) throw new Error('Streaming is not supported in this browser.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const parse = createSseParser()

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    for (const message of parse(decoder.decode(value, { stream: true }))) {
      try {
        onEvent(JSON.parse(message.data) as CopilotEvent)
      } catch {
        // A malformed event is skipped rather than breaking the whole answer.
      }
    }
  }
}

export function newRequestKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '')
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
