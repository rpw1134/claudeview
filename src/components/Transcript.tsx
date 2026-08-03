import { memo, useState } from 'react'
import { ArrowDown, Brain, ChevronRight } from 'lucide-react'
import type { Lane, TranscriptItem } from '@/types/session'
import { useStickyScroll } from '@/hooks/useStickyScroll'
import { StreamingMarkdown } from './StreamingMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/**
 * The scrolling conversation view for one lane.
 *
 * Every item is keyed by a stable id and rendered through a memoized component, so
 * a frame tick on the streaming block cannot re-render the history above it. That
 * is what keeps a 500-message transcript as smooth as an empty one.
 */
export function Transcript({ lane, onOpenLane }: { lane: Lane; onOpenLane: (id: string) => void }) {
  const { ref, isPinned, scrollToBottom } = useStickyScroll()

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-[calc(var(--measure)+8rem)] flex-col gap-1 px-6 py-6">
          {lane.items.length === 0 ? <EmptyLane /> : null}
          {lane.items.map((item) => (
            <TranscriptRow key={item.id} item={item} onOpenLane={onOpenLane} />
          ))}
          {/* Breathing room so the last line never sits against the composer. */}
          <div className="h-6" aria-hidden />
        </div>
      </div>

      {!isPinned ? (
        <Button
          variant="subtle"
          size="sm"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
        >
          <ArrowDown size={13} />
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
        <div className="py-1.5">
          <StreamingMarkdown blockId={item.blockId} />
        </div>
      )
    case 'thinking':
      return <ThinkingBlock blockId={item.blockId} />
    case 'tool':
      return <ToolCallCard item={item} onOpenLane={onOpenLane} />
  }
})

function UserTurn({ text }: { text: string }) {
  return (
    <div className="my-3 flex justify-end">
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-border
                   bg-surface-raised px-3.5 py-2 text-sm text-text"
        data-selectable
      >
        {text}
      </div>
    </div>
  )
}

/**
 * Extended thinking, collapsed by default.
 *
 * Reasoning is useful on demand and noise the rest of the time — inlining it at full
 * length would bury the actual answer. Collapsed keeps it one click away.
 */
function ThinkingBlock({ blockId }: { blockId: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-1.5">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-text-faint
                   transition-colors hover:text-text-muted"
        aria-expanded={expanded}
      >
        <ChevronRight
          size={12}
          className={cn('transition-transform duration-150', expanded && 'rotate-90')}
        />
        <Brain size={12} />
        Thinking
      </button>
      {expanded ? (
        <div className="mt-1 border-l-2 border-border pl-3 opacity-75">
          <StreamingMarkdown blockId={blockId} className="text-[0.94em]" />
        </div>
      ) : null}
    </div>
  )
}

function EmptyLane() {
  return (
    <div className="py-20 text-center text-sm text-text-faint">
      Nothing here yet — send a message to get started.
    </div>
  )
}
