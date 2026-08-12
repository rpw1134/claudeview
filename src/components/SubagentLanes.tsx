import { ArrowLeft } from 'lucide-react'
import type { Lane, Tab } from '@/types/session'
import { Mark } from './Mark'
import { cn } from '@/lib/utils'

const MAIN_LANE = 'main'

/** Open subagent lanes, in spawn order. Main is never one of them. */
export function runningLanes(tab: Tab): Lane[] {
  return tab.laneOrder
    .filter((id) => id !== MAIN_LANE)
    .map((id) => tab.lanes[id])
    .filter((lane): lane is Lane => lane !== undefined && !lane.closed)
}

/**
 * What's running underneath this conversation.
 *
 * ## Why this isn't a tab strip
 *
 * It used to be one: every lane the session had ever opened got a tab, forever,
 * in a scrollable row above the transcript. That row is a filing cabinet — it
 * grows monotonically, it keeps showing you work that finished ten minutes ago,
 * and by the fourth subagent it scrolls, so the thing that *is* running can be
 * off-screen while its own indicator is visible. It also charged every simple
 * session a horizontal band for a feature it never used.
 *
 * A subagent is an event, not a document. What you want to know while one is
 * running is that it *is* running and how to look at it; once it's done, its
 * output has already been folded back into the main thread and the Task row that
 * spawned it is still sitting in the transcript with an `Open` button. So this
 * shows running lanes only — **done means gone** — and disappears entirely when
 * nothing is running, which is the overwhelmingly common case and now pays zero
 * chrome for it.
 */
export function SubagentIndicator({
  tab,
  onSelect,
}: {
  tab: Tab
  onSelect: (laneId: string) => void
}) {
  const lanes = runningLanes(tab)
  if (lanes.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Running subagents"
      className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 pt-3 text-xs
                 @[30rem]:px-7 @[48rem]:px-10"
    >
      {/* The mark, turning. It's the app's one running-work signal, so a
          subagent uses the same one the main thread does rather than inventing a
          second vocabulary of spinners. */}
      <Mark state="working" size={13} className="shrink-0 text-text-faint" />
      <span className="shrink-0 text-text-faint">
        {lanes.length === 1 ? '1 subagent' : `${lanes.length} subagents`}
      </span>

      {lanes.map((lane) => (
        <button
          key={lane.id}
          onClick={() => onSelect(lane.id)}
          title={lane.description ?? lane.type}
          // The visible label names the subagent; on its own, read out of
          // context, it doesn't say that pressing it changes what the panel
          // shows. The chip is the only way in, so the name has to carry it.
          aria-label={`View ${lane.type ?? lane.description ?? 'subagent'} transcript`}
          data-testid="subagent-chip"
          className="hand-sm-1 flex h-6 shrink-0 items-center bg-raised/60 px-2 text-text-muted
                     transition-colors hover:bg-raised hover:text-text"
        >
          <span className="max-w-32 truncate">{lane.type ?? lane.description ?? 'Subagent'}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The header of a subagent's transcript, while you're reading it.
 *
 * Opening a lane *replaces* the panel's view, so the one thing this bar owes you
 * is the way back — hence a back affordance rather than a label, and hence it
 * being the leftmost, first thing in the row. The lane's own name follows as
 * breadcrumb-style context, and its state is spelled out in words rather than
 * carried by a dot: `(running)` vs `(done)` is the difference between a
 * transcript that's still moving and one that has stopped, and that's not
 * something to encode in colour alone.
 */
export function LaneViewBar({ lane, onBack }: { lane: Lane; onBack: () => void }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 px-4 pt-3 text-xs
                 @[30rem]:px-7 @[48rem]:px-10"
    >
      <button
        onClick={onBack}
        aria-label="Back to the main transcript"
        data-testid="lane-back"
        className="hand-sm-1 -ml-1 flex h-6 items-center gap-1 px-1 text-text-muted
                   transition-colors hover:bg-surface hover:text-text"
      >
        <ArrowLeft size={12} />
        Main
      </button>
      <span className="text-text-faint opacity-50">·</span>
      <span className="min-w-0 truncate text-text-muted" title={lane.description ?? lane.type}>
        {lane.type ?? lane.description ?? 'Subagent'}
      </span>
      <span className={cn('shrink-0', lane.closed ? 'text-text-faint' : 'text-accent')}>
        {lane.closed ? '(done)' : '(running)'}
      </span>
    </div>
  )
}
