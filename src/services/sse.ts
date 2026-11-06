export interface SseParser {
  feed(chunk: string): string[]
  flush(): string[]
}

export function createSseParser(): SseParser {
  let buffer = ''

  function parseBlock(block: string): string | null {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
    if (dataLines.length === 0) return null
    const data = dataLines.join('\n')
    return data === '[DONE]' ? null : data
  }

  function extract(blocks: string[]): string[] {
    const events: string[] = []
    for (const block of blocks) {
      const event = parseBlock(block)
      if (event !== null) events.push(event)
    }
    return events
  }

  return {
    feed(chunk: string): string[] {
      buffer += chunk
      const blocks: string[] = []
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary !== -1) {
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? ''
        blocks.push(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + separator.length)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      return extract(blocks)
    },
    flush(): string[] {
      const remaining = buffer
      buffer = ''
      return remaining.trim() ? extract([remaining]) : []
    },
  }
}
