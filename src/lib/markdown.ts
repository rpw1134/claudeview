import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked'
import DOMPurify, { type Config as PurifyConfig } from 'dompurify'
import katex from 'katex'
import { hljs } from '@/lib/languages'

// KaTeX's stylesheet, imported here rather than appended to index.css so the fonts
// it references resolve through Vite's asset pipeline: the 60 `KaTeX_*.woff2` files
// are emitted into dist/assets with hashed names and loaded from the app origin,
// which the production CSP already covers under `font-src 'self'`. No external host
// is involved, so the policy needs no relaxation.
import 'katex/dist/katex.min.css'

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
 *
 * ## Where the expensive work lives
 *
 * Three enrichments, at three different costs, placed accordingly:
 *
 *  - **Math (KaTeX)** is cheap and synchronous, so it is a normal marked extension
 *    and runs in both halves. It participates in the ordinary parse, which means its
 *    output reaches DOMPurify with everything else rather than beside it.
 *  - **Syntax highlighting** re-tokenizes whole code blocks, so it is a post-render
 *    DOM pass over settled content only.
 *  - **Mermaid** is a ~1MB dependency and a full layout engine, so it is
 *    dynamically imported on first sighting and likewise only ever touches settled
 *    content. Until then the diagram shows as its own escaped source.
 */

/* ------------------------------------------------------------------ math ---- */

/**
 * Delimiters, deliberately conservative. A false negative — math that renders as
 * literal text — is a cosmetic annoyance. A false positive turns "it costs $5 and
 * change, or $12 for the large" into mangled italic gibberish, which is worse than
 * never supporting inline math at all. So:
 *
 *  - `$$…$$`  display. Unambiguous, may span lines.
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
 * and the `start` hook below refuses to cut a text run at a backslash-escaped
 * dollar.
 */
const INLINE_MONEY = /^[\s\d.,:%+-]*$/
/** An operator, a brace, a backslash or a digit — something that isn't just prose. */
const MATH_SIGNAL = /[\\^_{}=+*/<>|()[\]-]|\d/
/** `$HOME`, `${PATH}`, `$AWS_REGION`. Real notation is rarely a bare SCREAMING word. */
const SHELL_VARIABLE = /^\{?[A-Z][A-Z0-9_]*\}?$/

function renderMath(source: string, displayMode: boolean): string {
  // `throwOnError: false` renders a parse failure as a red inline marker, which is
  // the right behaviour for untrusted input: bad TeX must never take out the frame.
  // `output: 'html'` keeps MathML out of the tree — one markup surface to sanitize.
  return katex.renderToString(source, { throwOnError: false, output: 'html', displayMode })
}

const displayMath: TokenizerAndRendererExtension = {
  name: 'displayMath',
  level: 'block',
  start(src: string) {
    const index = src.search(/\$\$|\\\[/)
    return index < 0 ? undefined : index
  },
  tokenizer(src: string) {
    const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n+|$)/.exec(src)
    if (!match) return undefined
    return { type: 'displayMath', raw: match[0], text: (match[1] ?? match[2] ?? '').trim() }
  },
  renderer(token: Tokens.Generic) {
    return `<p class="math-display">${renderMath(String(token.text), true)}</p>`
  },
}

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src: string) {
    // `(^|[^\\$])` so an escaped `\$` never becomes a cut point: splitting the text
    // run there would strand the backslash as literal output.
    const match = /(^|[^\\$])(\$|\\\()/.exec(src)
    return match ? match.index + (match[1]?.length ?? 0) : undefined
  },
  tokenizer(src: string) {
    const paren = /^\\\(([\s\S]+?)\\\)/.exec(src)
    if (paren) return { type: 'inlineMath', raw: paren[0], text: (paren[1] ?? '').trim() }

    const dollar = /^\$([^\n$]+)\$(?!\d)/.exec(src)
    if (!dollar) return undefined

    const body = dollar[1] ?? ''
    if (/^\s/.test(body) || /\s$/.test(body)) return undefined
    if (INLINE_MONEY.test(body)) return undefined
    if (SHELL_VARIABLE.test(body)) return undefined
    // One or two characters is the `$n$` / `$xy$` case, where there is no room for a
    // signal; beyond that, prose with no notation in it is prose.
    if (body.length > 2 && !MATH_SIGNAL.test(body)) return undefined
    return { type: 'inlineMath', raw: dollar[0], text: body }
  },
  renderer(token: Tokens.Generic) {
    return renderMath(String(token.text), false)
  },
}

const marked = new Marked({
  gfm: true,
  breaks: true,
})
marked.use({ extensions: [displayMath, inlineMath] })

/* ----------------------------------------------------------- sanitization ---- */

/** Cache of parsed stable prefixes, keyed by the source text. */
const stableCache = new Map<string, string>()
const STABLE_CACHE_LIMIT = 400

