import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

describe('createSseParser', () => {
  it('reassembles an event split across transport chunks', () => {
    const parser = createSseParser()
    expect(parser.feed('data: {"type":"del')).toEqual([])
    expect(parser.feed('ta","content":"你"}\n')).toEqual([])
    expect(parser.feed('\ndata: {"type":"done"}\n\n')).toEqual([
      '{"type":"delta","content":"你"}',
      '{"type":"done"}',
    ])
  })

  it('supports CRLF boundaries and multiple events in one chunk', () => {
    const parser = createSseParser()
    const events = parser.feed(
      ': heartbeat\r\n\r\ndata: {"type":"start"}\r\n\r\ndata: {"type":"done"}\r\n\r\n',
    )
    expect(events).toEqual(['{"type":"start"}', '{"type":"done"}'])
  })

  it('joins multiline data fields and ignores the DONE sentinel', () => {
    const parser = createSseParser()
    expect(parser.feed('data: first\ndata: second\n\ndata: [DONE]\n\n')).toEqual([
      'first\nsecond',
    ])
  })

  it('flushes a final event without a trailing blank line', () => {
    const parser = createSseParser()
    expect(parser.feed('data: {"type":"done"}')).toEqual([])
    expect(parser.flush()).toEqual(['{"type":"done"}'])
  })
})
