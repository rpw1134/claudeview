import { useCallback, useEffect, useRef, useState } from 'react'

/** Distance from the bottom, in px, still treated as "at the bottom". */
const STICK_THRESHOLD = 64

type StickyScroll = {
  ref: React.RefObject<HTMLDivElement | null>
  /** False once the user scrolls up — surface a "jump to latest" affordance. */
  isPinned: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

/**
 * Keeps a scroll container pinned to the bottom while content streams in, and
 * *stops* doing so the moment the user scrolls away.
 *
 * The second half is the part that's easy to get wrong. Naively calling
 * `scrollTop = scrollHeight` on every update yanks the viewport back down while the
 * user is trying to read earlier output — the single most irritating bug in
 * streaming UIs. Here, `isPinned` latches false on any upward scroll and only
 * re-latches when the user returns to the bottom themselves.
 *
 * A `ResizeObserver` on the content (rather than a scroll listener alone) is what
 * catches growth from streamed text, which changes height without any scroll event.
 */
export function useStickyScroll(): StickyScroll {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isPinned, setIsPinned] = useState(true)
  // Mirrors `isPinned` for use inside observers without re-subscribing on change.
  const pinnedRef = useRef(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = ref.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
    pinnedRef.current = true
    setIsPinned(true)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight
      const pinned = distance <= STICK_THRESHOLD
      if (pinned !== pinnedRef.current) {
        pinnedRef.current = pinned
        setIsPinned(pinned)
      }
    }

    // `passive` — this listener never calls preventDefault, and saying so lets the
    // compositor scroll without waiting on JS.
    element.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) element.scrollTop = element.scrollHeight
    })
    // Observe the content wrapper: the container's own box doesn't change size.
    const content = element.firstElementChild
    if (content) observer.observe(content)

    return () => {
      element.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  return { ref, isPinned, scrollToBottom }
}
