const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.75
/** ~1.3MB of base64 -- comfortably under the server's request body limit. */
const MAX_DATA_URL_LENGTH = 1_800_000

/** Downscales and re-encodes an image file client-side so it's small enough to send inline as a chat attachment. */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser')

  ctx.drawImage(bitmap, 0, 0, width, height)
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Image is too large even after compression')
  }

  return dataUrl
}
