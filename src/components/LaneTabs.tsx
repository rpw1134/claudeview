import { CircleDot, MessagesSquare, UserRoundCog } from 'lucide-react'
import type { Tab } from '@/types/session'
import { cn } from '@/lib/utils'

/**
 * Switcher for the main transcript and any subagent transcripts.
 *
 * Subagents run concurrently and produce a lot of output; interleaving them into
 * one stream makes both unreadable, so each gets a lane and this row moves between
 * them. It hides entirely when only the main lane exists, so a simple session
 * carries no extra chrome — a control that's always visible but usually
 * meaningless is exactly the kind of thing that makes a UI feel busy.
 *
 * Sits on the window background rather than a panel fill, so it reads as part of
 * the transcript region rather than a third horizontal band under the tab strip.
 */
export function LaneTabs({ tab, onSelect }: { tab: Tab; onSelect: (laneId: string) => void }) {
  if (tab.laneOrder.length <= 1) return null

  return (
    <div className="shrink-0">
      <div
        role="tablist"
        aria-label="Transcripts"
        /*
         * Centred on the same measure box as the transcript, then inset by the
         * transcript's gutter *minus* the tab's own 12px padding — so a tab label
         * lands on the same vertical line as the prose below it, and the active
         * pill's fill lands on the same line as a tool row's hover fill.
         * Transcript gutters are 12 / 20 / 32, hence 0 / 8 / 20 here.
         */
        className="mx-auto flex w-full max-w-[calc(var(--measure)+8rem)] items-center gap-1
                   overflow-x-auto px-0 pt-3 @[30rem]:px-2 @[48rem]:px-5"
      >
        {tab.laneOrder.map((laneId) => {
          const lane = tab.lanes[laneId]
          if (!lane) return null

          const isMain = laneId === 'main'
          const isActive = tab.activeLaneId === laneId
          const Icon = isMain ? MessagesSquare : UserRoundCog

          return (
            <button
              key={laneId}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(laneId)}
              className={cn(
                'flex h-8 shrink-0 items-center gap-2 hand-sm-1 px-3 text-xs transition-colors duration-150',
                isActive ? 'bg-raised text-text' : 'text-text-muted hover:bg-surface hover:text-text',
              )}
            >
              <Icon size={13} className={isActive ? 'text-text-muted' : 'text-text-faint'} />
              <span className="max-w-40 truncate">
                {isMain ? 'Main' : (lane.type ?? 'Subagent')}
              </span>
              {/* A live dot rather than a spinner: reads as "still going" peripherally. */}
              {!isMain && !lane.closed ? (
                <CircleDot size={10} className="animate-pulse text-accent" aria-label="Running" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
