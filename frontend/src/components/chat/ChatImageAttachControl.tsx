import type { ChangeEvent, RefObject } from 'react'
import { Paperclip, X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ChatImageAttachControlProps {
  imageDataUrl: string | null
  isProcessing: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onPick: () => void
  onClear: () => void
}

/** Paperclip button + hidden file input + a small preview thumbnail once an image is picked. */
export function ChatImageAttachControl({
  imageDataUrl,
  isProcessing,
  inputRef,
  onFileChange,
  onPick,
  onClear,
}: ChatImageAttachControlProps) {
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
      <button
        type="button"
        onClick={onPick}
        disabled={isProcessing}
        aria-label="Attach an image"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink',
          isProcessing && 'opacity-50',
        )}
      >
        <Paperclip className="size-4" aria-hidden="true" />
      </button>
      {imageDataUrl && (
        <div className="relative shrink-0">
          <img src={imageDataUrl} alt="Attachment preview" className="size-9 rounded-lg object-cover" />
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove attached image"
            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-ink text-white"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}
