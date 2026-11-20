import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { getCopilotStatus, type CopilotMessage, type CopilotProposal, type CopilotStatus } from '@/features/adminCopilot/api'
import { Markdown } from '@/features/adminCopilot/Markdown'
import { MODULE_LABELS, MODULE_SUGGESTIONS, moduleForPath } from '@/features/adminCopilot/modules'
import { ProposalCard } from '@/features/adminCopilot/ProposalCard'
import { useCopilot, type StreamingState } from '@/features/adminCopilot/useCopilot'

/**
 * Admin entry point. Shows the full copilot when the backend reports it
 * enabled; otherwise (feature flag off, 404) renders nothing.
 */
export function AdminCopilot() {
  const [status, setStatus] = useState<CopilotStatus | null | 'unavailable'>(null)

  useEffect(() => {
    let cancelled = false
    getCopilotStatus()
      .then((result) => !cancelled && setStatus(result))
      .catch(() => !cancelled && setStatus('unavailable'))
    return () => {
      cancelled = true
    }
  }, [])

  if (status === null || status === 'unavailable') return null
  return <CopilotShell status={status} />
}

function CopilotShell({ status }: { status: CopilotStatus }) {
  const [isOpen, setIsOpen] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {!isOpen && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open MediCore Copilot"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand-600 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-brand-700"
        >
          <Sparkles className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Copilot</span>
        </button>
      )}
      {isOpen && (
        <CopilotPanel
          status={status}
          onClose={() => {
            setIsOpen(false)
            requestAnimationFrame(() => launcherRef.current?.focus())
          }}
        />
      )}
    </>
  )
}

type ThreadItem = { kind: 'message'; at: number; message: CopilotMessage } | { kind: 'proposal'; at: number; proposal: CopilotProposal }

function CopilotPanel({ status, onClose }: { status: CopilotStatus; onClose: () => void }) {
  const location = useLocation()
  const activeModule = moduleForPath(location.pathname)
  const copilot = useCopilot(activeModule)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    composerRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const items = useMemo<ThreadItem[]>(() => {
    const all: ThreadItem[] = [
      ...copilot.messages.map((message) => ({ kind: 'message' as const, at: Date.parse(message.createdAt), message })),
      ...copilot.proposals.map((proposal) => ({ kind: 'proposal' as const, at: Date.parse(proposal.createdAt), proposal })),
    ]
    return all.sort((a, b) => a.at - b.at)
  }, [copilot.messages, copilot.proposals])

  const lastItemKey = items.length
  useEffect(() => {
    const node = scrollRef.current
    if (node && typeof node.scrollTo === 'function') node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [lastItemKey, copilot.streaming?.text, copilot.streaming?.tools.length])

  function submit(text?: string) {
    const body = (text ?? draft).trim()
    if (!body || copilot.streaming) return
    setDraft('')
    void copilot.send(body)
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const isEmpty = items.length === 0 && !copilot.streaming && !copilot.isLoadingThread

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="MediCore Copilot"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-surface-border bg-surface shadow-2xl sm:w-[30rem]"
    >
      <header className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
        {view === 'history' ? (
          <button type="button" onClick={() => setView('chat')} aria-label="Back to chat" className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{view === 'history' ? 'Conversation history' : 'MediCore Copilot'}</p>
          {view === 'chat' && <p className="truncate text-xs text-ink-muted">Context: {MODULE_LABELS[activeModule]}</p>}
        </div>
        {view === 'chat' && (
          <>
            <button type="button" onClick={() => setView('history')} aria-label="Conversation history" className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt">
              <History className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => copilot.selectConversation(null)}
              aria-label="New conversation"
              className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Close Copilot" className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt">
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      {view === 'history' ? (
        <div className="flex-1 overflow-y-auto p-2">
          {copilot.conversations.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-muted">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {copilot.conversations.map((conversation) => (
                <li key={conversation.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      copilot.selectConversation(conversation.id)
                      setView('chat')
                    }}
                    className={cn(
                      'min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-surface-alt',
                      conversation.id === copilot.activeId && 'bg-brand-50 dark:bg-brand-500/10',
                    )}
                  >
                    <p className="truncate text-sm text-ink">{conversation.title}</p>
                    <p className="text-xs text-ink-muted">{new Date(conversation.updatedAt).toLocaleString()}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void copilot.remove(conversation.id)}
                    aria-label={`Delete conversation ${conversation.title}`}
                    className="rounded-lg p-2 text-ink-muted opacity-60 hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {!status.providerConfigured && (
              <Notice tone="warning">The AI provider isn’t configured on the server yet, so questions can’t be answered.</Notice>
            )}

            {copilot.hasMore && (
              <div className="text-center">
                <Button size="sm" variant="ghost" onClick={() => void copilot.loadOlder()}>
                  Load earlier messages
                </Button>
              </div>
            )}

            {copilot.isLoadingThread && (
              <div className="space-y-3" aria-label="Loading conversation">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="h-14 animate-pulse rounded-xl bg-surface-alt" />
                ))}
              </div>
            )}

            {isEmpty && <EmptyState status={status} module={activeModule} onPick={submit} />}

            {items.map((item) =>
              item.kind === 'message' ? (
                <MessageBubble key={item.message.id} message={item.message} onRate={copilot.rate} />
              ) : (
                <ProposalCard key={item.proposal.id} proposal={item.proposal} onDecide={copilot.decide} />
              ),
            )}

            {copilot.streaming && <StreamingBubble state={copilot.streaming} />}

            {copilot.error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-500/30 bg-danger-50 p-3 text-sm text-danger-600 dark:bg-danger-500/10">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="flex-1">{copilot.error.message}</p>
                {copilot.error.retry && (
                  <button type="button" onClick={copilot.retry} className="flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Retry
                  </button>
                )}
                <button type="button" onClick={copilot.dismissError} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-danger-500/10">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <form
            className="border-t border-surface-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-surface-border bg-surface-alt p-2 focus-within:border-brand-500">
              <label htmlFor="copilot-composer" className="sr-only">
                Ask the Copilot
              </label>
              <textarea
                id="copilot-composer"
                ref={composerRef}
                rows={1}
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKey}
                placeholder={`Ask about ${MODULE_LABELS[activeModule].toLowerCase()}…`}
                className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              {copilot.streaming ? (
                <Button type="button" size="sm" variant="outline" onClick={copilot.stop} aria-label="Stop generating">
                  <Square className="size-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" size="sm" aria-label="Send" disabled={!draft.trim()}>
                  <Sparkles className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Read-only answers from live hospital data. Changes always need your approval. Not for clinical decisions.
            </p>
          </form>
        </>
      )}
    </aside>
  )
}

