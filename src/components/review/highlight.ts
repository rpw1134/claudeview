import { hljs, languageForPath } from '@/lib/languages'

/**
 * Line-accurate syntax highlighting for the review pane.
 *
 * ## Why not highlight per line
 *
 * The obvious implementation — run hljs once per line — is wrong, not just slow.
 * A highlighter is a state machine: a block comment, a template literal or a
 * multi-line string opened on line 12 and closed on line 20 only reads correctly
 * if lines 13–19 are tokenized *knowing* they are inside it. Highlighting each
 * line in isolation restarts the machine every line, so those middles come back as
 * ordinary code and the pane lies about what it's showing.
 *
 * So the file is highlighted **once**, as one string, and the resulting HTML is
 * split on newlines with the open `<span>` stack carried across the boundary:
 * each line closes whatever is still open, and the next line re-opens it. The
 * output is one self-contained HTML fragment per line, which is what a gutter
 * layout needs — every line has to be its own row so it can carry a mark, a
 * selection fill, and comments beneath it.
 *
 * `highlightAuto` is deliberately never used. It runs every registered grammar
 * over the input and scores them, which on a large file costs more than the rest
 * of the pane put together — for a guess. Unknown extensions render as escaped
 * plain text instead, which is honest and free.
 */

/** Beyond this the pane stops rendering and says so. No virtualization yet. */
export const MAX_LINES = 5000

/**
 * Extension -> grammar now lives in `src/lib/languages.ts`, shared with the
 * transcript's code-block highlighting. Two maps meant the review pane and the
 * chat could disagree about whether, say, `.kt` was a supported language; one
 * registry means adding a grammar lights it up in both places at once.
 */
export const languageFor = languageForPath

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Split hljs output into per-line fragments, re-opening spans across newlines.
 *
 * Safe to scan with a regex precisely because hljs escapes the source: every `<`
 * remaining in the output opens a tag it emitted itself, never a bracket from the
 * file. That is also what makes the result safe for `dangerouslySetInnerHTML` —
 * the only markup present is hljs's own `<span class>`.
 */
function splitHighlighted(html: string): string[] {
  const token = /(<span\b[^>]*>)|(<\/span>)|(\n)/g
  const lines: string[] = []
  const open: string[] = []

  let buffer = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = token.exec(html)) !== null) {
    buffer += html.slice(cursor, match.index)
    cursor = token.lastIndex

    if (match[1]) {
      open.push(match[1])
      buffer += match[1]
    } else if (match[2]) {
      open.pop()
      buffer += '</span>'
    } else {
      lines.push(buffer + '</span>'.repeat(open.length))
      buffer = open.join('')
    }
  }

  lines.push(buffer + html.slice(cursor) + '</span>'.repeat(open.length))
  return lines
}

/**
 * Cache of highlighted files, keyed by path and validated against the content.
 *
 * Tiny and FIFO: the point is that clicking between two or three files while
 * reading doesn't re-tokenize each time. Holding more would retain whole file
 * bodies for files nobody is looking at.
 */
const CACHE_LIMIT = 6
const cache = new Map<string, { content: string; lines: string[] }>()

export type HighlightedFile = {
  /** One HTML fragment per line, already escaped. */
  lines: string[]
  /** Total lines in the file, before the cap. */
  totalLines: number
  truncated: boolean
}

export function highlightFile(path: string, content: string): HighlightedFile {
  const all = content.split('\n')
  const truncated = all.length > MAX_LINES
  const source = truncated ? all.slice(0, MAX_LINES).join('\n') : content

  const cached = cache.get(path)
  if (cached && cached.content === content) {
    return { lines: cached.lines, totalLines: all.length, truncated }
  }

  const language = languageForPath(path)
  let lines: string[]
  if (language) {
    try {
      lines = splitHighlighted(hljs.highlight(source, { language, ignoreIllegals: true }).value)
    } catch {
      // A grammar that throws is not worth failing the pane over; the file still
      // has to be readable, just without colour.
      lines = source.split('\n').map(escapeHtml)
    }
  } else {
    lines = source.split('\n').map(escapeHtml)
  }

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(path, { content, lines })

  return { lines, totalLines: all.length, truncated }
}
