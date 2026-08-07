import { memo, useState } from 'react'
import { ArrowDown, ChevronRight } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import type { Lane, TranscriptItem } from '@/types/session'
import { useStickyScroll } from '@/hooks/useStickyScroll'
import { useIsStreaming } from '@/hooks/useStreamedText'
import { ActivityIndicator, formatElapsed, isBusyStatus } from './ActivityIndicator'
import { ErrorRow } from './ErrorRow'
import { Mark } from './Mark'
import { StreamingMarkdown } from './StreamingMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

/**
 * The scrolling conversation for one lane.
 *
 * ## The agent gets the whole width
 *
 * Agent output — prose, code, tables, tool rows — runs the full width of the panel.
 * No rail, no indent, no centred column. Everything this app is for is in that
 * output, so it gets the room; anything that insets it is spending the panel's width
 * on decoration.
 *
 * Your turns are the exception: right-aligned, tinted, capped at 78% so they cross
 * the centreline without becoming a ribbon. Side alone carries authorship, which is
 * why the agent needs no marker of its own.
 *
 * ## Separation is vertical
 *
 * With both sides full-bleed, turns are told apart by **space**, not by horizontal
 * offset — a wide margin above and below each of your messages, tighter spacing
 * within a single agent response. Gestalt proximity does the grouping that a rail
 * used to do, without costing any width.
 *
 * ## The mark appears once per turn, not once per block
 *
 * It rides the thinking toggle and the activity line — the two rows that are *about*
 * the agent working rather than about what it said. A mark on every text block put a
 * glyph directly above another glyph whenever a turn had both, saying the same thing
 * twice and indenting the prose to do it.
 */
export function Transcript({
  lane,
  status,
  lastTurn,
  showActivity,
  onOpenLane,
  onRetry,
}: {
  lane: Lane
  status: SessionStatus
  /** How the most recent turn ended; drives the settled footer. */
  lastTurn?: { ok: boolean; durationMs: number }
  /** Only the lane that owns the turn shows it — not every subagent tab at once. */
  showActivity: boolean
  onOpenLane: (id: string) => void
  onRetry: (itemId: string, text: string) => void
}) {
  const { ref, isPinned, scrollToBottom } = useStickyScroll()

  /*
   * The tail is a single slot that RESOLVES rather than a row that appears and
   * vanishes. While a turn runs it holds the activity line; when the turn ends
   * it settles into a quiet "done · 12s" footer that stays until the next send.
   * An unmount here meant completion read as an abrupt absence — the layout
   * snapped up a line and the only sign the turn finished was that nothing was
   * moving any more.
   *
   * One suppression: while the model is reasoning, the *thinking row itself* is
   * the last item and already says "thinking" with a live mark. A tail line
   * repeating the same word directly beneath it said everything twice.
   */
  const lastItem = lane.items[lane.items.length - 1]
  const busy = showActivity && isBusyStatus(status)
  const thinkingRowOwnsTheTail = status === 'thinking' && lastItem?.kind === 'thinking'
  const settled = showActivity && !busy && lastTurn?.ok === true && lane.items.length > 0

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto overflow-x-hidden">
        {/* Gutters still track the panel's own size — a one-eighth panel can't
            afford 28px — but nothing is indented or centred within them. */}
        <div className="flex w-full flex-col px-4 py-5 @[30rem]:px-7 @[30rem]:py-7 @[48rem]:px-10 @[48rem]:py-8">
          {lane.items.length === 0 && !showActivity ? <EmptyLane /> : null}
          {lane.items.map((item) => (
            <TranscriptRow key={item.id} item={item} onOpenLane={onOpenLane} onRetry={onRetry} />
          ))}

          {/*
            Activity at the tail of the conversation, where the next answer will
            appear. After pressing Enter the eye is here — a header-only indicator
            means the one place you're looking is the one place nothing happens.
          */}
          {busy && !thinkingRowOwnsTheTail ? (
            <div className="mt-2 mb-1">
              <ActivityIndicator status={status} />
            </div>
          ) : settled ? (
            <TurnFooter durationMs={lastTurn!.durationMs} />
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
        <div className="py-1">
          <StreamingMarkdown blockId={item.blockId} />
        </div>
      )

    case 'thinking':
      return <ThinkingBlock blockId={item.blockId} />

    case 'tool':
      return <ToolCallCard item={item} onOpenLane={onOpenLane} />

    case 'error':
      return <ErrorRow item={item} onRetry={onRetry} />
  }
})

