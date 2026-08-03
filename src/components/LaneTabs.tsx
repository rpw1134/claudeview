import { CircleDot, MessagesSquare, UserRoundCog } from 'lucide-react'
import type { Tab } from '@/types/session'
import { cn } from '@/lib/utils'

/**
 * Switcher for the main transcript and any subagent transcripts.
 *
 * Subagents run concurrently and produce a lot of output. Interleaving them into
 * one stream makes both unreadable, so each gets its own lane and this row is how
 * you move between them. It hides itself entirely when only the main lane exists,
 * so a simple session carries no extra chrome.
 */
export function LaneTabs({
  tab,
  onSelect,
}: {
  tab: Tab
  onSelect: (laneId: string) => void
}) {
  if (tab.laneOrder.length <= 1) return null

  return (
    <div
      role="tablist"
      aria-label="Transcripts"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-1.5"
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
              'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'bg-surface-raised font-medium text-text'
                : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
            )}
          >
            <Icon size={12} />
            <span className="max-w-40 truncate">
              {isMain ? 'Main' : (lane.type ?? 'Subagent')}
            </span>
            {/* A live dot beats a spinner here: it reads as "still going" without
                drawing the eye away from whichever transcript is being read. */}
            {!isMain && !lane.closed ? (
              <CircleDot size={9} className="animate-pulse text-accent" aria-label="Running" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
