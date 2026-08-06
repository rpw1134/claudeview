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
 * Now the agent's side is `[rail | content]`: a narrow left column carrying the
 * mark, with prose, tools and thinking hanging off it. That anchors the text to the
 * left edge instead of floating it, gives the conversation a spine you can scan
 * without reading, and turns the leftmost strip from empty margin into structure.
 *
 * Your turns sit on the **right**, mirrored — side is what tells you who said what
 * at a glance, and it's the cue that survives scrolling fast. The bubbles cross the
 * centreline rather than stopping at it: a hard 50% channel down the middle turns a
 * long message into a ribbon.
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
 *   1. Agent prose — full-contrast text on the left. The content.
 *   2. Your turns — a warm tinted note on the right. A landmark for scanning, not
 *      something to re-read.
 *   3. Tool calls and thinking — faint, collapsed, on the agent's side.
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
 * A user turn: right-aligned, the way a conversation reads.
 *
 * Side carries authorship. Everything the agent produces — prose, tools, thinking,
 * errors — hangs off the left rail; your turns sit opposite. That's the one cue
 * that survives scrolling fast, and it's why chat threads have used it forever.
 *
 * `max-w-[78%]` deliberately crosses the centreline: bubbles capped at half the
 * width leave a hard channel down the middle and make a long message a narrow
 * ribbon. Overlapping keeps the alignment legible while letting either side use
 * the room when it needs it.
 */
function UserTurn({ text }: { text: string }) {
  return (
    <div className="mt-6 mb-2 flex justify-end gap-2 first:mt-0">
      <div
        className="hand-1 max-w-[78%] whitespace-pre-wrap bg-accent-wash px-3.5 py-2.5
                   text-[0.95rem] leading-relaxed text-text"
        data-selectable
      >
        {text}
      </div>
      {/* Mirrors the agent's rail on the far side, so the two turn types are
          symmetric rather than one having a gutter and the other not. */}
      <div className="flex w-5 shrink-0 justify-center pt-1.5 @[30rem]:w-7" aria-hidden>
        <PenLine size={14} className="text-accent/60" />
      </div>
    </div>
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
    <p className="py-10 text-center text-sm text-text-faint @[30rem]:py-16">
      Nothing here yet — say something.
    </p>
  )
}
