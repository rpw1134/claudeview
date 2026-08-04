import { AlertCircle, RefreshCw } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { LaneTabs } from './LaneTabs'
import { Transcript } from './Transcript'
import { PanelComposer } from './PanelComposer'
import { Button } from './ui/Button'

/**
 * A session inside a panel: transcript plus its own composer.
 *
 * Input lives here rather than at the window level so that focusing a terminal
 * doesn't add or remove a row from the window and shift every panel. Each session
 * owns its input, terminals take keystrokes directly, and nothing at the window
 * level changes when focus moves.
 */
export function SessionPanel({
  tabId,
  panelFocused,
  autoFocusToken,
}: {
  tabId: string
  panelFocused: boolean
  autoFocusToken: number
}) {
  const tab = useSessionStore((state) => state.tabs.find((entry) => entry.id === tabId))
  const setActiveLane = useSessionStore((state) => state.setActiveLane)
  const reconnect = useSessionStore((state) => state.reconnect)
  const send = useSessionStore((state) => state.send)
  const interrupt = useSessionStore((state) => state.interrupt)
  const setPermissionMode = useSessionStore((state) => state.setPermissionMode)

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
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      {isEnded ? (
        // Same box as the composer below it — cap first, gutter inside — so the two
        // rows read as one block rather than two independently-inset strips.
        <div className="shrink-0">
          <div
            className="mx-auto flex w-full max-w-[calc(var(--measure)+8rem)] items-center gap-2
                       px-3 pb-2 @[30rem]:px-5 @[48rem]:px-8"
          >
            <AlertCircle
              size={13}
              className={tab.status === 'error' ? 'text-danger' : 'text-text-faint'}
            />
            <p className="min-w-0 flex-1 truncate text-xs text-text-faint">
              {tab.lastError ?? 'Session ended.'}
            </p>
            <Button variant="subtle" size="sm" onClick={() => void reconnect(tab.id)}>
              <RefreshCw size={11} />
              Reconnect
            </Button>
          </div>
        </div>
      ) : null}

      <PanelComposer
        status={tab.status}
        permissionMode={tab.permissionMode}
        panelFocused={panelFocused}
        autoFocusToken={autoFocusToken}
        onSend={(text) => void send(tab.id, text)}
        onInterrupt={() => void interrupt(tab.id)}
        onPermissionModeChange={(mode) => void setPermissionMode(tab.id, mode)}
      />
    </div>
  )
}
