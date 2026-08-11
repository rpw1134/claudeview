/**
 * The pure half of `src/lib/markdown.ts`: string → token decisions, with no
 * KaTeX, no DOMPurify and no DOM.
 *
 * It lives in its own module for one reason — everything here is a plain
 * `string -> match | null` function, so it can be exercised by `npm test`, which
 * runs a bundled SSR build under plain Node. `markdown.ts` cannot be imported
 * there (it imports a stylesheet and registers a DOMPurify hook at module
 * scope), and these delimiter rules are exactly the part that is worth pinning
 * down with tests: every one of them exists to *not* fire on something.
 */

/* ------------------------------------------------------------------ math ---- */

/**
 * Delimiters, deliberately conservative. A false negative — math that renders as
 * literal text — is a cosmetic annoyance. A false positive turns "it costs $5 and
 * change, or $12 for the large" into mangled italic gibberish, which is worse than
 * never supporting inline math at all. So:
 *
 *  - `$$…$$`  display. Unambiguous, and may span lines.
 *  - `\[…\]`  display. Unambiguous.
 *  - `\(…\)`  inline. Unambiguous.
 *  - `$…$`    inline, and only when *all* of these hold:
 *       · the opener is followed by a non-space character,
 *       · the closer is preceded by a non-space character,
 *       · there is no newline between them (a `$` opening a run that closes three
 *         paragraphs later is a currency symbol, not an expression),
 *       · the closer is not followed by a digit — this is what saves `$5–$10`,
 *         whose middle would otherwise satisfy every other rule,
 *       · the content is not purely numeric/punctuation — `$1,000$` is money,
 *       · the content carries some notation, and is not a bare shell variable —
 *         `$PATH:$HOME` is the one that matters in a developer tool, and it
 *         satisfies every rule above.
 *
 * `\$` is left alone: marked's own escape tokenizer claims it before we are asked,
 * and `inlineMathStart` refuses to cut a text run at a backslash-escaped dollar.
 */
const INLINE_MONEY = /^[\s\d.,:%+-]*$/
/** An operator, a brace, a backslash or a digit — something that isn't just prose. */
const MATH_SIGNAL = /[\\^_{}=+*/<>|()[\]-]|\d/
/** `$HOME`, `${PATH}`, `$AWS_REGION`. Real notation is rarely a bare SCREAMING word. */
const SHELL_VARIABLE = /^\{?[A-Z][A-Z0-9_]*\}?$/

/**
 * Display math, anchored at the start of a block.
 *
 * `[\s\S]+?` rather than `.+?` is the whole multi-line story: models overwhelmingly
 * write display math as an opener line, the expression, and a closer line —
 *
 *     $$
 *     E = mc^2
 *     $$
 *
 * — and a `.`-based pattern silently degrades that to literal text. The closer is
 * allowed trailing spaces or tabs before its newline, because trailing whitespace on
 * a `$$` line is invisible in the source and would otherwise decide whether a
 * formula renders.
 *
 * Non-greedy content means the *first* closer wins, so two adjacent display blocks
 * stay two blocks instead of collapsing into one.
 */
const DISPLAY_MATH = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/

export type MathMatch = { raw: string; text: string }