/**
 * A user turn: right-aligned, separated by space above and below.
 *
 * `max-w-[78%]` deliberately crosses the centreline — bubbles capped at half the
 * width leave a hard channel down the middle and make a long message a narrow
 * ribbon.
 *
 * The margins are the largest in the transcript (32px), and they're the whole
 * separation mechanism now that nothing is indented: your message is the boundary
 * between one agent turn and the next, so the space around it is what makes a long
 * conversation scannable.
 */
function UserTurn({ text }: { text: string }) {
  return (
    <div className="mt-8 mb-5 flex justify-end first:mt-0">
      <div
        className="hand-1 max-w-[78%] whitespace-pre-wrap bg-accent-wash px-3.5 py-2.5
                   text-[0.95rem] leading-relaxed text-text"
        data-selectable
      >
        {text}
      </div>
    </div>
  )
}

/**
 * Extended thinking, collapsed — and the turn's mark.
 *
 * These are one control rather than two stacked rows. The mark used to sit on the
 * text block *below* this toggle, so a turn that thought first showed a chevron and
 * a label, then an asterisk on the next line: two glyphs, one above the other,
 * both saying "the agent is doing something here".
 *
 * The mark belongs here because this is the row about the agent *working*. The
 * answer below it doesn't need a badge; it's the only thing on that side.
 */
function ThinkingBlock({ blockId }: { blockId: string }) {
  const [expanded, setExpanded] = useState(false)
  // Live while thoughts are still arriving: the mark breathes and the row is the
  // turn's indicator (the tail line stands down — see Transcript). Once the
  // thinking ends it settles to the still, faint mark.
  const streaming = useIsStreaming(blockId)

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="hand-sm-1 -mx-1.5 flex items-center gap-2 px-1.5 py-1 text-xs italic
                   text-text-faint transition-colors hover:text-text-muted"
        aria-expanded={expanded}
      >
        <Mark
          state={streaming ? 'thinking' : 'idle'}
          size={15}
          className={cn('shrink-0', streaming ? 'text-accent' : 'text-accent/60')}
        />
        {streaming ? 'thinking…' : 'thinking'}
        <ChevronRight
          size={12}
          className={cn('transition-transform duration-150', expanded && 'rotate-90')}
        />
      </button>
      {expanded ? (
        <div className="mt-1 border-l-2 border-line pl-4 text-text-muted">
          <StreamingMarkdown blockId={blockId} className="text-[0.92em] italic" />
        </div>
      ) : null}
    </div>
  )
}

/**
 * The turn's resting state: the mark gone still, "done", and how long it took.
 *
 * Faint on purpose — this is a full stop, not an announcement. Its job is to be
 * the visible difference between "finished" and "hung": before it existed, both
 * looked like a transcript that had simply stopped moving. It occupies the same
 * slot the activity line did, so completion is a *transition* (accent motion →
 * faint stillness) rather than a layout snap.
 */
function TurnFooter({ durationMs }: { durationMs: number }) {
  return (
    <div className="fade-in-soft mt-2 mb-1 flex items-center gap-2 text-xs text-text-faint">
      <Mark state="idle" size={15} className="text-accent/50" />
      <span>done</span>
      <span className="tabular-nums">· {formatElapsed(Math.max(1, Math.round(durationMs / 1000)))}</span>
    </div>
  )
}

function EmptyLane() {
  return (
    <p className="py-10 text-center text-sm text-text-faint @[30rem]:py-16">
      Nothing here yet — say something.
    </p>
  )
}
