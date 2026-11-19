export interface SseMessage {
  event: string
  data: string
}

/**
 * Incremental Server-Sent Events parser. Feed it decoded text chunks as they
 * arrive; it returns the complete events and keeps any partial one buffered.
 * Comment lines (`: keep-alive`) are ignored.
 */
export function createSseParser() {
  let buffer = ''

  return function push(chunk: string): SseMessage[] {
    buffer += chunk.replace(/\r\n?/g, '\n')
    const events: SseMessage[] = []
    let boundary = buffer.indexOf('\n\n')

    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') event = value
        else if (field === 'data') data.push(value)
      }
      if (data.length > 0) events.push({ event, data: data.join('\n') })
    }

    return events
  }
}
