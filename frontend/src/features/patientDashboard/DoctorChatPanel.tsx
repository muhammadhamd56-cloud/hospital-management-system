import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { getChatThread, listChatInbox, sendChatMessage } from '@/features/patientDashboard/api'
import { formatSessionTime } from '@/features/patientDashboard/formatSession'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'
import type { ChatMessage } from '@/types/chatMessage'
import type { PatientAppointment } from '@/types/patientSession'

interface DoctorChatPanelProps {
  appointments: PatientAppointment[]
}

interface DoctorOption {
  doctorId: string
  doctorName: string
  specialization: string
}

export function DoctorChatPanel({ appointments }: DoctorChatPanelProps) {
  const [inboxDoctors, setInboxDoctors] = useState<DoctorOption[]>([])

  useEffect(() => {
    listChatInbox()
      .then((res) => setInboxDoctors(res.doctors))
      .catch(() => {
        // Non-critical: falls back to appointment-derived doctors below.
      })
  }, [])

  const doctorOptions = useMemo<DoctorOption[]>(() => {
    const seen = new Map<string, DoctorOption>()
    for (const appointment of appointments) {
      if (!seen.has(appointment.doctorId)) {
        seen.set(appointment.doctorId, {
          doctorId: appointment.doctorId,
          doctorName: appointment.doctorName,
          specialization: appointment.specialization,
        })
      }
    }
    for (const doctor of inboxDoctors) {
      if (!seen.has(doctor.doctorId)) {
        seen.set(doctor.doctorId, doctor)
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.doctorName.localeCompare(b.doctorName))
  }, [appointments, inboxDoctors])

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null)
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    if (!selectedDoctorId && doctorOptions.length > 0) {
      setSelectedDoctorId(doctorOptions[0].doctorId)
    }
  }, [doctorOptions, selectedDoctorId])

  useEffect(() => {
    if (!selectedDoctorId) return

    setIsLoading(true)
    getChatThread(selectedDoctorId)
      .then((res) => setThread(res.thread))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load conversation'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [selectedDoctorId])

  const selectedDoctor = doctorOptions.find((doctor) => doctor.doctorId === selectedDoctorId)

  async function handleSend() {
    const body = draft.trim()
    if (!selectedDoctorId || !body) return

    const doctorId = selectedDoctorId
    setDraft('')
    setIsSending(true)

    const optimisticMessage: ChatMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      doctorId,
      sender: 'patient',
      body,
      createdAt: new Date().toISOString(),
    }
    setThread((prev) => [...prev, optimisticMessage])
    setIsTyping(true)

    try {
      const { thread: updated } = await sendChatMessage(doctorId, body)
      setTimeout(() => {
        setThread(updated)
        setIsTyping(false)
        setIsSending(false)
      }, 600)
    } catch (error) {
      setThread((prev) => prev.filter((message) => message.id !== optimisticMessage.id))
      setIsTyping(false)
      setIsSending(false)
      const message = error instanceof ApiError ? error.message : 'Failed to send message'
      toast.error(message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
        <CardDescription>Chat with your care team.</CardDescription>
      </CardHeader>
      <CardContent>
        {doctorOptions.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Book a session or message a doctor from Suggested Doctors to start chatting."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
            <ul className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
              {doctorOptions.map((doctor) => (
                <li key={doctor.doctorId} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorId(doctor.doctorId)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      doctor.doctorId === selectedDoctorId
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <p className="truncate font-medium">{doctor.doctorName}</p>
                    <p className="truncate text-xs opacity-80">{doctor.specialization}</p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-col rounded-lg border border-surface-border">
              <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 320 }}>
                {isLoading ? (
                  <p className="py-8 text-center text-sm text-ink-muted">Loading conversation…</p>
                ) : (
                  <>
                    {thread.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex',
                          message.sender === 'patient' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                            message.sender === 'patient'
                              ? 'bg-brand-600 text-white'
                              : 'bg-surface-alt text-ink',
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
                    ))}
                    {isTyping && selectedDoctor && (
                      <p className="text-xs italic text-ink-muted">
                        {selectedDoctor.doctorName} is typing…
                      </p>
                    )}
                  </>
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
