import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { selectFocusedPanel, useWorkspaceStore } from '@/stores/workspaceStore'
import { useStreamBridge } from '@/hooks/useStreamBridge'
import { api } from '@/lib/api'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { PanelMosaic } from '@/components/PanelMosaic'
import { MessageBar } from '@/components/MessageBar'
import { StatusBar } from '@/components/StatusBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { NewSessionPanel } from '@/components/NewSessionPanel'

export function App() {
  // One IPC subscription for the whole app. See the hook for why it must be here.
  useStreamBridge()

  const panels = useWorkspaceStore((state) => state.panels)
  const layout = useWorkspaceStore((state) => state.layout)
  const focusedPanelId = useWorkspaceStore((state) => state.focusedPanelId)
  const focusedPanel = useWorkspaceStore(selectFocusedPanel)
  const { focusPanel, addPanel, closePanel, balanceLayout } = useWorkspaceStore.getState()

  const tabs = useSessionStore((state) => state.tabs)
  const { send, interrupt, setPermissionMode } = useSessionStore.getState()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [home, setHome] = useState<string | undefined>()

  useEffect(() => {
    api['app:info']()
      .then((info) => setHome(info.home))
      .catch(() => undefined)
  }, [])

  /** The session behind the focused panel, when that panel is a session. */
  const focusedTab =
    focusedPanel?.kind === 'session'
      ? (tabs.find((tab) => tab.id === focusedPanel.refId) ?? null)
      : null

  const runCommand = useCallback((terminalId: string, text: string) => {
    // The trailing carriage return is what makes the shell execute the line,
    // exactly as pressing Return inside the panel would.
    void api['terminal:write']({ id: terminalId, data: `${text}\r` })
  }, [])

  // Window-level shortcuts. Registered once; removed on unmount so a hot reload
  // can't stack duplicate handlers.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const accel = event.metaKey || event.ctrlKey
      if (!accel) return

      if (event.key === 't') {
        event.preventDefault()
        // ⇧ adds a terminal instead of a session — same slot, different content.
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
          focusPanel(target.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panels, focusedPanelId, addPanel, closePanel, focusPanel])

  return (
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
        <>
          <PanelMosaic
            panels={panels}
            layout={layout}
            focusedPanelId={focusedPanel?.id ?? null}
            home={home}
            onFocus={focusPanel}
            onClose={(panelId) => void closePanel(panelId)}
          />
          <MessageBar
            panel={focusedPanel}
            status={focusedTab?.status ?? null}
            onSendMessage={(tabId, text) => void send(tabId, text)}
            onRunCommand={runCommand}
            onInterrupt={(tabId) => void interrupt(tabId)}
          />
        </>
      )}

      {/* Status bar reflects the focused session; terminals have no equivalent. */}
      {focusedTab ? (
        <StatusBar
          tab={focusedTab}
          home={home}
          onPermissionModeChange={(mode) => void setPermissionMode(focusedTab.id, mode)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
