import { api } from '@/lib/apiClient'

export type AssistantRole = 'user' | 'assistant'

export interface AssistantHistoryTurn {
  role: AssistantRole
  content: string
}

export interface AssistantAction {
  type: 'navigate_to_page' | 'open_appointment' | 'open_conversation' | 'open_invoice' | 'open_profile'
  path: string
}

export interface AssistantChatResponse {
  reply: string
  action?: AssistantAction
}

export interface AssistantChatInput {
  message: string
  context?: { path: string; search?: string }
  history?: AssistantHistoryTurn[]
}

export function sendAssistantMessage(input: AssistantChatInput): Promise<AssistantChatResponse> {
  return api.post('/assistant/chat', input)
}
