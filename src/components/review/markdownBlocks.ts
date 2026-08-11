import { Marked, type Token } from 'marked'

/**
 * Source → top-level blocks, each carrying the line range it came from.
 *
 * ## Why blocks at all
 *
 * A rendered markdown document has no line numbers, but every comment in this
 * surface is a line range on the current file — that is the only anchor the store
 * has and the only thing the agent can act on. So the preview is not one opaque
 * `innerHTML`; it is a sequence of top-level blocks, each of which knows which
 * source lines produced it. A comment written against a paragraph is a comment on
 * that paragraph's lines, and it shows up at exactly those lines in Source mode.
 *
 * ## The mapping rule
 *
 * marked's lexer guarantees the one property this rests on: the `raw` strings of
 * the top-level tokens, concatenated in order, reproduce the source **exactly**.
 * So a cursor walked across them is a cursor walked across the file, and counting
 * newlines is enough — no re-searching the source for each token's text, and no
 * ambiguity when the same paragraph appears twice.
 *
 *   - `startLine` is wherever the cursor stands when the token begins.
 *   - `endLine` counts the newlines in the token's raw **with trailing blank lines
 *     stripped**, so a paragraph followed by a blank line does not claim the blank
 *     line. Otherwise adjacent blocks would overlap on the separator and a comment
 *     could land in two of them.
 *   - The cursor then advances by the newlines in the *untrimmed* raw, blank lines
 *     included, because those lines are really there in the file.
 *
 * `space` tokens (runs of blank lines) and `def` tokens (link reference
 * definitions, which render nothing) advance the cursor but produce no block:
 * there is nothing on screen to hang a comment off. Their lines therefore belong
 * to no block, which is a deliberate hole — see `blockForLine`.
 *
 * ## What this lexer is and isn't
 *
 * It's configured to match `@/lib/markdown`'s options (gfm, breaks) so the block
 * boundaries agree with what that module will render. It deliberately does *not*
 * install the math extensions: they change token *types*, not top-level
 * boundaries, and this function only ever reads `raw`. A `$$…$$` display block
 * lexes here as a paragraph — same lines, same one block — and the renderer still
 * renders it as math.
 */

const lexer = new Marked({ gfm: true, breaks: true })

export type MarkdownBlock = {
  /** The exact source text of this block, ready to hand to `renderMarkdown`. */
  raw: string
  /** 1-indexed, inclusive, on the content as passed in. */
  startLine: number
  endLine: number
}

/** Tokens that occupy lines but put nothing on screen to comment on. */
const INVISIBLE = new Set(['space', 'def'])

function countNewlines(text: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') count += 1
  }
  return count
}

export function splitMarkdownBlocks(source: string): MarkdownBlock[] {
  if (!source) return []

  let tokens: Token[]
  try {
    tokens = lexer.lexer(source)
  } catch {
    // A lexer that throws must not cost the reader the document. One block for
    // the whole file still renders, and still comments — just coarsely.
    return [{ raw: source, startLine: 1, endLine: Math.max(1, countNewlines(source) + 1) }]
  }

  const blocks: MarkdownBlock[] = []
  let cursor = 1

  for (const token of tokens) {
    const raw = token.raw
    if (!raw) continue

    const advance = countNewlines(raw)
    if (!INVISIBLE.has(token.type)) {
      // `\r` too: a CRLF file's trailing separator is "\r\n", and leaving the
      // carriage return behind would make the trim a no-op on Windows content.
      const trimmed = raw.replace(/[\r\n]+$/, '')
      blocks.push({
        raw,
        startLine: cursor,
        endLine: cursor + countNewlines(trimmed),
      })
    }
    cursor += advance
  }

  return blocks
}

/** The extensions this pane treats as prose worth previewing. */
const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.markdown']

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * Does this block's range overlap that one?
 *
 * Used for both marks (does a changed run touch this block) and comments (does
 * this note belong under it). Half-open comparisons in both directions, since
 * both ends of both ranges are inclusive.
 */
export function rangesOverlap(
  a: { startLine: number; endLine: number },
  b: { startLine: number; endLine: number },
): boolean {
  return a.startLine <= b.endLine && a.endLine >= b.startLine
}

/**
 * The first block a line range touches, or -1.
 *
 * "First" is what keeps a comment from rendering twice: a range spanning three
 * paragraphs is one note, and it belongs at the top of what it spans. Lines that
 * fall in the gaps between blocks — blank separators, link definitions — match
 * nothing, and the pane collects those comments in its orphan section rather than
 * silently dropping them.
 */
export function blockIndexFor(
  blocks: MarkdownBlock[],
  range: { startLine: number; endLine: number },
): number {
  return blocks.findIndex((block) => rangesOverlap(block, range))
}
