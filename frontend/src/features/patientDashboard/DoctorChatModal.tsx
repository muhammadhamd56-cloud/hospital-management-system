import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { ChatImageAttachControl } from '@/components/chat/ChatImageAttachControl'
import { useChatImageAttachment } from '@/hooks/useChatImageAttachment'
import { useAutoScrollToBottom } from '@/hooks/useAutoScrollToBottom'
import { getChatThread, sendChatMessage } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { ChatMessage } from '@/types/chatMessage'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

interface DoctorChatModalProps {
  doctor: DirectoryDoctor | null
  onClose: () => void
}

/** Lets a patient start chatting with a doctor straight from the directory/suggestions — no appointment required. */
export function DoctorChatModal({ doctor, onClose }: DoctorChatModalProps) {
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const imageAttachment = useChatImageAttachment()
  const scrollRef = useAutoScrollToBottom(thread)

  useEffect(() => {
    if (!doctor) return

    setIsLoading(true)
    setThread([])

    getChatThread(doctor.id)
      .then((res) => setThread(res.thread))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load conversation'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [doctor])

  async function handleSend() {
    if (!doctor) return
    const body = draft.trim()
    const imageUrl = imageAttachment.imageDataUrl
    if (!body && !imageUrl) return

    setDraft('')
    imageAttachment.clear()
    setIsSending(true)

    try {
      const res = await sendChatMessage(doctor.id, { body: body || undefined, imageUrl: imageUrl ?? undefined })
      setThread(res.thread)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to send message'
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal isOpen={doctor !== null} onClose={onClose} title={doctor ? `Chat with ${doctor.fullName}` : 'Chat'}>
      {doctor && (
        <div className="flex flex-col gap-3">
          <div
            ref={scrollRef}
            className="flex flex-col gap-2 overflow-y-auto rounded-lg border border-surface-border p-3"
            style={{ minHeight: 220, maxHeight: 320 }}
          >
            {isLoading ? (
              <p className="py-8 text-center text-sm text-ink-muted">Loading conversation…</p>
            ) : thread.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                No messages yet — say hello to get started.
              </p>
            ) : (
              thread.map((message) => (
                <ChatMessageBubble key={message.id} message={message} isOwn={message.sender === 'patient'} />
              ))
            )}
          </div>

          <form
            className="flex items-center gap-2"
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
      )}
    </Modal>
  )
}
