import { useRef, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import { fileToCompressedDataUrl } from '@/utils/imageAttachment'

/** Picks, compresses, and previews a single image to attach to a chat message. */
export function useChatImageAttachment() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }

    setIsProcessing(true)
    try {
      setImageDataUrl(await fileToCompressedDataUrl(file))
    } catch {
      toast.error('Could not attach that image — try a smaller one')
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    imageDataUrl,
    isProcessing,
    inputRef,
    handleFileChange,
    clear: () => setImageDataUrl(null),
    openPicker: () => inputRef.current?.click(),
  }
}
