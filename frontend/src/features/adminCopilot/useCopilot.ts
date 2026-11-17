import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  approveProposal,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  listProposals,
  newRequestKey,
  rejectProposal,
  sendFeedback,
  streamCopilotMessage,
  type CopilotConversation,
  type CopilotEvent,
  type CopilotMessage,
  type CopilotModule,
  type CopilotProposal,
} from '@/features/adminCopilot/api'

export interface ToolActivity {
  id: string
  name: string
  domain: string
  status: 'running' | string
  durationMs?: number
}

export interface StreamingState {
  text: string
  tools: ToolActivity[]
}

export interface CopilotError {
  message: string
  /** Present when the same message can be sent again. */
  retry?: { text: string; requestKey: string }
}

const TITLE_LENGTH = 60

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Connection lost. Check your network and try again.'
}

/** State and actions for the admin copilot panel. All data comes from /admin-ai; nothing is cached across users. */
export function useCopilot(activeModule: CopilotModule) {
  const [conversations, setConversations] = useState<CopilotConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [proposals, setProposals] = useState<CopilotProposal[]>([])
  const [streaming, setStreaming] = useState<StreamingState | null>(null)
  const [error, setError] = useState<CopilotError | null>(null)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Guards against a slow thread load landing after the admin switched conversations.
  const activeIdRef = useRef<string | null>(null)

  const refreshConversations = useCallback(async () => {
    try {
      const page = await listConversations()
      setConversations(page.items)
    } catch {
      // History is a convenience; the panel keeps working without it.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listConversations()
      .then((page) => {
        if (!cancelled) setConversations(page.items)
      })
      .catch(() => {
        // History is a convenience; the panel keeps working without it.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const loadThread = useCallback(async (id: string) => {
    setIsLoadingThread(true)
    try {
      const [page, props] = await Promise.all([listMessages(id), listProposals(id)])
      if (activeIdRef.current !== id) return
      setMessages(page.messages)
      setHasMore(page.hasMore)
      setProposals(props)
    } catch (err) {
      if (activeIdRef.current === id) setError({ message: errorMessage(err) })
    } finally {
      if (activeIdRef.current === id) setIsLoadingThread(false)
    }
  }, [])

  const selectConversation = useCallback(
    (id: string | null) => {
      abortRef.current?.abort()
      activeIdRef.current = id
      setActiveId(id)
      setMessages([])
      setProposals([])
      setHasMore(false)
      setStreaming(null)
      setError(null)
      if (id) void loadThread(id)
    },
    [loadThread],
  )

  const loadOlder = useCallback(async () => {
    const id = activeIdRef.current
    if (!id || messages.length === 0) return
    try {
      const page = await listMessages(id, messages[0].id)
      if (activeIdRef.current !== id) return
      setMessages((prev) => [...page.messages, ...prev])
      setHasMore(page.hasMore)
    } catch (err) {
      setError({ message: errorMessage(err) })
    }
  }, [messages])

  const send = useCallback(
    async (text: string, requestKey: string = newRequestKey()) => {
      const body = text.trim()
      if (!body || streaming) return

      setError(null)
      let conversationId = activeIdRef.current
      try {
        if (!conversationId) {
          const created = await createConversation({ activeModule, title: body.slice(0, TITLE_LENGTH) })
          conversationId = created.id
          activeIdRef.current = created.id
          setActiveId(created.id)
          setConversations((prev) => [created, ...prev])
        }
      } catch (err) {
        setError({ message: errorMessage(err) })
        return
      }

      const optimistic: CopilotMessage = {
        id: `pending-${requestKey}`,
        role: 'user',
        content: body,
        runId: null,
        createdAt: new Date().toISOString(),
        feedback: null,
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), optimistic])
      setStreaming({ text: '', tools: [] })

      const controller = new AbortController()
      abortRef.current = controller
      let serverReportedFailure = false
      const threadId = conversationId

      const onEvent = (event: CopilotEvent) => {
        if (activeIdRef.current !== threadId) return
        switch (event.type) {
          case 'text':
            setStreaming((prev) => (prev ? { ...prev, text: prev.text + event.delta } : prev))
            break
          case 'tool':
            setStreaming((prev) => {
              if (!prev) return prev
              if (event.phase === 'start') {
                return { ...prev, tools: [...prev.tools, { id: event.id, name: event.name, domain: event.domain, status: 'running' }] }
              }
              return {
                ...prev,
                tools: prev.tools.map((tool) =>
                  tool.id === event.id ? { ...tool, status: event.status, durationMs: event.durationMs } : tool,
                ),
              }
            })
            break
          case 'proposal':
            setProposals((prev) => [...prev.filter((p) => p.id !== event.proposal.id), event.proposal])
            break
          case 'error':
            serverReportedFailure = true
            setError({ message: event.message, retry: { text: body, requestKey: newRequestKey() } })
            break
          default:
            break
        }
      }

      try {
        await streamCopilotMessage(threadId, { message: body, activeModule, requestKey }, onEvent, controller.signal)
        if (activeIdRef.current === threadId) {
          // Reload so the thread shows the stored messages (real ids, feedback state).
          const [page, props] = await Promise.all([listMessages(threadId), listProposals(threadId)])
          if (activeIdRef.current === threadId) {
            setMessages(page.messages)
            setHasMore(page.hasMore)
            setProposals(props)
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Stopped by the admin: the server cancels the run and stores no reply.
        } else if (activeIdRef.current === threadId && !serverReportedFailure) {
          // Outcome unknown (network drop): retrying with the same key replays the
          // finished answer instead of running it twice.
          const retryable = !(err instanceof ApiError) || err.status >= 500 || err.status === 409
          setError({ message: errorMessage(err), retry: retryable ? { text: body, requestKey } : undefined })
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (activeIdRef.current === threadId) setStreaming(null)
        void refreshConversations()
      }
    },
    [activeModule, streaming, refreshConversations],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const retry = useCallback(() => {
    if (!error?.retry) return
    const { text, requestKey } = error.retry
    setMessages((prev) => prev.filter((m) => !m.id.startsWith('pending-')))
    void send(text, requestKey)
  }, [error, send])

  const decide = useCallback(async (proposal: CopilotProposal, approve: boolean) => {
    try {
      const updated = approve ? await approveProposal(proposal.id, proposal.paramsHash) : await rejectProposal(proposal.id)
      setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      return updated
    } catch (err) {
      setError({ message: errorMessage(err) })
      return null
    }
  }, [])

  const rate = useCallback(async (messageId: string, rating: 'up' | 'down') => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)))
    try {
      await sendFeedback(messageId, rating)
    } catch (err) {
      setError({ message: errorMessage(err) })
    }
  }, [])

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeIdRef.current === id) selectConversation(null)
      } catch (err) {
        setError({ message: errorMessage(err) })
      }
    },
    [selectConversation],
  )

  return {
    conversations,
    activeId,
    messages,
    hasMore,
    proposals,
    streaming,
    error,
    isLoadingThread,
    send,
    stop,
    retry,
    selectConversation,
    loadOlder,
    decide,
    rate,
    remove,
    dismissError: () => setError(null),
  }
}
