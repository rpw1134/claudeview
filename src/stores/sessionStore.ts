import { create } from 'zustand'
import type { CreateSessionRequest, PermissionMode, StreamEvent } from '@shared/ipc'
import type { Lane, PersistedTab, Tab, TranscriptItem } from '@/types/session'
import { streamBuffers } from '@/lib/streamBuffers'
import { api } from '@/lib/api'

const PERSIST_KEY = 'claudeview.tabs.v1'
const MAIN_LANE = 'main'
/** Cap on items per lane. A multi-hour session would otherwise grow without bound. */
const MAX_ITEMS_PER_LANE = 1200

type SessionState = {
  tabs: Tab[]
  activeTabId: string | null

  openTab: (options?: Partial<CreateSessionRequest> & { title?: string }) => Promise<string>
  closeTab: (tabId: string) => Promise<void>
  setActiveTab: (tabId: string) => void
  setActiveLane: (tabId: string, laneId: string) => void
  renameTab: (tabId: string, title: string) => void

  send: (tabId: string, text: string) => Promise<void>
  interrupt: (tabId: string) => Promise<void>
  setPermissionMode: (tabId: string, mode: PermissionMode) => Promise<void>

  /** Apply one IPC batch. The only path that mutates transcript state. */
  applyEvents: (tabId: string, events: StreamEvent[]) => void

  /** Recreate tabs from localStorage, resuming their sessions. */
  restore: () => Promise<void>
}

function newId(): string {
  return crypto.randomUUID()
}

function emptyTab(id: string, options: Partial<CreateSessionRequest> & { title?: string }): Tab {
  return {
    id,
    title: options.title ?? 'New session',
    cwd: options.cwd,
    status: 'starting',
    permissionMode: options.permissionMode ?? 'auto',
    tools: [],
    lanes: { [MAIN_LANE]: { id: MAIN_LANE, closed: false, items: [] } },
    laneOrder: [MAIN_LANE],
    activeLaneId: MAIN_LANE,
    totalCostUsd: 0,
    createdAt: Date.now(),
    seenBlockIds: new Set(),
  }
}

/** Trim the oldest items and release their stream buffers. */
function trimLane(lane: Lane): Lane {
  if (lane.items.length <= MAX_ITEMS_PER_LANE) return lane

  const overflow = lane.items.length - MAX_ITEMS_PER_LANE
  const dropped = lane.items.slice(0, overflow)

  // Releasing here is what prevents the text of trimmed messages from being
  // retained forever in the buffer store.
  streamBuffers.release(
    dropped
      .filter((item) => item.kind === 'text' || item.kind === 'thinking')
      .map((item) => (item as { blockId: string }).blockId),
  )

  return { ...lane, items: lane.items.slice(overflow) }
}

/**
 * Fold one batch of events into a tab.
 *
 * Written as a single pass over a shallow working copy rather than a chain of
 * immutable updates: a batch can carry a hundred events, and allocating a fresh
 * nested object graph per event would defeat the batching entirely. The tab object
 * returned is new (so React sees the change), but intermediate steps mutate the
 * working copy.
 */
function reduceTab(tab: Tab, events: StreamEvent[]): Tab {
  const lanes: Record<string, Lane> = { ...tab.lanes }
  const laneOrder = [...tab.laneOrder]
  const seenBlockIds = tab.seenBlockIds
  const touched = new Set<string>()

  let status = tab.status
  let sessionId = tab.sessionId
  let model = tab.model
  let permissionMode = tab.permissionMode
  let tools = tab.tools
  let totalCostUsd = tab.totalCostUsd
  let lastError = tab.lastError
  let title = tab.title

  const laneFor = (laneId: string): Lane => {
    let lane = lanes[laneId]
    if (!lane) {
      lane = { id: laneId, closed: false, items: [] }
      lanes[laneId] = lane
      if (!laneOrder.includes(laneId)) laneOrder.push(laneId)
    }
    if (!touched.has(laneId)) {
      // Copy-on-first-write: only lanes actually changed by this batch get a new
      // array, so untouched lanes keep referential identity and skip re-render.
      lane = { ...lane, items: [...lane.items] }
      lanes[laneId] = lane
      touched.add(laneId)
    }
    return lane
  }

  for (const event of events) {
    switch (event.kind) {
      case 'text-delta':
      case 'thinking-delta': {
        // The characters go to the buffer store, never into React state.
        streamBuffers.append(event.blockId, event.text)

        if (!seenBlockIds.has(event.blockId)) {
          seenBlockIds.add(event.blockId)
          const lane = laneFor(event.agent.id)
          if (event.agent.type && !lane.type) lanes[lane.id] = { ...lane, type: event.agent.type }
          lanes[lane.id]!.items.push({
            kind: event.kind === 'text-delta' ? 'text' : 'thinking',
            id: event.blockId,
            blockId: event.blockId,
          } as TranscriptItem)
        }
        break
      }

      case 'block-end':
        streamBuffers.finish(event.blockId)
        break

      case 'user-message': {
        const lane = laneFor(event.agent.id)
        lane.items.push({ kind: 'user', id: newId(), text: event.text })
        // First user turn names the tab, so the tab strip is readable at a glance.
        if (title === 'New session' && event.agent.id === MAIN_LANE) {
          title = event.text.replace(/\s+/g, ' ').trim().slice(0, 48) || title
        }
        break
      }

      case 'tool-start': {
        const lane = laneFor(event.agent.id)
        lane.items.push({
          kind: 'tool',
          id: event.toolUseId,
          toolUseId: event.toolUseId,
          name: event.name,
          input: event.input,
          status: 'running',
        })
        break
      }

      case 'tool-end': {
        const lane = laneFor(event.agent.id)
        const index = lane.items.findIndex(
          (item) => item.kind === 'tool' && item.toolUseId === event.toolUseId,
        )
        if (index !== -1) {
          const existing = lane.items[index] as Extract<TranscriptItem, { kind: 'tool' }>
          lane.items[index] = {
            ...existing,
            status: event.ok ? 'ok' : 'error',
            preview: event.preview,
          }
        }
        break
      }

      case 'agent-start': {
        const lane = laneFor(event.agent.id)
        lanes[lane.id] = {
          ...lane,
          type: event.agent.type ?? lane.type,
          description: event.description ?? lane.description,
          closed: false,
        }
        // Link the spawning tool call to its lane so the UI can offer "open".
        const mainLane = laneFor(MAIN_LANE)
        const toolIndex = mainLane.items.findIndex(
          (item) => item.kind === 'tool' && item.toolUseId === event.agent.id,
        )
        if (toolIndex !== -1) {
          const tool = mainLane.items[toolIndex] as Extract<TranscriptItem, { kind: 'tool' }>
          mainLane.items[toolIndex] = { ...tool, spawnedLaneId: event.agent.id }
        }
        break
      }

      case 'agent-end': {
        const lane = laneFor(event.agent.id)
        lanes[lane.id] = { ...lane, closed: true }
        break
      }

      case 'session-init':
        sessionId = event.sessionId
        model = event.model
        permissionMode = event.permissionMode
        tools = event.tools
        break

      case 'status':
        status = event.status
        break

      case 'result':
        totalCostUsd += event.costUsd
        break

      case 'error':
        lastError = event.message
        break
    }
  }

  for (const laneId of touched) {
    lanes[laneId] = trimLane(lanes[laneId]!)
  }

  return {
    ...tab,
    title,
    status,
    sessionId,
    model,
    permissionMode,
    tools,
    totalCostUsd,
    lastError,
    lanes,
    laneOrder,
    seenBlockIds,
  }
}

