import { useEffect, useRef } from 'react'

/**
 * Scroll sync for split view: two panes, one fraction.
 *
 * ## Proportional, and that is a choice
 *
 * The precise version of this would map source lines to rendered block offsets and
 * scroll to the *corresponding* position — so a code fence that is 8 lines of source
 * and 8 lines of output stays put, while a 2-line image reference that renders 400px
 * tall does not. That mapping has to be recomputed on every resize, every diagram
 * that finishes rendering asynchronously, and every font load, and when it is even
 * slightly stale it produces a pane that jitters as you scroll.
 *
 * So this syncs by **fraction scrolled**: at 30% down the source, the preview sits
 * at 30% down the preview. Exactly right at the top and bottom, approximate in
 * between, drifting most in documents with tall rendered elements. Worth having,
 * because it never jitters and never goes stale. For precision, click a comment
 * marker — that reveals the matching region in the other pane exactly.
 *
 * ## The echo guard
 *
 * Setting `scrollTop` on the other pane fires its own scroll event, which would set
 * this one back, and the two would fight over rounding for several frames. A shared
 * "one of us is driving" flag, cleared on the next frame, breaks the loop.
 */
export function useSplitSync(enabled: boolean) {
  const sourceRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const driving = useRef(false)

  useEffect(() => {
    const source = sourceRef.current
    const preview = previewRef.current
    if (!enabled || !source || !preview) return

    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (driving.current) return
      const room = from.scrollHeight - from.clientHeight
      if (room <= 0) return
      driving.current = true
      to.scrollTop = (from.scrollTop / room) * (to.scrollHeight - to.clientHeight)
      requestAnimationFrame(() => {
        driving.current = false
      })
    }

    const onSource = follow(source, preview)
    const onPreview = follow(preview, source)
    source.addEventListener('scroll', onSource, { passive: true })
    preview.addEventListener('scroll', onPreview, { passive: true })
    return () => {
      source.removeEventListener('scroll', onSource)
      preview.removeEventListener('scroll', onPreview)
    }
  }, [enabled])

  return { sourceRef, previewRef }
}

/**
 * "Show me this line in the other column."
 *
 * A line plus a nonce, not just a line: clicking the same comment twice is a real
 * request both times, and a bare line number wouldn't change, so nothing would move
 * the second time.
 */
export type Reveal = { line: number; nonce: number } | null

/** How long a revealed row or block wears the accent wash before going quiet. */
export const REVEAL_MS = 900

/**
 * A ref for the one element currently being revealed, which scrolls itself into
 * view when it becomes so.
 *
 * The element brings itself into view rather than an ancestor hunting for it by
 * selector: a component holding a ref to its own DOM node is the ordinary React
 * arrangement, and it means the row and the block need nothing in common but this
 * hook. `revealed` is false for every other row, so a memoized row's props are
 * unchanged and it doesn't re-render.
 */
export function useRevealedRef<T extends HTMLElement>(revealed: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (revealed) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [revealed])
  return ref
}
