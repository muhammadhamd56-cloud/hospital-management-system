import { Fragment, type ReactNode } from 'react'

/**
 * Small, safe Markdown renderer for copilot answers: headings, paragraphs,
 * bullet/numbered lists, tables, code blocks, **bold**, *italic*, `code`.
 * Builds React elements only (never innerHTML), and deliberately renders
 * links as plain text so model output can't turn into a phishing link.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2 text-sm leading-relaxed">{renderBlocks(text)}</div>
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[0.8em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i += 1
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-surface-alt p-3 font-mono text-xs">
          {code.join('\n')}
        </pre>,
      )
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const className = heading[1].length <= 2 ? 'text-base font-semibold' : 'text-sm font-semibold'
      blocks.push(
        <p key={key++} className={className} role="heading" aria-level={heading[1].length + 2}>
          {renderInline(heading[2], `h${key}`)}
        </p>,
      )
      i += 1
      continue
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]))
      blocks.push(
        <div key={key++} className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-alt">
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className="px-2 py-1.5 font-semibold">
                    {renderInline(cell, `th${key}-${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-t border-surface-border">
                  {row.map((cell, c) => (
                    <td key={c} className="px-2 py-1.5 align-top">
                      {renderInline(cell, `td${key}-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const bullet = /^\s*[-*•]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const marker = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && marker.test(lines[i])) items.push(lines[i++].replace(marker, ''))
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag key={key++} className={ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
          {items.map((item, n) => (
            <li key={n}>{renderInline(item, `li${key}-${n}`)}</li>
          ))}
        </ListTag>,
      )
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i])
    ) {
      paragraph.push(lines[i++])
    }
    blocks.push(
      <p key={key++}>
        {paragraph.map((part, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {renderInline(part, `p${key}-${n}`)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return blocks
}