/** Persist only identity — transcripts are re-fetched by resuming the session. */
function persistTabs(tabs: Tab[]): void {
  const payload: PersistedTab[] = tabs
    .filter((tab) => tab.sessionId)
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      cwd: tab.cwd,
      sessionId: tab.sessionId,
      createdAt: tab.createdAt,
    }))
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(payload))
  } catch {
    // A full or disabled localStorage must not take the app down.
  }
}

function loadPersistedTabs(): PersistedTab[] {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PersistedTab[]) : []
  } catch {
    return []
  }
}

export const useSessionStore = create<SessionState>()((setState, getState) => ({
  tabs: [],
  activeTabId: null,

  openTab: async (options = {}) => {
    const tabId = newId()
    setState((state) => ({
      tabs: [...state.tabs, emptyTab(tabId, options)],
      activeTabId: tabId,
    }))

    const response = await api['session:create']({
      tabId,
      cwd: options.cwd,
      resume: options.resume,
      forkSession: options.forkSession,
      permissionMode: options.permissionMode ?? 'auto',
      model: options.model,
      initialPrompt: options.initialPrompt,
    })

    if (!response.ok) {
      getState().applyEvents(tabId, [
        { kind: 'error', message: response.error },
        { kind: 'status', status: 'error' },
      ])
    }
    return tabId
  },

  closeTab: async (tabId) => {
    const tab = getState().tabs.find((entry) => entry.id === tabId)

    // Free buffered text before dropping the tab; once the tab is gone there is no
    // longer any record of which block ids belonged to it.
    if (tab) {
      const blockIds: string[] = []
      for (const lane of Object.values(tab.lanes)) {
        for (const item of lane.items) {
          if (item.kind === 'text' || item.kind === 'thinking') blockIds.push(item.blockId)
        }
      }
      streamBuffers.release(blockIds)
    }

    setState((state) => {
      const tabs = state.tabs.filter((entry) => entry.id !== tabId)
      const activeTabId =
        state.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId
      persistTabs(tabs)
      return { tabs, activeTabId }
    })

    await api['session:close']({ tabId })
  },

  setActiveTab: (tabId) => setState({ activeTabId: tabId }),

  setActiveLane: (tabId, laneId) =>
    setState((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeLaneId: laneId } : tab)),
    })),

  renameTab: (tabId, title) =>
    setState((state) => {
      const tabs = state.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab))
      persistTabs(tabs)
      return { tabs }
    }),

  send: async (tabId, text) => {
    if (!text.trim()) return
    await api['session:send']({ tabId, text })
  },

  interrupt: async (tabId) => {
    await api['session:interrupt']({ tabId })
  },

  setPermissionMode: async (tabId, mode) => {
    setState((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, permissionMode: mode } : tab)),
    }))
    await api['session:set-permission-mode']({ tabId, mode })
  },

  applyEvents: (tabId, events) => {
    setState((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId)
      // Events for an unknown tab are normal during teardown; drop them silently.
      if (index === -1) return state

      const tabs = [...state.tabs]
      const previous = tabs[index]!
      const next = reduceTab(previous, events)
      tabs[index] = next

      // Persist only when identity actually changed, not on every text batch.
      if (next.sessionId !== previous.sessionId || next.title !== previous.title) {
        persistTabs(tabs)
      }
      return { tabs }
    })
  },

  restore: async () => {
    const persisted = loadPersistedTabs()
    if (persisted.length === 0) return

    for (const entry of persisted) {
      await getState().openTab({
        title: entry.title,
        cwd: entry.cwd,
        resume: entry.sessionId,
      })
    }
  },
}))

/** Selector helper: the currently focused tab, or null. */
export function selectActiveTab(state: SessionState): Tab | null {
  if (!state.activeTabId) return null
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
}
