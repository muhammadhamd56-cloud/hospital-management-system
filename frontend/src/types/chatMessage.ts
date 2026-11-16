export type ChatSender = 'patient' | 'doctor'

export interface ChatMessage {
  id: string
  doctorId: string
  sender: ChatSender
  body: string
  imageUrl: string | null
  createdAt: string
}

/** One page of a chat thread (the API returns the newest page by default). */
export interface ChatThreadPage {
  /** Oldest first. */
  thread: ChatMessage[]
  /** More, older messages exist -- request them with `before: thread[0].id`. */
  hasMore: boolean
}

/** Merges two lists of the same thread's messages (e.g. already-loaded older
 *  pages plus a fresh newest page), de-duplicated by id, oldest first. */
export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const message of existing) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id),
  )
}
