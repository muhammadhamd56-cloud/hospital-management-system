import { describe, expect, it } from 'vitest'
import { mergeChatMessages, type ChatMessage } from '@/types/chatMessage'

function msg(id: string, minute: number): ChatMessage {
  return {
    id,
    doctorId: 'doctor-1',
    sender: 'patient',
    body: id,
    imageUrl: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
  }
}

describe('mergeChatMessages', () => {
  it('keeps already-loaded older pages when the newest page is refreshed, without duplicates', () => {
    const loaded = [msg('a', 1), msg('b', 2), msg('c', 3)]
    const latest = [msg('c', 3), msg('d', 4)]

    expect(mergeChatMessages(loaded, latest).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('prepends an older page in chronological order', () => {
    expect(mergeChatMessages([msg('c', 3)], [msg('a', 1), msg('b', 2)]).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})
