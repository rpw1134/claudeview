import { useEffect, useState } from 'react'
import { selectFocusedPanel, useWorkspaceStore } from '@/stores/workspaceStore'
import { collectPanelIds } from '@/lib/layoutTree'
import { useStreamBridge } from '@/hooks/useStreamBridge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { PanelMosaic } from '@/components/PanelMosaic'
import { SettingsDialog } from '@/components/SettingsDialog'
import { NewSessionPanel } from '@/components/NewSessionPanel'
import { ConfigPanel } from '@/components/config/ConfigPanel'
import { ReviewView } from '@/components/review/ReviewView'

export function App() {
  // One IPC subscription for the whole app. See the hook for why it must be here.
  useStreamBridge()

  const panels = useWorkspaceStore((state) => state.panels)
  const layout = useWorkspaceStore((state) => state.layout)
  const focusedPanelId = useWorkspaceStore((state) => state.focusedPanelId)
  const autoFocusToken = useWorkspaceStore((state) => state.autoFocusToken)
  const mode = useWorkspaceStore((state) => state.mode)
  const { focusPanel, cyclePanel, addPanel, closePanel, balanceLayout, toggleMode } =
    useWorkspaceStore.getState()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [home, setHome] = useState<string | undefined>()

  /**
   * Which surface fills the window: the panel workspace, or Claude config.
   *
   * Config is deliberately *not* a panel. It's a different activity — editing
   * the machinery rather than talking to it — so it takes the whole window and
   * leaves the mosaic untouched underneath. `configMounted` keeps the config
   * tree alive after its first open (hidden, not unmounted), so switching away
   * mid-edit and back doesn't lose a draft.
   */
  const [view, setView] = useState<'workspace' | 'config'>('workspace')
  const [configMounted, setConfigMounted] = useState(false)

  const toggleConfig = () => {
    setConfigMounted(true)
    setView((current) => (current === 'config' ? 'workspace' : 'config'))
  }

  useEffect(() => {
    api['app:info']()
      .then((info) => setHome(info.home))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    /*
     * A claimed shortcut must produce its action and NOTHING else.
     *
     * `preventDefault` alone is not enough: xterm listens for keydown on its own
     * textarea and writes to the PTY from that handler, so Alt+Tab would switch
     * panels *and* type a tab into the shell. This listener runs in the capture
     * phase — before any component's — and `stopPropagation` is what actually
     * keeps a claimed key out of whatever is focused. Every handled combo goes
     * through `claim`, no exceptions.
     */
    const claim = (event: KeyboardEvent, action: () => void) => {
      event.preventDefault()
      event.stopPropagation()
      action()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const alt = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey

      // The config view toggle works from either surface — command or button,
      // in both directions — and from either workspace mode.
      if (alt && event.code === 'KeyK') {
        claim(event, toggleConfig)
        return
      }

      // Review is a workspace mode, not a view, but the command still needs to
      // reach it from config: switch the view back to workspace on the way in,
      // same as pressing the toolbar's config button would.
      if (alt && event.code === 'KeyR') {
        claim(event, () => {
          toggleMode()
          if (view === 'config') setView('workspace')
        })
        return
      }

      const accel = event.metaKey || event.ctrlKey
      if (accel && event.key === ',') {
        claim(event, () => setSettingsOpen(true))
        return
      }

      // Everything below acts on panels. While config fills the window, or
      // review mode has replaced the mosaic, the panel surface isn't visible,
      // and a shortcut that mutates an invisible surface is a trap — so they're
      // inert until you switch back.
      if (view === 'config' || mode === 'review') return

      // Panel cycling. Alt+Tab is free inside the window on macOS (the system
      // uses Cmd+Tab); Ctrl+Tab is accepted too since it's the conventional
      // in-app cycle and Alt+Tab is taken by the OS on Windows and Linux.
      if (event.key === 'Tab' && (event.altKey || event.ctrlKey)) {
        claim(event, () => cyclePanel(event.shiftKey ? -1 : 1))
        return
      }

      /*
       * Option-key panel commands. Matched on `event.code` (the physical key),
       * not `event.key`: on macOS Option+letter produces a composed character
       * (`Opt+C` is `ç`), so `key` never says "c".
       */
      if (alt) {
        const digit = /^Digit([1-8])$/.exec(event.code)
        if (digit) {
          // Visual order — left to right, top to bottom — same as panel cycling.
          const target = collectPanelIds(layout)[Number(digit[1]) - 1]
          if (target) claim(event, () => focusPanel(target, true))
          return
        }

        // Splits inherit the focused panel's kind: splitting a terminal gives
        // another shell alongside it, splitting a session another session.
        const focusedKind = selectFocusedPanel(useWorkspaceStore.getState())?.kind ?? 'session'
        const command: Record<string, (() => void) | undefined> = {
          KeyT: () => void addPanel('session'),
          KeyC: () => void addPanel('terminal'),
          KeyA: () => void addPanel(focusedKind, { direction: 'row' }),
          KeyS: () => void addPanel(focusedKind, { direction: 'column' }),
          KeyW: focusedPanelId ? () => void closePanel(focusedPanelId) : undefined,
        }
        const run = command[event.code]
        if (run) claim(event, run)
        return
      }

      // Cmd+W / Ctrl+W: platform convention for "close the current thing",
      // kept alongside Opt+W rather than replaced by it.
      if (accel && event.key === 'w' && focusedPanelId) {
        claim(event, () => void closePanel(focusedPanelId))
      }
    }

    // Capture phase, so shortcuts are seen before xterm's own key handling.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    layout,
    focusedPanelId,
    view,
    mode,
    addPanel,
    closePanel,
    focusPanel,
    cyclePanel,
    toggleMode,
  ])

  /*
   * Swallow file drops that miss a composer.
   *
   * A browser's default response to a dropped file is to navigate to it, and in
   * Electron that replaces the entire app with a file viewer — every live session
   * and terminal gone, with no way back but relaunching. Composers call
   * `preventDefault` on their own drops; this catches everything else.
   */
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  return (
    /*
     * Two rows only: toolbar and panels.
     *
     * There is deliberately nothing at the bottom of the window. The old layout
     * had a message bar plus a status strip that existed only for sessions, so
     * focusing a terminal removed a row and shifted every panel. Input and status
     * now live inside the panels that own them, so moving focus changes nothing
     * about the window's shape.
     */
    <div className="flex h-full flex-col bg-bg">
      <WorkspaceBar
        panelCount={panels.length}
        configActive={view === 'config'}
        reviewActive={mode === 'review'}
        onAddSession={(direction) => void addPanel('session', { direction })}
        onAddTerminal={(direction) => void addPanel('terminal', { direction })}
        onToggleConfig={toggleConfig}
        onToggleReview={() => {
          // Mirror the ⌥R shortcut exactly: entering review from config also
          // brings the workspace back, or the toggle would flip an invisible mode.
          toggleMode()
          if (view === 'config') setView('workspace')
        }}
        onBalance={balanceLayout}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* All three surfaces stay mounted; `hidden` swaps which one shows.
          Unmounting the mosaic would tear down every terminal's emulator,
          unmounting config would drop an in-progress edit, and review gets the
          same treatment for consistency even though it has nothing to lose yet. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          (view === 'config' || mode === 'review') && 'hidden',
        )}
      >
        {panels.length === 0 ? (
          <NewSessionPanel
            home={home}
            onStart={(options) => void addPanel('session', options)}
            onStartTerminal={(cwd) => void addPanel('terminal', { cwd })}
            onOpenConfig={toggleConfig}
          />
        ) : (
          <PanelMosaic
            panels={panels}
            layout={layout}
            focusedPanelId={focusedPanelId}
            autoFocusToken={autoFocusToken}
            home={home}
            onFocus={focusPanel}
            onClose={(panelId) => void closePanel(panelId)}
          />
        )}
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          (view === 'config' || mode !== 'review') && 'hidden',
        )}
      >
        <ReviewView />
      </div>

      {configMounted ? (
        <div className={cn('min-h-0 flex-1', view !== 'config' && 'hidden')}>
          <ConfigPanel />
        </div>
      ) : null}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
