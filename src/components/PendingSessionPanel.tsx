import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { PermissionMode } from '@shared/ipc'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { PanelComposer } from './PanelComposer'
import { Button } from './ui/Button'
import { shortenPath } from '@/lib/utils'

/**
 * A session panel before it has a session.
 *
 * ## The chat is already here
 *
 * The previous version of this was a form — a directory row and a Start button
 * pinned to the top of an otherwise empty panel — and a form is a *different
 * screen*. You filled it in, it vanished, and a conversation appeared in its
 * place. Two layouts, one of which you saw for four seconds and never again.
 *
 * This is the same shell as a live session: empty transcript above, the real
 * composer below, in the same position it will occupy for the rest of the
 * panel's life. Nothing moves when the session starts, because nothing needs to:
 * the only thing that changes is that the transcript fills in. **Typing the
 * first message IS the start** — the prompt rides along on the spawn
 * (`startPanelSession`'s third argument), so there is no separate act of
 * starting and therefore no button to press to do it.
 *
 * ## One quiet line, not a control
 *
 * The directory still has to be checkable — it's the one fact that can't be
 * changed after the fact — but it isn't what you came here to do. So it sits
 * centred in the empty space at the faint tier, the way a placeholder does, with
 * `Change` beside it as a link-weight affordance that only takes colour on
 * hover. One focal point in the panel: the caret.
 */
export function PendingSessionPanel({
  panelId,
  cwd,
  home,
  panelFocused,
  autoFocusToken,
}: {
  panelId: string
  cwd?: string
  home?: string
  panelFocused: boolean
  autoFocusToken: number
}) {
  const setPendingCwd = useWorkspaceStore((state) => state.setPanelPendingCwd)
  const startSession = useWorkspaceStore((state) => state.startPanelSession)

  /*
   * The draft outlives this component's mount.
   *
   * A pending panel has no tab, so there is nowhere in the session store to keep
   * what you've typed — but a composer *unmounts whenever the layout tree changes
   * shape* (opening a sibling panel wraps this one in a new split), which is
   * exactly the data-loss bug that moved live drafts onto the tab in the first
   * place. A module-scoped map keyed by panel id is the smallest thing that keeps
   * the same guarantee for the pre-start case; the entry is dropped on send and
   * when the panel goes away.
   */
  const [draft, setDraftState] = useState(() => pendingDrafts.get(panelId) ?? '')
  const [attachments, setAttachments] = useState<string[]>(
    () => pendingAttachments.get(panelId) ?? [],
  )
  // Carried into the spawn: a mode picked before the first message is a choice
  // about the session being created, and it rides along on start.
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('auto')

  const onDraftChange = (next: string, nextAttachments: string[]) => {
    setDraftState(next)
    setAttachments(nextAttachments)
    pendingDrafts.set(panelId, next)
    pendingAttachments.set(panelId, nextAttachments)
  }

  /*
   * Resolve the fallback directory to a real path.
   *
   * The first panel of a session has no directory to inherit, and the honest
   * answer — "the app's own directory" — is a phrase, not something you can
   * check. Naming the actual path means the line can be *read* rather than
   * trusted, and it means every session started from here commits a concrete
   * cwd, which is what lets the panel header state one afterwards.
   */
  useEffect(() => {
    if (cwd) return
    let cancelled = false

    void api['app:info']().then((info) => {
      if (cancelled || !info?.cwd) return
      // Re-read rather than close over `cwd`: the picker may have won the race,
      // and a user's choice must never be overwritten by the default arriving.
      const panel = useWorkspaceStore.getState().panels.find((entry) => entry.id === panelId)
      if (panel?.pending && !panel.pending.cwd) setPendingCwd(panelId, info.cwd)
    })

    return () => {
      cancelled = true
    }
  }, [cwd, panelId, setPendingCwd])

  const pickDirectory = async () => {
    const picked = await api['app:pick-directory']()
    if (picked) setPendingCwd(panelId, picked)
  }

  const onSend = (text: string) => {
    pendingDrafts.delete(panelId)
    pendingAttachments.delete(panelId)
    void startSession(panelId, cwd, text, permissionMode)
  }

  /*
   * Folder trust, checked per proposed directory. `null` while the answer is in
   * flight — the composer stays enabled during that beat, because flashing it
   * disabled for every already-trusted folder (the overwhelming case) would
   * punish the common path to guard the rare one; an untrusted answer disables
   * it the moment it lands.
   */
  const [trusted, setTrusted] = useState<boolean | null>(null)
  useEffect(() => {
    if (!cwd) return
    let cancelled = false
    setTrusted(null)
    api['trust:check']({ dir: cwd })
      .then((ok) => {
        if (!cancelled) setTrusted(ok)
      })
      .catch(() => {
        if (!cancelled) setTrusted(true) // An unreadable trust store must not brick starting.
      })
    return () => {
      cancelled = true
    }
  }, [cwd])

  const approve = async () => {
    if (!cwd) return
    await api['trust:grant']({ dir: cwd })
    setTrusted(true)
  }

  const projectName = cwd?.split('/').filter(Boolean).pop()

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pending-session-panel">
      {/* Stands in for the transcript, and holds the same gutters, so the block
          it centres sits on the reading area rather than in a band of its own. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 @[30rem]:px-7 @[48rem]:px-10">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-text-faint">
          <span>
            Session will start in{' '}
            <span className="font-mono text-text-muted" title={cwd}>
              {projectName ?? '…'}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void pickDirectory()}
            data-testid="pending-change-directory"
          >
            Change
          </Button>
        </div>
        {cwd ? (
          <p className="max-w-full truncate font-mono text-xs text-text-faint" title={cwd}>
            {shortenPath(cwd, home)}
          </p>
        ) : null}

      </div>

      {trusted === false ? (
        /*
         * The approval step the CLI shows and the SDK skips. It REPLACES the
         * composer rather than disabling it: a disabled composer needs
         * explanatory placeholder copy the composer doesn't have for this
         * case, and consent shouldn't share a surface with the thing it
         * gates. One sentence, one action, sitting exactly where typing will
         * happen once it's given — so there is no path to a prompt running in
         * a folder nobody approved.
         */
        <div
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2
                     px-4 pb-4 pt-1 text-sm text-text-muted"
          data-testid="pending-trust-gate"
        >
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={14} className="shrink-0 text-warning" aria-hidden />
            Claude hasn’t used this folder before.
          </span>
          <Button variant="primary" size="sm" onClick={() => void approve()}>
            Trust this folder
          </Button>
        </div>
      ) : (
        <PanelComposer
          // 'idle' rather than 'starting': nothing is in flight, and the composer
          // reads this to decide whether it's typeable at all.
          status="idle"
          permissionMode={permissionMode}
          panelFocused={panelFocused}
          autoFocusToken={autoFocusToken}
          draft={draft}
          draftAttachments={attachments}
          onDraftChange={onDraftChange}
          onSend={onSend}
          onInterrupt={() => {}}
          onPermissionModeChange={setPermissionMode}
        />
      )}
    </div>
  )
}

const pendingDrafts = new Map<string, string>()
const pendingAttachments = new Map<string, string[]>()