/**
 * CSS properties KaTeX uses for glyph positioning, and nothing else.
 *
 * KaTeX cannot be talked out of inline styles — the whole layout is struts, vlists
 * and hand-computed offsets expressed as `height`/`top`/`vertical-align` in ems.
 * Allowing `style` globally to accommodate that would hand model output a CSS
 * injection surface (a `position: fixed` overlay spoofing app chrome, a
 * `background: url(...)` beacon), so the allowance is narrowed twice over: the
 * element must sit inside a `.katex` subtree *and* every declaration must name a
 * property on this list. `position` is further pinned to the two values KaTeX
 * emits, since `fixed`/`sticky` are the ones that escape the message bubble.
 */
const KATEX_STYLE_PROPERTIES = new Set([
  'border-bottom-width',
  'border-right-width',
  'border-top-width',
  'bottom',
  'color',
  'height',
  'margin-left',
  'margin-right',
  'min-width',
  'padding-left',
  'position',
  'top',
  'vertical-align',
  'width',
])

function filterKatexStyle(value: string): string {
  const kept: string[] = []
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const setting = declaration.slice(colon + 1).trim()

    if (!KATEX_STYLE_PROPERTIES.has(property)) continue
    // No functions, no escapes, no nesting: KaTeX emits plain lengths and colour
    // keywords, so anything with a `(` or a backslash in it did not come from KaTeX.
    if (/[(\\<>@{}]/.test(setting)) continue
    if (property === 'position' && setting !== 'relative' && setting !== 'absolute') continue
    kept.push(`${property}:${setting}`)
  }
  return kept.join(';')
}

// Not `as const`: DOMPurify's Config declares these as mutable string[].
const PURIFY_CONFIG: PurifyConfig = {
  // No embedding elements (framing / plugin surface), no `style` *element* — the
  // `style` attribute is handled by the hook below rather than forbidden outright,
  // because KaTeX's output is unreadable without it.
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['srcset', 'formaction'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Force every anchor to open externally. The main process turns `target=_blank`
 * into a `shell.openExternal` call and denies in-app navigation.
 *
 * The same hook enforces the KaTeX-only `style` allowance described above. It runs
 * after DOMPurify has vetted the attribute set, and the node is already attached in
 * the working tree, so `closest()` sees the real ancestor chain. Note that a model
 * *can* emit a literal `<span class="katex">` to reach the allowance — which is why
 * the property allowlist, not the ancestry check, is the load-bearing half.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }

  if (!(node instanceof Element) || !node.hasAttribute('style')) return
  const filtered = node.closest('.katex') ? filterKatexStyle(node.getAttribute('style') ?? '') : ''
  if (filtered) node.setAttribute('style', filtered)
  else node.removeAttribute('style')
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

/* ------------------------------------------------------------ split-parse ---- */

/**
 * Split into `[settled, inProgress]` at the last blank line.
 *
 * Inside an unterminated fenced code block the whole text is treated as tail: a
 * blank line within a fence isn't a block boundary, and splitting there would parse
 * half a fence and flash a broken code block on screen. A half-arrived `$$…$$`
 * display block has the same problem and gets the same treatment.
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

function hasOpenCodeFence(text: string): boolean {
  return countOccurrences(text, '```') % 2 === 1
}

/**
 * An odd number of `$$` means a display block is still open. Inline `$…$` cannot
 * confuse this — it is a single dollar — and a stray literal `$$` at worst defers
 * the split for a frame or two, which is invisible.
 */
function hasOpenDisplayMath(text: string): boolean {
  return countOccurrences(text, '$$') % 2 === 1
}

/* ------------------------------------------------------- post-render passes -- */

/** Fenced blocks tagged `mermaid` are diagrams, not code; they get their own pass. */
const MERMAID_SELECTOR = 'pre > code.language-mermaid'

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
    if (block.classList.contains('language-mermaid')) continue
    const language = /language-([\w-]+)/.exec(block.className)?.[1]
    try {
      const { value } =
        language && hljs.getLanguage(language)
          ? hljs.highlight(block.textContent ?? '', { language, ignoreIllegals: true })
          : hljs.highlightAuto(block.textContent ?? '')
      // Safe: hljs emits only <span class>, and the source text came from DOMPurify.
      block.innerHTML = value
      block.dataset.highlighted = 'true'
    } catch {
      block.dataset.highlighted = 'true'
    }
  }
}

