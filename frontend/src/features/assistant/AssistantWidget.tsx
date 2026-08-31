import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import { sendAssistantMessage, type AssistantHistoryTurn } from '@/features/assistant/api'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY_TURNS = 10

const SUGGESTIONS_BY_ROLE: Record<string, string[]> = {
  patient: ['Show my appointments', 'Open my messages', 'Show my unpaid invoices', 'Take me to my profile'],
  doctor: ["Show today's appointments", 'Open my messages', 'How do I change my consultation fee?'],
  admin: ['Show all appointments', 'Open patients', 'Open billing'],
  staff: ['Show my shifts', 'Open my tasks'],
}

/** Only ever navigate to a path we already know about -- the backend
 *  constructs `action.path` itself, but this is a second, independent check
 *  on the frontend so a malformed/unexpected response can never send the
 *  browser somewhere unexpected (an external origin, a `javascript:` URI). */
function isSafeInternalPath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  const base = path.split('?')[0]
  return (Object.values(ROUTES) as string[]).includes(base)
}

export function AssistantWidget() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node && typeof node.scrollTo === 'function') {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isSending])

  async function handleSend(text?: string) {
    const body = (text ?? draft).trim()
    if (!body || isSending) return

    setDraft('')
    setMessages((prev) => [...prev, { role: 'user', content: body }])
    setIsSending(true)

    const history: AssistantHistoryTurn[] = messages.slice(-MAX_HISTORY_TURNS)

    try {
      const response = await sendAssistantMessage({
        message: body,
        context: { path: location.pathname, search: location.search },
        history,
      })

      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }])

      if (response.action && isSafeInternalPath(response.action.path)) {
        navigate(response.action.path)
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
      setMessages((prev) => [...prev, { role: 'assistant', content: message }])
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  const suggestions = SUGGESTIONS_BY_ROLE[user?.role ?? 'patient'] ?? SUGGESTIONS_BY_ROLE.patient

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-card border border-surface-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-border bg-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="size-5" aria-hidden="true" />
              <p className="text-sm font-semibold">AI Assistant</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close AI Assistant"
              className="rounded-lg p-1 hover:bg-white/10"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-ink">
                Hi! How can I help you? I can take you straight to the right page, or answer quick questions about
                using this app.
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    message.role === 'user' ? 'bg-brand-600 text-white' : 'bg-surface-alt text-ink',
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface-alt px-3 py-2 text-sm italic text-ink-muted">Thinking…</div>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-col gap-2 pt-2">
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <Sparkles className="size-3" aria-hidden="true" />
                  Suggestions
                </p>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSend(suggestion)}
                    className="rounded-lg border border-surface-border px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-surface-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              handleSend()
            }}
          >
            <div className="flex-1">
              <Input
                label="Ask something…"
                hideLabel
                placeholder="Ask something…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={isSending}
              />
            </div>
            <Button type="submit" size="sm" isLoading={isSending} aria-label="Send" disabled={!draft.trim()}>
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
        aria-expanded={isOpen}
        className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-700"
      >
        {isOpen ? <X className="size-6" aria-hidden="true" /> : <Bot className="size-6" aria-hidden="true" />}
      </button>
    </div>
  )
}
