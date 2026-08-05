import { useCallback } from 'react'
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
  const retry = useSessionStore((state) => state.retry)
  const interrupt = useSessionStore((state) => state.interrupt)
  const setPermissionMode = useSessionStore((state) => state.setPermissionMode)

  /*
   * Stable identities, keyed on the tab id rather than the tab object.
   *
   * `TranscriptRow` is memoized, and every row's memo compares these props. An
   * inline arrow is a new function on every render, so passing one would defeat the
   * memo for every row in the transcript — during streaming, when the tab object
   * changes several times a second and long transcripts are exactly when it matters.
   */
  const onOpenLane = useCallback(
    (laneId: string) => setActiveLane(tabId, laneId),
    [setActiveLane, tabId],
  )
  const onRetry = useCallback(
    (itemId: string, text: string) => void retry(tabId, itemId, text),
    [retry, tabId],
  )
  const onSend = useCallback((text: string) => void send(tabId, text), [send, tabId])
  const onInterrupt = useCallback(() => void interrupt(tabId), [interrupt, tabId])

  if (!tab) {
    return <p className="p-4 text-sm text-text-faint">Session not found.</p>
  }

  const lane = tab.lanes[tab.activeLaneId]
  const isEnded = tab.status === 'closed' || tab.status === 'error'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LaneTabs tab={tab} onSelect={onOpenLane} />

      {lane ? (
        <Transcript
          // Remount per lane so switching transcripts resets scroll position.
          key={`${tab.id}:${lane.id}`}
          lane={lane}
          status={tab.status}
          // A subagent lane is a view onto work the *main* thread commissioned, so
          // showing "Thinking…" at the foot of every open lane would claim several
          // things are running when one is.
          showActivity={lane.id === 'main'}
          onOpenLane={onOpenLane}
          onRetry={onRetry}
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
            {/* What went wrong is now an error row in the transcript, in the place
                it happened. Repeating it here would say the same thing twice and
                still only ever show the most recent one. */}
            <p className="min-w-0 flex-1 truncate text-xs text-text-faint">
              This session has ended.
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
        onSend={onSend}
        onInterrupt={onInterrupt}
        onPermissionModeChange={(mode) => void setPermissionMode(tab.id, mode)}
      />
    </div>
  )
}
