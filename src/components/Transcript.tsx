import { memo, useState } from 'react'
import { ArrowDown, Brain, ChevronRight } from 'lucide-react'
import type { Lane, TranscriptItem } from '@/types/session'
import { useStickyScroll } from '@/hooks/useStickyScroll'
import { StreamingMarkdown } from './StreamingMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/**
 * The scrolling conversation for one lane.
 *
 * ## Hierarchy
 *
 * Three tiers, most to least important:
 *
 *   1. Assistant prose — full-contrast text at the reading measure. The content.
 *   2. User turns — a quiet raised bubble. You wrote it, so you don't need to
 *      re-read it; it's a landmark for scanning, not something to emphasize.
 *   3. Tool calls and thinking — faint, borderless, collapsed.
 *
 * The old version inverted this: user bubbles and tool cards both had borders and
 * fills while the assistant text had none, so the least important things carried
 * the most visual weight.
 *
 * Spacing does the grouping (Gestalt proximity) rather than boxes: turns are
 * separated by 24px, items within a turn by 4–8px.
 */
export function Transcript({ lane, onOpenLane }: { lane: Lane; onOpenLane: (id: string) => void }) {
  const { ref, isPinned, scrollToBottom } = useStickyScroll()

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto overflow-x-hidden">
        {/*
          Padding tracks the panel's own width, not the window's — 32px of gutter is
          generous in a full-width panel and eats a one-eighth panel alive. The
          breakpoints match the composer's exactly, so the input shell lines up under
          the prose at every density.

          The narrow floor is 12px because rows that bleed (tool calls, hover fills)
          use `-mx-3`; anything tighter and they'd overhang the scroll container.
        */}
        <div
          className="mx-auto flex w-full max-w-[calc(var(--measure)+8rem)] flex-col
                     px-3 py-4 @[30rem]:px-5 @[30rem]:py-6 @[48rem]:px-8 @[48rem]:py-8"
        >
          {lane.items.length === 0 ? <EmptyLane /> : null}
          {lane.items.map((item) => (
            <TranscriptRow key={item.id} item={item} onOpenLane={onOpenLane} />
          ))}
          {/* Room so the last line never sits against the composer. */}
          <div className="h-6" aria-hidden />
        </div>
      </div>

      {!isPinned ? (
        <Button
          variant="subtle"
          size="md"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
        >
          <ArrowDown size={14} />
          Jump to latest
        </Button>
      ) : null}
    </div>
  )
}

const TranscriptRow = memo(function TranscriptRow({
  item,
  onOpenLane,
}: {
  item: TranscriptItem
  onOpenLane: (id: string) => void
}) {
  switch (item.kind) {
    case 'user':
      return <UserTurn text={item.text} />
    case 'text':
      return (
        <div className="py-2">
          <StreamingMarkdown blockId={item.blockId} />
        </div>
      )
    case 'thinking':
      return <ThinkingBlock blockId={item.blockId} />
    case 'tool':
      return <ToolCallCard item={item} onOpenLane={onOpenLane} />
  }
})

/**
 * A user turn. Distinguished by fill and alignment, not by a border — the fill
 * alone is enough to mark it as "yours" without competing with the answer.
 */
function UserTurn({ text }: { text: string }) {
  return (
    <div className="mt-6 mb-2 flex justify-end first:mt-0">
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-raised px-4 py-3
                   text-[0.95rem] text-text-muted"
        data-selectable
      >
        {text}
      </div>
    </div>
  )
}

/**
 * Extended thinking, collapsed. The faintest tier in the transcript — available
 * on demand, invisible otherwise.
 */
function ThinkingBlock({ blockId }: { blockId: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="-mx-1 flex items-center gap-2 rounded-sm px-1 py-1 text-xs text-text-faint
                   transition-colors hover:text-text-muted"
        aria-expanded={expanded}
      >
        <ChevronRight
          size={13}
          className={cn('transition-transform duration-150', expanded && 'rotate-90')}
        />
        <Brain size={13} />
        Thinking
      </button>
      {expanded ? (
        <div className="mt-1 border-l-2 border-line pl-4 text-text-muted">
          <StreamingMarkdown blockId={blockId} className="text-[0.92em]" />
        </div>
      ) : null}
    </div>
  )
}

function EmptyLane() {
  return (
    <p className="py-10 text-center text-sm text-text-faint @[30rem]:py-20">
      Nothing here yet — send a message to get started.
    </p>
  )
}
