import { memo, useState } from 'react'
import { ArrowDown, ChevronRight, PenLine } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import type { Lane, TranscriptItem } from '@/types/session'
import { useStickyScroll } from '@/hooks/useStickyScroll'
import { ActivityIndicator, isBusyStatus } from './ActivityIndicator'
import { ErrorRow } from './ErrorRow'
import { Mark } from './Mark'
import { StreamingMarkdown } from './StreamingMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/**
 * The scrolling conversation for one lane.
 *
 * ## Why there's a rail
 *
 * This used to be a centred column: `mx-auto` on a `measure + 8rem` box. In a
 * full-width panel that leaves a wide empty margin on *both* sides — the content
 * floating in the middle of a window with nothing holding it — and the wider the
 * panel, the more of it is nothing.
 *
 * Now every row is `[rail | content]`. The rail is a narrow left column carrying
 * one glyph per row: the mark for the agent, a pen for you, a chevron for tools.
 * That does three things at once — it anchors the text to the left edge instead of
 * floating it, it gives the conversation a spine you can scan without reading, and
 * it turns the leftmost strip from empty margin into structure.
 *
 * ## Where the measure applies now
 *
 * To the *paragraphs*, not the container (see `.prose-stream` in index.css). Prose
 * still wraps at a comfortable line length, but code blocks and tables — the things
 * that genuinely want room — use the full panel. Capping the container punished
 * them for a rule that only exists for running text.
 *
 * ## Hierarchy
 *
 *   1. Agent prose — full-contrast text. The content.
 *   2. Your turns — a warm tinted note. A landmark for scanning, not something to
 *      re-read.
 *   3. Tool calls and thinking — faint, collapsed, in the rail's language.
 */
export function Transcript({
  lane,
  status,
  showActivity,
  onOpenLane,
  onRetry,
}: {
  lane: Lane
  status: SessionStatus
  /** Only the lane that owns the turn shows it — not every subagent tab at once. */
  showActivity: boolean
  onOpenLane: (id: string) => void
  onRetry: (itemId: string, text: string) => void
}) {
  const { ref, isPinned, scrollToBottom } = useStickyScroll()

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto overflow-x-hidden">
        {/*
          Left-aligned and full width. Gutters still track the panel's own size —
          a one-eighth panel can't afford 32px — but nothing is centred any more.
        */}
        <div className="flex w-full flex-col px-3 py-4 @[30rem]:px-5 @[30rem]:py-6 @[48rem]:px-7 @[48rem]:py-7">
          {lane.items.length === 0 && !showActivity ? <EmptyLane /> : null}
          {lane.items.map((item) => (
            <TranscriptRow key={item.id} item={item} onOpenLane={onOpenLane} onRetry={onRetry} />
          ))}

          {/*
            Activity at the tail of the conversation, in the rail, where the next
            answer will appear. After pressing Enter the eye is here — a header-only
            indicator means the one place you're looking is the one place nothing
            happens.
          */}
          {showActivity && isBusyStatus(status) ? (
            <Row glyph={<Mark state={markStateFor(status)} size={18} className="text-accent" />}>
              <div className="flex h-6 items-center">
                <ActivityIndicator status={status} />
              </div>
            </Row>
          ) : null}

          {/* Room so the last line never sits against the composer. */}
          <div className="h-6" aria-hidden />
        </div>
      </div>

      {!isPinned ? (
        <Button
          variant="subtle"
          size="md"
          onClick={() => scrollToBottom('smooth')}
          className="hand-sm-1 absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
        >
          <ArrowDown size={14} />
          Jump to latest
        </Button>
      ) : null}
    </div>
  )
}

function markStateFor(status: SessionStatus): 'thinking' | 'working' | 'writing' {
  if (status === 'streaming') return 'writing'
  if (status === 'tool') return 'working'
  return 'thinking'
}

/**
 * One row of the conversation: a glyph in the rail, content beside it.
 *
 * The rail narrows on small panels but never disappears — losing it would take the
 * conversation's spine away exactly where the text is hardest to parse.
 */
function Row({
  glyph,
  children,
  className,
}: {
  glyph?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex w-full gap-2 @[30rem]:gap-3', className)}>
      <div
        className="flex w-5 shrink-0 justify-center pt-0.5 @[30rem]:w-7"
        aria-hidden={glyph ? undefined : true}
      >
        {glyph}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const TranscriptRow = memo(function TranscriptRow({
  item,
  onOpenLane,
  onRetry,
}: {
  item: TranscriptItem
  onOpenLane: (id: string) => void
  onRetry: (itemId: string, text: string) => void
}) {
  switch (item.kind) {
    case 'user':
      return <UserTurn text={item.text} />

    case 'text':
      return (
        <Row
          glyph={<Mark state="idle" size={18} className="text-accent/60" />}
          className="mt-3 mb-1"
        >
          <StreamingMarkdown blockId={item.blockId} />
        </Row>
      )

    case 'thinking':
      return <ThinkingBlock blockId={item.blockId} />

    case 'tool':
      return (
        <Row>
          <ToolCallCard item={item} onOpenLane={onOpenLane} />
        </Row>
      )

    case 'error':
      return (
        <Row>
          <ErrorRow item={item} onRetry={onRetry} />
        </Row>
      )
  }
})

/**
 * A user turn: a warm note in the flow, not a bubble pinned to the right.
 *
 * Right-aligned bubbles are a messaging-app convention that costs the left half of
 * the row to say something the rail already says. Aligned left with everything
 * else, the conversation reads as one column of writing.
 */
function UserTurn({ text }: { text: string }) {
  return (
    <Row
      glyph={<PenLine size={15} className="text-accent/70" />}
      className="mt-6 mb-2 first:mt-0"
    >
      <div
        className="hand-1 max-w-[68ch] whitespace-pre-wrap bg-accent-wash px-3.5 py-2.5
                   text-[0.95rem] leading-relaxed text-text"
        data-selectable
      >
        {text}
      </div>
    </Row>
  )
}

/**
 * Extended thinking, collapsed. The faintest tier — available on demand, invisible
 * otherwise.
 */
function ThinkingBlock({ blockId }: { blockId: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Row>
      <div className="my-0.5">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="hand-sm-1 -mx-1 flex items-center gap-1.5 px-1 py-1 text-xs italic
                     text-text-faint transition-colors hover:text-text-muted"
          aria-expanded={expanded}
        >
          <ChevronRight
            size={13}
            className={cn('transition-transform duration-150', expanded && 'rotate-90')}
          />
          thinking
        </button>
        {expanded ? (
          <div className="mt-1 border-l-2 border-line pl-4 text-text-muted">
            <StreamingMarkdown blockId={blockId} className="text-[0.92em] italic" />
          </div>
        ) : null}
      </div>
    </Row>
  )
}

function EmptyLane() {
  return (
    <p className="py-10 text-center font-display text-base text-text-faint @[30rem]:py-16">
      Nothing here yet — say something.
    </p>
  )
}
