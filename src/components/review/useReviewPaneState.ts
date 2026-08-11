import { useCallback, useEffect, useRef, useState } from 'react'
import { excerptFrom } from '@/stores/reviewStore'
import { isMarkdownPath } from './markdownBlocks'
import { REVEAL_MS, type Reveal } from './useSplitSync'
import type { ReviewViewMode } from './ViewModeToggle'

/** Below this, two columns stop being two readable things. */
const SPLIT_MIN_WIDTH = 700

/**
 * All the state the review pane's columns share, and the rules that govern it.
 *
 * Lifted out of the component because none of it is layout: view mode, comment
 * visibility, per-line collapse and the cross-column reveal are the pane's model,
 * and both columns read from it. Keeping it here leaves `ReviewCodePane` as the
 * thing it should be — a switch between three arrangements of two components.
 */
export function useReviewPaneState({
  path,
  content,
  hasUnresolvedComments,
  onAddComment,
}: {
  path: string
  content: string
  hasUnresolvedComments: boolean
  onAddComment: (input: {
    startLine: number
    endLine: number
    excerpt: string
    text: string
  }) => void
}) {
  /*
   * How this file is being read, when it can be read two ways.
   *
   * Markdown is the one kind of file in a review set with a second true form: the
   * source you comment on, and the document that source is *for*. Everything else
   * has one, so the toggle exists only for `.md`/`.mdx`/`.markdown`.
   *
   * The default is Source, deliberately: review is about reading what *changed*, and
   * the changed lines are marked in the source. Preview is one click away for when
   * the question is "does this document read right".
   *
   * Pane-local, because the pane remounts per file (see `ReviewView`), so the mode
   * resets as you walk through the set file by file.
   */
  const [viewMode, setViewMode] = useState<ReviewViewMode>('source')

  /*
   * The preview's composer is its own state, not the source's selection.
   *
   * Sharing one would look tidier and be wrong in split view: opening a composer on
   * a preview block would open a second textarea on the same lines in the source
   * column — two carets for one note. Separate, each column composes where you
   * clicked and the other one doesn't move.
   */
  const [composing, setComposing] = useState<{ startLine: number; endLine: number } | null>(null)

  /*
   * The global show/hide, and the per-line overrides it doesn't erase.
   *
   * `commentsVisible` is the master switch: off, no comment rows render anywhere in
   * the pane, though the markers stay so you know they exist. On, every line with
   * comments defaults to expanded — `collapsed` only records the lines a click has
   * *removed* from that default, so a line you collapsed stays collapsed if you flip
   * the master switch off and back on, but nothing needs an entry just to be shown.
   *
   * Collapse is keyed by the comment's own line whichever column the click came
   * from: source toggles one line, preview toggles every line its block's comments
   * are anchored to. That shared key is what lets the two views agree.
   */
  const [commentsVisible, setCommentsVisible] = useState(hasUnresolvedComments)
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())

  const setLinesCollapsed = useCallback((lines: number[], next: boolean) => {
    setCollapsed((current) => {
      const updated = new Set(current)
      for (const line of lines) {
        if (next) updated.add(line)
        else updated.delete(line)
      }
      return updated
    })
  }, [])

  /*
   * Split needs room, and a review pane can sit in a narrow mosaic tile.
   *
   * The toggle keeps all three options at any width — the mode is a preference, not
   * a capability — and a too-narrow pane simply shows the source half of it, so
   * widening restores what you picked without you having to pick it again.
   */
  const [narrow, setNarrow] = useState(false)
  const observer = useRef<ResizeObserver | null>(null)

  /*
   * A callback ref, not a `useRef` plus an effect. The pane renders "Reading…"
   * before it renders the file, and those states don't carry the frame — so an
   * effect that ran once on mount looked at a ref that was still null and never
   * observed anything, leaving `narrow` permanently false. A callback ref runs
   * whenever the node actually attaches or detaches, which is the event that
   * matters here.
   */
  const frameRef = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < SPLIT_MIN_WIDTH)
    })
    observer.current.observe(node)
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  const isMarkdown = isMarkdownPath(path)
  const mode: ReviewViewMode =
    !isMarkdown || (viewMode === 'split' && narrow) ? 'source' : viewMode

  /*
   * "Show me this in the other column", one direction at a time.
   *
   * Cleared on a timer rather than left standing: the wash answers a question you
   * just asked, and a highlight that never fades becomes a second selection state
   * competing with the real one.
   */
  const [revealInSource, setRevealInSource] = useState<Reveal>(null)
  const [revealInPreview, setRevealInPreview] = useState<Reveal>(null)

  useEffect(() => {
    if (!revealInSource && !revealInPreview) return
    const timer = setTimeout(() => {
      setRevealInSource(null)
      setRevealInPreview(null)
    }, REVEAL_MS)
    return () => clearTimeout(timer)
  }, [revealInSource, revealInPreview])

  const nonce = useRef(0)
  const revealSource = useCallback((line: number) => {
    setRevealInSource({ line, nonce: ++nonce.current })
  }, [])
  const revealPreview = useCallback((line: number) => {
    setRevealInPreview({ line, nonce: ++nonce.current })
  }, [])

  /*
   * Writing a comment, from either column.
   *
   * The excerpt is always taken from the *source* line the range starts at, even
   * when the comment was written against a rendered paragraph: it exists so the note
   * can be recognised later, in the orphan list and in the message sent to the
   * agent, both of which talk about the file on disk. `## Heading` is a better
   * reminder of which paragraph you meant than the words it rendered to.
   */
  const addComment = useCallback(
    ({ startLine, endLine, text }: { startLine: number; endLine: number; text: string }) => {
      onAddComment({
        startLine,
        endLine,
        excerpt: excerptFrom(content.split('\n')[startLine - 1]),
        text,
      })
      /*
       * Writing a comment is the strongest possible signal you want to see
       * comments. Without this, a file whose first comment you just wrote
       * (visibility initialized false) swallowed it on submit — written, saved and
       * instantly invisible.
       */
      setCommentsVisible(true)
      setLinesCollapsed([endLine], false)
      setComposing(null)
    },
    [content, onAddComment, setLinesCollapsed],
  )

  return {
    frameRef,
    isMarkdown,
    mode,
    viewMode,
    setViewMode,
    composing,
    setComposing,
    commentsVisible,
    toggleCommentsVisible: () => setCommentsVisible((visible) => !visible),
    collapsed,
    setLinesCollapsed,
    addComment,
    revealInSource,
    revealInPreview,
    revealSource,
    revealPreview,
  }
}
