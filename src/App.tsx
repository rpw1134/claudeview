import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { useStreamBridge } from '@/hooks/useStreamBridge'
import { api } from '@/lib/api'
import { TabStrip } from '@/components/TabStrip'
import { LaneTabs } from '@/components/LaneTabs'
import { Transcript } from '@/components/Transcript'
import { Composer } from '@/components/Composer'
import { StatusBar } from '@/components/StatusBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { NewSessionPanel } from '@/components/NewSessionPanel'

export function App() {
  // One IPC subscription for the whole app. See the hook for why it must be here.
  useStreamBridge()

  const tabs = useSessionStore((state) => state.tabs)
  const activeTabId = useSessionStore((state) => state.activeTabId)
  const {
    openTab,
    closeTab,
    setActiveTab,
    setActiveLane,
    send,
    interrupt,
    setPermissionMode,
    reconnect,
  } = useSessionStore.getState()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [home, setHome] = useState<string | undefined>()

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null

  useEffect(() => {
    api['app:info']()
      .then((info) => setHome(info.home))
      .catch(() => undefined)
  }, [])

  const startSession = useCallback(
    (options: { cwd?: string; resume?: string; title?: string }) => {
      void openTab(options)
    },
    [openTab],
  )

  // Window-level shortcuts. Registered once; removed on unmount so a hot reload in
  // development can't stack duplicate handlers.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const accel = event.metaKey || event.ctrlKey
      if (!accel) return

      if (event.key === 't') {
        event.preventDefault()
        void openTab({})
      } else if (event.key === 'w' && activeTabId) {
        event.preventDefault()
        void closeTab(activeTabId)
      } else if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1
        const target = tabs[index]
        if (target) {
          event.preventDefault()
          setActiveTab(target.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, activeTabId, openTab, closeTab, setActiveTab])

  const activeLane = activeTab ? activeTab.lanes[activeTab.activeLaneId] : undefined

  return (
    <div className="flex h-full flex-col bg-bg">
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={(tabId) => void closeTab(tabId)}
        onNew={() => void openTab({})}
      />

      {activeTab && activeLane ? (
        <>
          <LaneTabs tab={activeTab} onSelect={(laneId) => setActiveLane(activeTab.id, laneId)} />
          <Transcript
            // Remounting per lane resets scroll position, which is what you want
            // when switching between two independent transcripts.
            key={`${activeTab.id}:${activeLane.id}`}
            lane={activeLane}
            onOpenLane={(laneId) => setActiveLane(activeTab.id, laneId)}
          />
          <Composer
            status={activeTab.status}
            error={activeTab.lastError}
            onSend={(text) => void send(activeTab.id, text)}
            onInterrupt={() => void interrupt(activeTab.id)}
            onReconnect={() => void reconnect(activeTab.id)}
          />
          <StatusBar
            tab={activeTab}
            home={home}
            onPermissionModeChange={(mode) => void setPermissionMode(activeTab.id, mode)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </>
      ) : (
        <NewSessionPanel home={home} onStart={startSession} />
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
