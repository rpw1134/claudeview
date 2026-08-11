import { memo, useMemo, useState } from 'react'
import { ArrowDown, ChevronRight } from 'lucide-react'
import type { SessionStatus } from '@shared/ipc'
import type { Lane, TranscriptItem } from '@/types/session'
import type { ToolItem } from '@/lib/toolGroups'
import { groupTranscriptItems, shouldAutoExpand, summarizeToolGroup } from '@/lib/toolGroups'
import { useStickyScroll } from '@/hooks/useStickyScroll'
import { useIsStreaming } from '@/hooks/useStreamedText'
import { useReviewStore } from '@/stores/reviewStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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
  tabId,
  showActivity,
  onOpenLane,
  onRetry,
}: {
  lane: Lane
  status: SessionStatus
  /** How the most recent turn ended; drives the settled footer. */
  lastTurn?: { ok: boolean; durationMs: number }
  /** The owning session tab, for the footer's changed-files link. */
  tabId: string
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
  // Keyed on the items array itself: the store gives untouched lanes referential
  // identity, so this recomputes only for the lane an event actually changed —
  // and the group arrays it hands to memoized rows stay stable in the meantime.
  const runs = useMemo(() => groupTranscriptItems(lane.items), [lane.items])

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
          {runs.map((run) =>
            run.kind === 'tool-group' ? (
              <ToolGroupRow key={run.id} items={run.items} onOpenLane={onOpenLane} />
            ) : (
              <TranscriptRow
                key={run.id}
                item={run.item}
                onOpenLane={onOpenLane}
                onRetry={onRetry}
              />
            ),
          )}

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
            <TurnFooter durationMs={lastTurn!.durationMs} tabId={tabId} />
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
      return <ThinkingBlock item={item} />

    case 'tool':
      return <ToolCallCard item={item} onOpenLane={onOpenLane} />

    case 'error':
      return <ErrorRow item={item} onRetry={onRetry} />
  }
})

/**
 * A run of tool calls as one evolving row.
 *
 * ## Why this collapses
 *
 * A single card per call was already quiet, but an agentic turn makes twenty of
 * them, and twenty quiet rows are not quiet — they're a wall you scroll past to
 * find the sentence at the end. What you actually want while it runs is *one*
 * line that keeps saying what's happening now, and afterwards *one* line saying
 * how much happened. Both are the same row; it just changes what it says.
 *
 * Collapsed by default even while running, which is the whole point: the evolving
 * label is the thing worth watching, and expanding it would put the wall back.
 * Two exceptions open it anyway (see `shouldAutoExpand`) — a failure, and a call
 * that spawned a subagent, whose "Open" button has nowhere to live on one line.
 * A user's own toggle overrides both, in either direction.
 */
const ToolGroupRow = memo(function ToolGroupRow({
  items,
  onOpenLane,
}: {
  items: ToolItem[]
  onOpenLane: (id: string) => void
}) {
  // `null` means "nobody has decided yet", which is not the same as collapsed:
  // a group that fails on its tenth call has to be able to open itself, and it
  // can only tell the difference if an explicit collapse is recorded as one.
  const [override, setOverride] = useState<boolean | null>(null)
  const summary = summarizeToolGroup(items)
  const expanded = override ?? shouldAutoExpand(items)

  return (
    <div className="my-0.5">
      <button
        onClick={() => setOverride(!expanded)}
        className="hand-sm-1 -mx-1.5 flex w-full min-w-0 items-center gap-2 px-1.5 py-1 text-xs
                   text-text-faint transition-colors hover:text-text-muted"
        aria-expanded={expanded}
      >
        <Mark
          state={summary.running ? 'working' : 'idle'}
          size={15}
          className={cn('shrink-0', summary.running ? 'text-accent' : 'text-accent/60')}
        />
        {summary.running ? (
          <span className="truncate font-mono">{summary.current}</span>
        ) : (
          <span className="shrink-0 tabular-nums">
            {summary.total} tool calls · {summary.ok} ok
          </span>
        )}
        {summary.failed > 0 ? (
          <span className="shrink-0 tabular-nums text-danger">· {summary.failed} failed</span>
        ) : null}
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        />
      </button>

      {expanded ? (
        <div>
          {items.map((item) => (
            <ToolCallCard key={item.id} item={item} onOpenLane={onOpenLane} />
          ))}
        </div>
      ) : null}
    </div>
  )
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
function ThinkingBlock({ item }: { item: Extract<TranscriptItem, { kind: 'thinking' }> }) {
  const [expanded, setExpanded] = useState(false)
  // Live while thoughts are still arriving: the mark breathes and the row is the
  // turn's indicator (the tail line stands down — see Transcript). Once the
  // thinking ends it settles to the still, faint mark.
  const streaming = useIsStreaming(item.blockId)
  const blockId = item.blockId

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
        {streaming ? 'thinking…' : thoughtLabel(item.thoughtForMs)}
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
 * What a finished thinking row says.
 *
 * "thinking" in the past tense with no number was the weakest possible version of
 * this: the row survives the turn, so it may as well report the one fact it
 * uniquely knows. A long pause before an answer stops looking like a stall once
 * it's labelled with its own cost.
 *
 * Replayed history has no duration (see the `thinking` item type) and falls back
 * to the bare word rather than inventing a plausible-looking number.
 */
function thoughtLabel(thoughtForMs: number | undefined): string {
  if (thoughtForMs === undefined) return 'Thought'
  // Never "0s": sub-second thinking still happened, and a zero reads as a bug.
  return `Thought for ${formatElapsed(Math.max(1, Math.round(thoughtForMs / 1000)))}`
}

/**
 * The turn's resting state: the mark gone still, "done", how long it took —
 * and, when this session's work left files behind, the way into reviewing them.
 *
 * Faint on purpose — this is a full stop, not an announcement. Its job is to be
 * the visible difference between "finished" and "hung": before it existed, both
 * looked like a transcript that had simply stopped moving. It occupies the same
 * slot the activity line did, so completion is a *transition* (accent motion →
 * faint stillness) rather than a layout snap.
 *
 * The review link is the natural entry point to the review surface: it appears
 * exactly when an agent finishes having edited code, in the place you're
 * already looking, naming this session's file count — not a global one.
 */
function TurnFooter({ durationMs, tabId }: { durationMs: number; tabId: string }) {
  const changedCount = useReviewStore(
    (state) => state.files.filter((file) => file.tabId === tabId).length,
  )

  return (
    <div className="fade-in-soft mt-2 mb-1 flex items-center gap-2 text-xs text-text-faint">
      <Mark state="idle" size={15} className="text-accent/50" />
      <span>done</span>
      <span className="tabular-nums">· {formatElapsed(Math.max(1, Math.round(durationMs / 1000)))}</span>
      {changedCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            const first = useReviewStore
              .getState()
              .files.find((file) => file.tabId === tabId)
            if (first) useReviewStore.getState().setActivePath(first.path)
            useWorkspaceStore.getState().setMode('review')
          }}
          className="hand-sm-1 -my-0.5 px-1.5 py-0.5 text-accent transition-colors hover:bg-accent-wash"
        >
          {changedCount} file{changedCount === 1 ? '' : 's'} changed — review
        </button>
      ) : null}
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
