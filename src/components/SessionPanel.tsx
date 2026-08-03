import { useSessionStore } from '@/stores/sessionStore'
import { LaneTabs } from './LaneTabs'
import { Transcript } from './Transcript'
import { Button } from './ui/Button'
import { AlertCircle, RefreshCw } from 'lucide-react'

/**
 * A session's transcript inside a panel.
 *
 * Deliberately has no composer of its own — input is the single message bar at the
 * bottom of the window, which routes to whichever panel is focused. Giving each
 * panel its own input would put up to eight text fields on screen with no way to
 * tell which one is live.
 */
export function SessionPanel({ tabId }: { tabId: string }) {
  const tab = useSessionStore((state) => state.tabs.find((entry) => entry.id === tabId))
  const setActiveLane = useSessionStore((state) => state.setActiveLane)
  const reconnect = useSessionStore((state) => state.reconnect)

  if (!tab) {
    return <p className="p-4 text-sm text-text-faint">Session not found.</p>
  }

  const lane = tab.lanes[tab.activeLaneId]
  const isEnded = tab.status === 'closed' || tab.status === 'error'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LaneTabs tab={tab} onSelect={(laneId) => setActiveLane(tab.id, laneId)} />

      {lane ? (
        <Transcript
          // Remount per lane so switching transcripts resets scroll position.
          key={`${tab.id}:${lane.id}`}
          lane={lane}
          onOpenLane={(laneId) => setActiveLane(tab.id, laneId)}
        />
      ) : null}

      {isEnded ? (
        <div className="shrink-0 border-t border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle
              size={14}
              className={tab.status === 'error' ? 'text-danger' : 'text-text-faint'}
            />
            <p className="min-w-0 flex-1 truncate text-xs text-text-muted">
              {tab.lastError ?? 'This session has ended.'}
            </p>
            <Button variant="subtle" size="sm" onClick={() => void reconnect(tab.id)}>
              <RefreshCw size={12} />
              Reconnect
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