function Notice({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 text-xs',
        tone === 'warning' ? 'border-warning-500/40 bg-warning-50 text-warning-600 dark:bg-warning-500/10' : 'border-info-500/30 bg-info-50 text-info-600 dark:bg-info-500/10',
      )}
    >
      {children}
    </div>
  )
}

function EmptyState({ status, module, onPick }: { status: CopilotStatus; module: keyof typeof MODULE_SUGGESTIONS; onPick: (text: string) => void }) {
  return (
    <div className="space-y-4 py-4">
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
          <Sparkles className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink">How can I help with {MODULE_LABELS[module].toLowerCase()}?</p>
        <p className="mt-1 text-xs text-ink-muted">I analyse live hospital data across all 15 admin modules.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {!status.writesEnabled && <Badge variant="neutral">Read-only mode</Badge>}
        {!status.phiAllowed && <Badge variant="info">Patient identities masked</Badge>}
      </div>
      <div className="space-y-2">
        {MODULE_SUGGESTIONS[module].map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            disabled={!status.providerConfigured}
            className="w-full rounded-xl border border-surface-border px-3 py-2.5 text-left text-sm text-ink transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ message, onRate }: { message: CopilotMessage; onRate: (id: string, rating: 'up' | 'down') => void }) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">{message.content}</div>
      </div>
    )
  }

  const isStored = !message.id.startsWith('pending-')

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  return (
    <div className="group">
      <div className="rounded-2xl rounded-bl-md bg-surface-alt px-3.5 py-2.5 text-ink">
        <Markdown text={message.content} />
      </div>
      {isStored && (
        <div className="mt-1 flex items-center gap-1 text-ink-muted">
          <IconButton label={copied ? 'Copied' : 'Copy answer'} onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          </IconButton>
          <IconButton label="Helpful" pressed={message.feedback === 'up'} onClick={() => onRate(message.id, 'up')}>
            <ThumbsUp className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label="Not helpful" pressed={message.feedback === 'down'} onClick={() => onRate(message.id, 'down')}>
            <ThumbsDown className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </div>
  )
}

function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn('rounded-md p-1 hover:bg-surface-alt hover:text-ink', pressed && 'text-brand-600')}
    >
      {children}
    </button>
  )
}

function toolLabel(name: string): string {
  const [domain, action = ''] = name.split('.')
  return `${domain} · ${action.replace(/([A-Z])/g, ' $1').toLowerCase()}`
}

function StreamingBubble({ state }: { state: StreamingState }) {
  return (
    <div className="space-y-2" data-testid="copilot-streaming">
      {state.tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Data sources used">
          {state.tools.map((tool) => (
            <li
              key={tool.id}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                tool.status === 'running' && 'border-brand-500/40 text-brand-700 dark:text-brand-300',
                tool.status === 'succeeded' && 'border-surface-border text-ink-muted',
                tool.status !== 'running' && tool.status !== 'succeeded' && 'border-danger-500/40 text-danger-600',
              )}
            >
              {tool.status === 'running' ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : tool.status === 'succeeded' ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <Wrench className="size-3" aria-hidden="true" />
              )}
              {toolLabel(tool.name)}
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-2xl rounded-bl-md bg-surface-alt px-3.5 py-2.5 text-ink">
        {state.text ? (
          <Markdown text={state.text} />
        ) : (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {state.tools.length > 0 ? 'Analysing hospital data…' : 'Thinking…'}
          </span>
        )}
      </div>
    </div>
  )
}
