import { useEffect, useState } from 'react'
import { selectFocusedPanel, useWorkspaceStore } from '@/stores/workspaceStore'
import { collectPanelIds } from '@/lib/layoutTree'
import { useStreamBridge } from '@/hooks/useStreamBridge'
import { api } from '@/lib/api'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { PanelMosaic } from '@/components/PanelMosaic'
import { SettingsDialog } from '@/components/SettingsDialog'
import { NewSessionPanel } from '@/components/NewSessionPanel'

export function App() {
  // One IPC subscription for the whole app. See the hook for why it must be here.
  useStreamBridge()

  const panels = useWorkspaceStore((state) => state.panels)
  const layout = useWorkspaceStore((state) => state.layout)
  const focusedPanelId = useWorkspaceStore((state) => state.focusedPanelId)
  const autoFocusToken = useWorkspaceStore((state) => state.autoFocusToken)
  const { focusPanel, cyclePanel, addPanel, closePanel, balanceLayout } =
    useWorkspaceStore.getState()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [home, setHome] = useState<string | undefined>()

  useEffect(() => {
    api['app:info']()
      .then((info) => setHome(info.home))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Panel cycling. Alt+Tab is free inside the window on macOS (the system
      // uses Cmd+Tab); Ctrl+Tab is accepted too since it's the conventional
      // in-app cycle and Alt+Tab is taken by the OS on Windows and Linux.
      if (event.key === 'Tab' && (event.altKey || event.ctrlKey)) {
        event.preventDefault()
        cyclePanel(event.shiftKey ? -1 : 1)
        return
      }

      /*
       * Option-key panel commands.
       *
       * Matched on `event.code` (the physical key), not `event.key`: on macOS
       * Option+letter produces a composed character (`Opt+C` is `ç`), so `key`
       * never says "c". `stopPropagation` matters as much as `preventDefault`
       * here — the listener runs in the capture phase so these combos win over
       * xterm, which would otherwise type the composed character into the shell.
       */
      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        const digit = /^Digit([1-8])$/.exec(event.code)
        if (digit) {
          // Visual order — left to right, top to bottom — same as panel cycling,
          // unlike Cmd+number which follows creation order.
          const target = collectPanelIds(layout)[Number(digit[1]) - 1]
          if (target) {
            event.preventDefault()
            event.stopPropagation()
            focusPanel(target, true)
          }
          return
        }

        // Splits inherit the focused panel's kind: splitting a terminal gives
        // another shell alongside it, splitting a session another session.
        const focusedKind =
          selectFocusedPanel(useWorkspaceStore.getState())?.kind ?? 'session'
        const command: Record<string, (() => void) | undefined> = {
          KeyT: () => void addPanel('session'),
          KeyC: () => void addPanel('terminal'),
          KeyK: () => void addPanel('config'),
          KeyA: () => void addPanel(focusedKind, { direction: 'row' }),
          KeyS: () => void addPanel(focusedKind, { direction: 'column' }),
        }
        const run = command[event.code]
        if (run) {
          event.preventDefault()
          event.stopPropagation()
          run()
        }
        return
      }

      const accel = event.metaKey || event.ctrlKey
      if (!accel) return

      if (event.key === 't') {
        event.preventDefault()
        void addPanel(event.shiftKey ? 'terminal' : 'session')
      } else if (event.key === 'w' && focusedPanelId) {
        event.preventDefault()
        void closePanel(focusedPanelId)
      } else if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (/^[1-9]$/.test(event.key)) {
        const target = panels[Number(event.key) - 1]
        if (target) {
          event.preventDefault()
          focusPanel(target.id, true)
        }
      }
    }

    // Capture phase, so panel commands are seen before xterm's own key handling.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [panels, layout, focusedPanelId, addPanel, closePanel, focusPanel, cyclePanel])

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
        onAddSession={(direction) => void addPanel('session', { direction })}
        onAddTerminal={(direction) => void addPanel('terminal', { direction })}
        onAddConfig={() => void addPanel('config')}
        onBalance={balanceLayout}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {panels.length === 0 ? (
        <NewSessionPanel
          home={home}
          onStart={(options) => void addPanel('session', options)}
          onStartTerminal={(cwd) => void addPanel('terminal', { cwd })}
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
