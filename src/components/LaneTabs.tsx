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
    <div
      role="tablist"
      aria-label="Transcripts"
      className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pt-3"
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
              'flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs transition-colors duration-150',
              isActive
                ? 'bg-raised text-text'
                : 'text-text-muted hover:bg-surface hover:text-text',
            )}
          >
            <Icon size={13} className={isActive ? 'text-text-muted' : 'text-text-faint'} />
            <span className="max-w-40 truncate">{isMain ? 'Main' : (lane.type ?? 'Subagent')}</span>
            {/* A live dot rather than a spinner: reads as "still going" peripherally. */}
            {!isMain && !lane.closed ? (
              <CircleDot size={10} className="animate-pulse text-accent" aria-label="Running" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