/** Where the block tokenizer should start looking, for marked's `start` hook. */
export function displayMathStart(src: string): number | undefined {
  const index = src.search(/\$\$|\\\[/)
  return index < 0 ? undefined : index
}

export function matchDisplayMath(src: string): MathMatch | null {
  const match = DISPLAY_MATH.exec(src)
  if (!match) return null
  const text = (match[1] ?? match[2] ?? '').trim()
  // `$$ $$` is not a formula; handing an empty string to KaTeX yields an empty
  // block that reads as a rendering bug.
  if (!text) return null
  return { raw: match[0], text }
}

/**
 * `(^|[^\\$])` so an escaped `\$` never becomes a cut point: splitting the text
 * run there would strand the backslash as literal output.
 */
export function inlineMathStart(src: string): number | undefined {
  const match = /(^|[^\\$])(\$|\\\()/.exec(src)
  return match ? match.index + (match[1]?.length ?? 0) : undefined
}

export function matchInlineMath(src: string): MathMatch | null {
  const paren = /^\\\(([\s\S]+?)\\\)/.exec(src)
  if (paren) return { raw: paren[0], text: (paren[1] ?? '').trim() }

  const dollar = /^\$([^\n$]+)\$(?!\d)/.exec(src)
  if (!dollar) return null

  const body = dollar[1] ?? ''
  if (/^\s/.test(body) || /\s$/.test(body)) return null
  if (INLINE_MONEY.test(body)) return null
  if (SHELL_VARIABLE.test(body)) return null
  // One or two characters is the `$n$` / `$xy$` case, where there is no room for a
  // signal; beyond that, prose with no notation in it is prose.
  if (body.length > 2 && !MATH_SIGNAL.test(body)) return null
  return { raw: dollar[0], text: body }
}

/**
 * Fence languages that mean "this is a formula", not "this is source code".
 *
 * Models reach for a fence at least as often as they reach for `$$` — asked for a
 * derivation you get ```` ```math ```` or ```` ```latex ```` — and rendering those as
 * a code block full of backslashes was the most visible way math failed to appear.
 * `tex`/`latex` are a small gamble: someone pasting a real `.tex` *document* to be
 * read as source loses their highlighting. KaTeX rejects document-level TeX
 * (`\documentclass`, `\begin{document}`), and a rejected fence falls back to the
 * plain code block, so that case lands on its feet anyway.
 */
const MATH_FENCE_LANGUAGES = new Set(['math', 'latex', 'katex', 'tex'])

/** marked hands over the whole info string; only the first word is the language. */
export function isMathFence(info: string): boolean {
  const language = info.trim().split(/\s+/)[0] ?? ''
  return MATH_FENCE_LANGUAGES.has(language.toLowerCase())
}

/* ------------------------------------------------------------ split-parse ---- */

/**
 * Split into `[settled, inProgress]` at the last blank line.
 *
 * Inside an unterminated fenced code block the whole text is treated as tail: a
 * blank line within a fence isn't a block boundary, and splitting there would parse
 * half a fence and flash a broken code block on screen. A half-arrived `$$…$$`
 * display block has the same problem and gets the same treatment — and because the
 * multi-line form spends its entire life half-arrived (`$$\nE =` is several frames
 * of streaming), this guard is what keeps a formula from flashing as literal
 * dollars before it resolves.
 */
export function splitStream(text: string): [stable: string, tail: string] {
  if (text.length < 200) return ['', text]

  if (hasOpenCodeFence(text)) return splitBefore(text, '\n```')
  if (hasOpenDisplayMath(text)) return splitBefore(text, '\n$$')

  const boundary = text.lastIndexOf('\n\n')
  if (boundary <= 0) return ['', text]
  return [text.slice(0, boundary + 2), text.slice(boundary + 2)]
}

/** Cut immediately before the last occurrence of `marker`, or treat it all as tail. */
function splitBefore(text: string, marker: string): [stable: string, tail: string] {
  const start = text.lastIndexOf(marker)
  if (start > 0) return [text.slice(0, start + 1), text.slice(start + 1)]
  return ['', text]
}

function countOccurrences(text: string, needle: string): number {
  let count = 0
  let index = text.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = text.indexOf(needle, index + needle.length)
  }
  return count
}

export function hasOpenCodeFence(text: string): boolean {
  return countOccurrences(text, '```') % 2 === 1
}

/**
 * An odd number of `$$` means a display block is still open. Inline `$…$` cannot
 * confuse this — it is a single dollar — and a stray literal `$$` at worst defers
 * the split for a frame or two, which is invisible.
 */
export function hasOpenDisplayMath(text: string): boolean {
  return countOccurrences(text, '$$') % 2 === 1
}
