import { memo, useEffect, useMemo, useRef } from 'react'
import { highlightCodeBlocks, renderMarkdown, renderStable, splitStream } from '@/lib/markdown'
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
 *  3. Syntax highlighting runs only on the settled half. Re-tokenizing a code block
 *     that is still being typed costs frame budget for a result that is about to
 *     change anyway.
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

  // Highlight only when the settled prefix grows — never on tail changes.
  useEffect(() => {
    if (stableRef.current && stableHtml) highlightCodeBlocks(stableRef.current)
  }, [stableHtml])

  if (!text) {
    return isStreaming ? <span className="stream-caret" aria-hidden /> : null
  }

  return (
    <div
      className={cn('prose-stream', className)}
      data-selectable
      // Announce the finished message rather than every token: a polite live region
      // that updates 60x/second would make a screen reader unusable.
      aria-live={isStreaming ? 'off' : 'polite'}
    >
      {stableHtml ? (
        <div ref={stableRef} dangerouslySetInnerHTML={{ __html: stableHtml }} />
      ) : null}
      {tailHtml ? (
        <div className="inline [&>*:first-child]:mt-0" dangerouslySetInnerHTML={{ __html: tailHtml }} />
      ) : null}
      {isStreaming ? <span className="stream-caret" aria-hidden /> : null}
    </div>
  )
})
