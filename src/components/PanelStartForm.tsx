import { useEffect, useRef } from 'react'
import { FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Mark } from './Mark'
import { Button } from './ui/Button'
import { cn, shortenPath } from '@/lib/utils'

/**
 * What a session panel shows before it has been aimed.
 *
 * ## Why a panel can exist without a session
 *
 * ⌥T used to spawn a subprocess immediately, in a directory inherited from
 * whatever panel had focus. That answers "where does this run?" by guessing, and
 * the guess is invisible until the agent has already read the wrong repository —
 * at which point the only fix is to close the panel and start again. The panel
 * now opens empty and *asks*, which costs one keypress (Enter) when the default
 * is right and saves a wrong start when it isn't.
 *
 * ## Two controls, one primary
 *
 * A directory and a Start button. No model picker, no permission mode, no name
 * field — everything that can be changed after the session is running belongs
 * after the session is running. The only thing here is the one fact that cannot
 * be changed later, which is why it's the only thing being asked.
 *
 * ## It has to survive one eighth of a window
 *
 * The layout is a single column by default and only goes horizontal once the
 * panel is wide enough (`@[22rem]`) for a path and a button to share a line. The
 * path is already shortened to its last three segments, so what survives the
 * narrow case is the end of the path — the directory name you're checking.
 */
export function PanelStartForm({
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
  const startRef = useRef<HTMLButtonElement>(null)

  /*
   * Enter starts the session. Parking the caret on the submit button rather than
   * binding a document-level key handler means Enter, Space and the focus ring
   * all come from the button itself — and Tab still reaches the picker first, so
   * changing the directory is one key away from where focus lands.
   */
  useEffect(() => {
    if (panelFocused) startRef.current?.focus()
  }, [panelFocused, autoFocusToken])

  /*
   * Resolve the fallback directory to a real path.
   *
   * The first panel of a session has no directory to inherit, and the honest
   * answer — "the app's own directory" — is a phrase, not something you can
   * check. Naming the actual path means the form can be *read* rather than
   * trusted, and it means every session that starts from here commits a
   * concrete cwd, which is what lets the panel header state one later.
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
    if (!picked) return
    setPendingCwd(panelId, picked)
    /*
     * Hand focus back to Start once a directory has been chosen.
     *
     * Without this, focus stays on the picker — and since the picker is a
     * `type="button"` inside the form, the Enter you press to confirm your
     * choice re-opens the directory dialog instead of starting the session. The
     * one keystroke people will actually use has to land on the one action they
     * meant, and after picking, that action is Start.
     */
    startRef.current?.focus()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void startSession(panelId, cwd)
      }}
      className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 @[16rem]:p-4 @[30rem]:p-7"
      data-testid="panel-start-form"
    >
      <p className="text-xs text-text-faint">New session in</p>

      <div className="flex flex-col gap-2 @[22rem]:flex-row @[22rem]:items-center">
        <button
          type="button"
          onClick={pickDirectory}
          data-testid="panel-start-directory"
          aria-label={`Directory: ${cwd ?? 'the app’s own directory'}. Change`}
          className="hand-1 group flex h-9 min-w-0 items-center gap-2 bg-surface px-3 text-left
                     transition-colors hover:bg-raised @[22rem]:flex-1"
        >
          <FolderOpen size={14} className="shrink-0 text-ink-faint" aria-hidden />
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-xs',
              cwd ? 'text-text' : 'text-text-faint',
            )}
            title={cwd}
          >
            {cwd ? (
              <>
                {/* Truncation cuts the tail, but the tail is the part that
                    names the directory — so under 16rem show the name alone
                    rather than the head of a path you can't finish reading. */}
                <span className="@[16rem]:hidden">{cwd.split('/').filter(Boolean).pop()}</span>
                <span className="hidden @[16rem]:inline">{shortenPath(cwd, home)}</span>
              </>
            ) : (
              'Choose a directory'
            )}
          </span>
          {/* The word is a signifier, not the control — the whole row is the
              button and carries the label in `aria-label` — so the narrowest
              panels spend that width on the path instead. */}
          <span className="hidden shrink-0 text-xs text-text-faint group-hover:text-accent @[16rem]:inline">
            change
          </span>
        </button>

        {/* The only accent-filled thing in the panel, as on the landing page. */}
        <Button ref={startRef} type="submit" variant="primary" size="lg" className="shrink-0">
          <Mark state="idle" size={15} />
          Start
        </Button>
      </div>
    </form>
  )
}
