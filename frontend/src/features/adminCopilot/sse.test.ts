import { describe, expect, it } from 'vitest'
import { createSseParser } from '@/features/adminCopilot/sse'
import { moduleForPath } from '@/features/adminCopilot/modules'

describe('createSseParser', () => {
  it('parses complete events and keeps a partial one buffered until it finishes', () => {
    const push = createSseParser()

    expect(push('event: text\ndata: {"type":"text","delta":"Hel')).toEqual([])
    expect(push('lo"}\n\nevent: done\ndata: {"type":"done"}\n\n')).toEqual([
      { event: 'text', data: '{"type":"text","delta":"Hello"}' },
      { event: 'done', data: '{"type":"done"}' },
    ])
  })

  it('ignores keep-alive comments and handles CRLF line endings', () => {
    const push = createSseParser()
    expect(push(': keep-alive\r\n\r\nevent: run\r\ndata: {"a":1}\r\n\r\n')).toEqual([{ event: 'run', data: '{"a":1}' }])
  })

  it('joins multi-line data fields', () => {
    const push = createSseParser()
    expect(push('data: line1\ndata: line2\n\n')).toEqual([{ event: 'message', data: 'line1\nline2' }])
  })
})

describe('moduleForPath', () => {
  it('maps admin pages to copilot modules and defaults to dashboard', () => {
    expect(moduleForPath('/billing')).toBe('billing')
    expect(moduleForPath('/emergency/cases/abc')).toBe('emergency')
    expect(moduleForPath('/staff-scheduling')).toBe('scheduling')
    expect(moduleForPath('/staff')).toBe('staff')
    expect(moduleForPath('/account-approvals')).toBe('approvals')
    expect(moduleForPath('/something-else')).toBe('dashboard')
  })
})
