import { useState } from 'react'
import { formatSessionTime } from '@/features/patientDashboard/formatSession'
import { ImageLightbox } from '@/components/chat/ImageLightbox'
import { cn } from '@/utils/cn'
import type { ChatMessage } from '@/types/chatMessage'

interface ChatMessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
}

export function ChatMessageBubble({ message, isOwn }: ChatMessageBubbleProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
          isOwn ? 'bg-brand-600 text-white' : 'bg-surface-alt text-ink',
        )}
      >
        {message.imageUrl && (
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            aria-label="View full image"
            className={cn('block w-full cursor-zoom-in', message.body && 'mb-1.5')}
          >
            <img
              src={message.imageUrl}
              alt="Shared attachment"
              className="max-h-60 w-full rounded-lg object-cover"
            />
          </button>
        )}
        {message.body && <p>{message.body}</p>}
        <p className={cn('mt-1 text-[10px]', isOwn ? 'text-white/70' : 'text-ink-muted')}>
          {formatSessionTime(message.createdAt)}
        </p>
      </div>

      {message.imageUrl && (
        <ImageLightbox src={isPreviewOpen ? message.imageUrl : null} onClose={() => setIsPreviewOpen(false)} />
      )}
    </div>
  )
}
