import { Marked } from 'marked'
import DOMPurify, { type Config as PurifyConfig } from 'dompurify'
import hljs from 'highlight.js/lib/common'

/**
 * Markdown rendering tuned for text that is still being written.
 *
 * ## Split-parse
 *
 * Re-parsing an entire 8KB response every animation frame is wasteful and gets
 * worse as the response grows — precisely backwards, since the end of a long answer
 * is where smoothness matters most.
 *
 * Markdown block elements are separated by blank lines, so everything before the
 * final blank line is settled and cannot be changed by future tokens. `splitStream`
 * cuts there: the **stable** half is parsed once and memoized, and only the short
 * **tail** is re-parsed per frame. Cost becomes a function of the current paragraph
 * rather than the whole message.
 *
 * ## Sanitization
 *
 * Model output is untrusted input. Everything is piped through DOMPurify before it
 * reaches `dangerouslySetInnerHTML`, so a response containing `<img onerror=...>`
 * renders as text instead of executing in a privileged-ish window.
 */

const marked = new Marked({
  gfm: true,
  breaks: true,
})

/** Cache of parsed stable prefixes, keyed by the source text. */
const stableCache = new Map<string, string>()
const STABLE_CACHE_LIMIT = 400

// Not `as const`: DOMPurify's Config declares these as mutable string[].
const PURIFY_CONFIG: PurifyConfig = {
  // No `style` (CSS injection), no embedding elements (framing / plugin surface).
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['style', 'srcset', 'formaction'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Force every anchor to open externally. The main process turns `target=_blank`
 * into a `shell.openExternal` call and denies in-app navigation.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderMarkdown(source: string): string {
  if (!source) return ''
  const html = marked.parse(source, { async: false })
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

/** Memoized variant for the settled prefix, which is re-rendered unchanged often. */
export function renderStable(source: string): string {
  if (!source) return ''

  const cached = stableCache.get(source)
  if (cached !== undefined) return cached

  const html = renderMarkdown(source)

  // Bounded FIFO. Each streaming block produces a new prefix per paragraph, so an
  // unbounded cache would retain every intermediate state of every message.
  if (stableCache.size >= STABLE_CACHE_LIMIT) {
    const oldest = stableCache.keys().next().value
    if (oldest !== undefined) stableCache.delete(oldest)
  }
  stableCache.set(source, html)
  return html
}

/**
 * Split into `[settled, inProgress]` at the last blank line.
 *
 * Inside an unterminated fenced code block the whole text is treated as tail: a
 * blank line within a fence isn't a block boundary, and splitting there would parse
 * half a fence and flash a broken code block on screen.
 */
export function splitStream(text: string): [stable: string, tail: string] {
  if (text.length < 200) return ['', text]

  if (hasOpenCodeFence(text)) {
    const fenceStart = text.lastIndexOf('\n```')
    if (fenceStart > 0) return [text.slice(0, fenceStart + 1), text.slice(fenceStart + 1)]
    return ['', text]
  }

  const boundary = text.lastIndexOf('\n\n')
  if (boundary <= 0) return ['', text]
  return [text.slice(0, boundary + 2), text.slice(boundary + 2)]
}

function hasOpenCodeFence(text: string): boolean {
  let count = 0
  let index = text.indexOf('```')
  while (index !== -1) {
    count += 1
    index = text.indexOf('```', index + 3)
  }
  return count % 2 === 1
}

/**
 * Syntax-highlight code blocks inside an already-rendered, already-sanitized tree.
 *
 * Deliberately applied post-render on *settled* content only: highlighting a code
 * block that is still being typed re-tokenizes it every frame for a result that
 * changes constantly, which costs frame budget for no readability gain.
 */
export function highlightCodeBlocks(root: HTMLElement): void {
  const blocks = root.querySelectorAll<HTMLElement>('pre code:not([data-highlighted])')
  for (const block of blocks) {
    const language = /language-(\w+)/.exec(block.className)?.[1]
    try {
      const { value } =
        language && hljs.getLanguage(language)
          ? hljs.highlight(block.textContent ?? '', { language })
          : hljs.highlightAuto(block.textContent ?? '')
      // Safe: hljs emits only <span class>, and the source text came from DOMPurify.
      block.innerHTML = value
      block.dataset.highlighted = 'true'
    } catch {
      block.dataset.highlighted = 'true'
    }
  }
}
