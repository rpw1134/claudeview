import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panels, focusedPanelId, addPanel, closePanel, focusPanel, cyclePanel])

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
