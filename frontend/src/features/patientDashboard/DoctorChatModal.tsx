import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { getChatThread, sendChatMessage } from '@/features/patientDashboard/api'
import { formatSessionTime } from '@/features/patientDashboard/formatSession'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'
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
    if (!body) return

    setDraft('')
    setIsSending(true)

    try {
      const res = await sendChatMessage(doctor.id, body)
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
                <div
                  key={message.id}
                  className={cn('flex', message.sender === 'patient' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                      message.sender === 'patient' ? 'bg-brand-600 text-white' : 'bg-surface-alt text-ink',
                    )}
                  >
                    <p>{message.body}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        message.sender === 'patient' ? 'text-white/70' : 'text-ink-muted',
                      )}
                    >
                      {formatSessionTime(message.createdAt)}
                    </p>
                  </div>
                </div>
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
