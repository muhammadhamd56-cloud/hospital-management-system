import { useEffect, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { ChatImageAttachControl } from '@/components/chat/ChatImageAttachControl'
import { useChatImageAttachment } from '@/hooks/useChatImageAttachment'
import { useAutoScrollToBottom } from '@/hooks/useAutoScrollToBottom'
import { getDoctorChatThread, sendDoctorChatMessage } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'
import type { ChatMessage } from '@/types/chatMessage'
import type { DoctorInboxPatient } from '@/types/doctorChatInbox'

interface DoctorInboxPanelProps {
  patients: DoctorInboxPatient[]
  isPatientsLoading?: boolean
  /** Pre-selects this patient's conversation once it appears in the inbox --
   *  e.g. arriving here from a "New message" notification. */
  initialPatientId?: string | null
}

export function DoctorInboxPanel({ patients, isPatientsLoading = false, initialPatientId }: DoctorInboxPanelProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const imageAttachment = useChatImageAttachment()
  const scrollRef = useAutoScrollToBottom(thread)

  useEffect(() => {
    if (selectedPatientId || patients.length === 0) return

    if (initialPatientId && patients.some((patient) => patient.patientId === initialPatientId)) {
      setSelectedPatientId(initialPatientId)
    } else {
      setSelectedPatientId(patients[0].patientId)
    }
  }, [patients, selectedPatientId, initialPatientId])

  useEffect(() => {
    if (!selectedPatientId) return

    setIsLoading(true)
    getDoctorChatThread(selectedPatientId)
      .then((res) => setThread(res.thread))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load conversation'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [selectedPatientId])

  async function handleSend() {
    const body = draft.trim()
    const imageUrl = imageAttachment.imageDataUrl
    if (!selectedPatientId || (!body && !imageUrl)) return

    const patientId = selectedPatientId
    setDraft('')
    imageAttachment.clear()
    setIsSending(true)

    const optimisticMessage: ChatMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      doctorId: patientId,
      sender: 'doctor',
      body,
      imageUrl,
      createdAt: new Date().toISOString(),
    }
    setThread((prev) => [...prev, optimisticMessage])

    try {
      const { thread: updated } = await sendDoctorChatMessage(patientId, {
        body: body || undefined,
        imageUrl: imageUrl ?? undefined,
      })
      setThread(updated)
    } catch (error) {
      setThread((prev) => prev.filter((message) => message.id !== optimisticMessage.id))
      const message = error instanceof ApiError ? error.message : 'Failed to send message'
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
        <CardDescription>Conversations with your patients.</CardDescription>
      </CardHeader>
      <CardContent>
        {!isPatientsLoading && patients.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Once a patient books or messages you, they'll show up here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
            <ul className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
              {patients.map((patient) => (
                <li key={patient.patientId} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    onClick={() => setSelectedPatientId(patient.patientId)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      patient.patientId === selectedPatientId
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <p className="truncate font-medium">{patient.patientName}</p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-col rounded-lg border border-surface-border">
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 320 }}>
                {isLoading ? (
                  <p className="py-8 text-center text-sm text-ink-muted">Loading conversation…</p>
                ) : (
                  thread.map((message) => (
                    <ChatMessageBubble key={message.id} message={message} isOwn={message.sender === 'doctor'} />
                  ))
                )}
              </div>
              <form
                className="flex items-center gap-2 border-t border-surface-border p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSend()
                }}
              >
                <ChatImageAttachControl
                  imageDataUrl={imageAttachment.imageDataUrl}
                  isProcessing={imageAttachment.isProcessing}
                  inputRef={imageAttachment.inputRef}
                  onFileChange={imageAttachment.handleFileChange}
                  onPick={imageAttachment.openPicker}
                  onClear={imageAttachment.clear}
                />
                <div className="flex-1">
                  <Input
                    label="Message"
                    hideLabel
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" isLoading={isSending} aria-label="Send message">
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
