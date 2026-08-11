import { memo, useEffect, useMemo, useRef } from 'react'
import {
  highlightCodeBlocks,
  renderMarkdown,
  renderMermaidBlocks,
  renderStable,
  splitStream,
} from '@/lib/markdown'
import { useIsStreaming, useStreamedText } from '@/hooks/useStreamedText'
import { cn } from '@/lib/utils'

/**
 * Renders one streaming markdown block.
 *
 * This is the only component in the app that re-renders at frame rate, and it
 * renders as little as possible while doing so:
 *
 *  1. `useStreamedText` subscribes to *this block's* buffer, so a tick re-renders
 *     this leaf and nothing else.
 *  2. `splitStream` divides the revealed text into a settled prefix and the
 *     in-progress tail. Only the tail is re-parsed per frame; the prefix is parsed
 *     once and memoized (twice over — `useMemo` here, plus the module-level cache
 *     in `renderStable`, which survives unmounts).
 *  3. Syntax highlighting and mermaid rendering run only on the settled half.
 *     Re-tokenizing a code block that is still being typed costs frame budget for a
 *     result that is about to change anyway, and laying out a diagram from a
 *     half-written definition is that same waste with a layout engine attached.
 *     Math is the exception: KaTeX is cheap and synchronous, so it runs inside the
 *     ordinary parse and appears in the tail as it is typed.
 *
 * The net effect: per-frame cost tracks the length of the current paragraph rather
 * than the length of the whole message, so a long answer streams as smoothly at the
 * end as it did at the start.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  blockId,
  className,
}: {
  blockId: string
  className?: string
}) {
  const text = useStreamedText(blockId)
  const isStreaming = useIsStreaming(blockId)
  const stableRef = useRef<HTMLDivElement>(null)

  const [stable, tail] = useMemo(() => splitStream(text), [text])
  const stableHtml = useMemo(() => renderStable(stable), [stable])
  const tailHtml = useMemo(() => renderMarkdown(tail), [tail])

  /*
   * The `dangerouslySetInnerHTML` value must be REFERENTIALLY stable, not just
   * string-equal. React 19 decides whether to rewrite innerHTML by comparing
   * the prop OBJECT, and `{ __html: x }` inlined in JSX is a new object every
   * render — so every tail-only frame re-set the stable div's innerHTML with
   * the same string, silently destroying what highlightCodeBlocks and
   * renderMermaidBlocks had written into that subtree. The enrich effect never
   * re-ran (its dep, the string, hadn't changed), so settled code blocks ended
   * the stream unhighlighted and diagrams never survived. Memoizing the object
   * on the string restores the invariant the whole enrichment pass rests on:
   * React does not touch the stable subtree unless its content actually grew.
   */
  const stableProp = useMemo(() => ({ __html: stableHtml }), [stableHtml])
  const tailProp = useMemo(() => ({ __html: tailHtml }), [tailHtml])

  // Enrich only when the settled prefix grows — never on tail changes. Both passes
  // are idempotent and skip nodes they have already handled, so the repeat call on
  // each prefix growth only touches the newly settled blocks.
  useEffect(() => {
    const root = stableRef.current
    if (!root || !stableHtml) return
    highlightCodeBlocks(root)
    // Fire-and-forget: mermaid is dynamically imported and renders asynchronously.
    // Nothing downstream waits on the diagram, and a failure leaves the escaped
    // source on screen, so there is no rejection worth surfacing.
    void renderMermaidBlocks(root)
  }, [stableHtml])

  // No caret. It was an inline bar appended after the tail's rendered markdown,
  // and since markdown renders block elements it never sat at the end of the
  // text — it dropped onto its own line below the prose and blinked there,
  // detached. Liveness belongs to the activity mark at the transcript tail;
  // the words themselves just appear.
  if (!text) return null

  return (
    <div
      className={cn('prose-stream', className)}
      data-selectable
      // Announce the finished message rather than every token: a polite live region
      // that updates 60x/second would make a screen reader unusable.
      aria-live={isStreaming ? 'off' : 'polite'}
    >
      {stableHtml ? (
        <div ref={stableRef} dangerouslySetInnerHTML={stableProp} />
      ) : null}
      {tailHtml ? (
        <div className="inline [&>*:first-child]:mt-0" dangerouslySetInnerHTML={tailProp} />
      ) : null}
    </div>
  )
})