/**
 * Replace settled ```mermaid blocks with rendered diagrams.
 *
 * Same call site and same discipline as `highlightCodeBlocks` — settled content
 * only, idempotent via a done-marker — with one addition: mermaid is imported
 * dynamically, so the ~1MB grammar/layout bundle stays out of the initial chunk and
 * is only fetched by a session that actually contains a diagram.
 *
 * Until that import resolves (and forever, if it fails or the diagram is invalid)
 * the block stays exactly as markdown rendered it: a `<pre>` showing the escaped
 * diagram source. That is the honest fallback — the reader still gets the content,
 * and a malformed diagram can never produce a thrown render inside a frame.
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR)].filter(
    (block) => !block.closest('[data-mermaid-done]'),
  )
  if (blocks.length === 0) return

  // Claim the blocks before the first `await`. Two overlapping passes over the same
  // subtree (a re-render landing mid-import) would otherwise both render, and the
  // second would replace a diagram that was already on screen.
  const pre = blocks.map((block) => block.parentElement).filter((node) => node !== null)
  for (const node of pre) node.dataset.mermaidDone = 'pending'

  let render: MermaidRenderer
  try {
    render = await loadMermaid()
  } catch {
    // Import or init failed: hand the blocks back so a later pass can retry, and
    // leave the escaped source on screen in the meantime.
    for (const node of pre) delete node.dataset.mermaidDone
    return
  }

  for (const node of pre) {
    const source = node.textContent ?? ''
    const svg = await render(source)
    node.dataset.mermaidDone = 'true'
    if (!svg) continue

    const figure = document.createElement('div')
    figure.className = 'mermaid-diagram'
    figure.dataset.mermaidDone = 'true'
    figure.innerHTML = svg
    node.replaceWith(figure)
  }
}

type MermaidRenderer = (source: string) => Promise<string | null>

let mermaidLoader: Promise<MermaidRenderer> | null = null

function loadMermaid(): Promise<MermaidRenderer> {
  mermaidLoader ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // Strict is the point: diagram source is model-authored. It disables
      // click-handler directives, and — this is the part the code below relies on —
      // makes mermaid run its own DOMPurify pass over the SVG it returns, with a
      // config tuned to its own output. That is why `renderMermaidBlocks` inserts
      // the SVG directly instead of re-sanitizing: our markdown config would strip
      // the inline styles mermaid colours nodes with and leave a grey diagram, and
      // writing a second bespoke config would just be a worse copy of mermaid's.
      securityLevel: 'strict',
      // SVG `<text>` labels instead of `<foreignObject>` HTML. Slightly worse
      // wrapping, but it means the rendered diagram contains no HTML subtree at all.
      htmlLabels: false,
      theme: 'base',
      themeVariables: mermaidTheme(),
      fontFamily: readVariable('--font-body') || 'sans-serif',
    })

    let sequence = 0
    return async (source: string) => {
      const id = `mermaid-${(sequence += 1)}`
      try {
        // `parse` first so a syntax error is a returned false rather than a throw
        // from deep inside the renderer, which can leave orphan nodes on <body>.
        if ((await mermaid.parse(source, { suppressErrors: true })) === false) return null
        const { svg } = await mermaid.render(id, source)
        return svg
      } catch {
        return null
      }
    }
  })
  return mermaidLoader
}

/**
 * Map the live colorway onto mermaid's base theme.
 *
 * Read through `getComputedStyle` rather than hardcoded, so a diagram matches
 * whichever palette is active when it renders.
 *
 * KNOWN GAP: diagrams do not re-theme when the colorway changes. Mermaid bakes
 * colours into the SVG at render time and `initialize` is once-per-process, so
 * switching colorways leaves already-rendered diagrams on the old palette until the
 * session is reopened. Fixing it means tearing down and re-rendering every diagram
 * on a theme event; not worth the complexity until someone notices.
 */
function mermaidTheme(): Record<string, string> {
  const background = readColor('--code-bg')
  const text = readColor('--text')
  const line = readColor('--line-strong')
  const accent = readColor('--accent')

  return {
    background,
    primaryColor: background,
    primaryTextColor: text,
    primaryBorderColor: line,
    secondaryColor: readColor('--surface'),
    tertiaryColor: readColor('--raised'),
    lineColor: line,
    textColor: text,
    mainBkg: background,
    nodeBorder: line,
    clusterBkg: readColor('--surface'),
    clusterBorder: line,
    titleColor: text,
    edgeLabelBackground: background,
    actorBorder: accent,
    noteBkgColor: readColor('--raised'),
    noteTextColor: text,
  }
}

function readVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** One reused 1x1 scratch canvas for `readColor`. */
let colorProbe: CanvasRenderingContext2D | null | undefined

/**
 * Resolve a CSS variable to `#rrggbb`.
 *
 * The palette is authored in `oklch()`, and mermaid's colour maths (khroma) cannot
 * parse it — passing the raw value through throws "Unsupported color format" from
 * inside `Theme.calculate`, which is a failed render rather than an off-colour one.
 *
 * So the browser does the conversion: fill one pixel and read the bytes back. Note
 * that reading `ctx.fillStyle` after assignment is *not* enough — Chrome round-trips
 * `oklch()` as `oklch()`, so the "normalise by assignment" trick silently returns the
 * input. Sampling the rasterised pixel is what actually forces the colour into sRGB,
 * and it keeps working for whatever syntax the palette adopts next.
 */
function readColor(name: string): string {
  const value = readVariable(name)
  if (!value) return '#888888'

  if (colorProbe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    colorProbe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!colorProbe) return value

  try {
    colorProbe.clearRect(0, 0, 1, 1)
    colorProbe.fillStyle = value
    colorProbe.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0] = colorProbe.getImageData(0, 0, 1, 1).data
    return '#' + [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')
  } catch {
    return value
  }
}
