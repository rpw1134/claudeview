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
  /**
   * Open a session under a caller-supplied tab id.
   *
   * Panels mint their own ref id before the session exists, so they need to say
   * which id the session should use rather than being handed one back.
   */
  openTabWithId: (
    tabId: string,
    options?: Partial<CreateSessionRequest> & { title?: string },
  ) => Promise<void>
  closeTab: (tabId: string) => Promise<void>
  setActiveTab: (tabId: string) => void
  setActiveLane: (tabId: string, laneId: string) => void
  renameTab: (tabId: string, title: string) => void

  /** Hold the unsent message, so it survives the composer being remounted. */
  setDraft: (tabId: string, draft: string, attachments?: string[]) => void
  send: (tabId: string, text: string) => Promise<void>
  /** Resend a failed turn, removing the error row it came from. */
  retry: (tabId: string, itemId: string, text: string) => Promise<void>
  /** Restart a tab's session in place after it ended or failed. */
  reconnect: (tabId: string) => Promise<void>
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
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    draft: '',
    draftAttachments: [],
    createdAt: Date.now(),
    seenBlockIds: new Set(),
    echoedTurnIds: new Set(),
  }
}

/**
 * Namespace a block id to its tab before using it as a stream-buffer key.
 *
 * Block ids come from the model's message ids, which are only unique *within* a
 * session. Two tabs resuming the same session therefore produce identical block
 * ids, and because `streamBuffers` is a single global store, both tabs would
 * append into the same buffer — the transcript renders every line twice.
 *
 * Prefixing with the tab id makes the key unique per tab, which is the level the
 * buffer store actually operates at.
 */
function bufferKeyFor(tabId: string, blockId: string): string {
  return `${tabId}::${blockId}`
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
  const echoedTurnIds = tab.echoedTurnIds
  const touched = new Set<string>()

  let status = tab.status
  let sessionId = tab.sessionId
  let cwd = tab.cwd
  let model = tab.model
  let permissionMode = tab.permissionMode
  let tools = tab.tools
  let usage = tab.usage
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
        const bufferKey = bufferKeyFor(tab.id, event.blockId)

        // The characters go to the buffer store, never into React state.
        streamBuffers.append(bufferKey, event.text)

        // Replayed transcript: paint it immediately. Running an hour of prior
        // conversation through the typewriter would be absurd.
        if (event.historical) {
          streamBuffers.finish(bufferKey)
          streamBuffers.revealAll(bufferKey)
        }

        if (!seenBlockIds.has(bufferKey)) {
          seenBlockIds.add(bufferKey)
          const lane = laneFor(event.agent.id)
          if (event.agent.type && !lane.type) lanes[lane.id] = { ...lane, type: event.agent.type }
          lanes[lane.id]!.items.push({
            kind: event.kind === 'text-delta' ? 'text' : 'thinking',
            id: bufferKey,
            blockId: bufferKey,
          } as TranscriptItem)
        }
        break
      }

      case 'block-end':
        streamBuffers.finish(bufferKeyFor(tab.id, event.blockId))
        break

      case 'user-message': {
        // Already on screen from the optimistic echo. Dropping main's copy is what
        // lets the message appear instantly without ever rendering twice.
        if (event.turnId && echoedTurnIds.has(event.turnId)) break

        if (event.turnId) echoedTurnIds.add(event.turnId)
        const lane = laneFor(event.agent.id)
        lane.items.push({ kind: 'user', id: newId(), text: event.text, turnId: event.turnId })
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

      case 'session-attached':
        // Known before the CLI reports anything, so the tab is usable (and
        // resumable) straight away. `session-init` fills in the rest later.
        if (event.sessionId) sessionId = event.sessionId
        if (event.cwd) cwd = event.cwd
        break

      case 'status':
        status = event.status
        break

      case 'result':
        // The turn is over, so nothing is still streaming. Without this a block the
        // model abandoned mid-turn keeps its caret blinking under a finished
        // answer, promising output that isn't coming.
        streamBuffers.finishAllFor(`${tab.id}::`)
        // Accumulate across turns so the status bar shows the session total, not
        // just the last turn.
        usage = {
          inputTokens: usage.inputTokens + event.usage.inputTokens,
          outputTokens: usage.outputTokens + event.usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens + event.usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens + event.usage.cacheCreationTokens,
        }
        break

      case 'error': {
        lastError = event.message
        // In the transcript, in order, rather than in a strip that only ever shows
        // the most recent failure.
        const lane = laneFor(MAIN_LANE)
        lane.items.push({
          kind: 'error',
          id: newId(),
          message: event.message,
          fatal: event.fatal === true,
        })
        break
      }
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
    cwd,
    model,
    permissionMode,
    tools,
    usage,
    lastError,
    lanes,
    laneOrder,
    seenBlockIds,
    echoedTurnIds,
  }
}

/**
 * Attach retry text to the most recent error in the main lane.
 *
 * Done as a follow-up rather than carried on the `error` event because the event
 * contract is shared with the main process, which has no idea what the renderer
 * typed — the failed text is renderer-local knowledge.
 */
function withRetryText(tab: Tab, text: string): Tab {
  const lane = tab.lanes[MAIN_LANE]
  if (!lane) return tab

  const index = lane.items.findLastIndex((item) => item.kind === 'error')
  if (index === -1) return tab

  const items = [...lane.items]
  items[index] = { ...(items[index] as Extract<TranscriptItem, { kind: 'error' }>), retryText: text }
  return { ...tab, lanes: { ...tab.lanes, [MAIN_LANE]: { ...lane, items } } }
}

/** Drop one item from the main lane, for dismissing a resolved error. */
function withoutItem(tab: Tab, itemId: string): Tab {
  const lane = tab.lanes[MAIN_LANE]
  if (!lane) return tab
  return {
    ...tab,
    lanes: {
      ...tab.lanes,
      [MAIN_LANE]: { ...lane, items: lane.items.filter((item) => item.id !== itemId) },
    },
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
    await getState().openTabWithId(tabId, options)
    return tabId
  },

  openTabWithId: async (tabId, options = {}) => {
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

  /**
   * Send a turn, showing it immediately.
   *
   * The message and the "thinking" state are applied **locally, first**, then the
   * IPC call goes out. Waiting for main to echo the message back cost a measured
   * ~150ms of nothing-happening after Enter — small in isolation, but it's the very
   * first frame of every interaction, and it read as the app being slow to react.
   *
   * The echo is not a guess about what main will do: `turnId` ties the two together
   * so main's copy is dropped rather than duplicated, and a rejected send turns the
   * optimistic state into a visible failure with the text preserved for retry.
   * Optimism that can't be walked back is just a lie.
   */
  setDraft: (tabId, draft, attachments) =>
    setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, draft, draftAttachments: attachments ?? tab.draftAttachments }
          : tab,
      ),
    })),

  send: async (tabId, text) => {
    if (!text.trim()) return

    const turnId = newId()
    // Clearing the draft is part of sending, so the two can't disagree.
    getState().setDraft(tabId, '', [])
    getState().applyEvents(tabId, [
      { kind: 'user-message', text, agent: { id: MAIN_LANE }, turnId },
      { kind: 'status', status: 'thinking' },
    ])

    let response: { ok: boolean; error?: string }
    try {
      response = await api['session:send']({ tabId, text, turnId })
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    if (!response.ok) {
      getState().applyEvents(tabId, [
        { kind: 'error', message: response.error ?? 'The message could not be sent.' },
        { kind: 'status', status: 'error' },
      ])
      // Attach the text to the error row so it can be resent with one click
      // instead of being retyped.
      setState((state) => ({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? withRetryText(tab, text) : tab)),
      }))
    }
  },

  /** Resend a turn that failed, clearing the error row it came from. */
  retry: async (tabId, itemId, text) => {
    setState((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? withoutItem(tab, itemId) : tab)),
    }))
    await getState().send(tabId, text)
  },

  /**
   * Restart a dead session in the same tab.
   *
   * A session can end for reasons the user didn't ask for — the subprocess exits,
   * the machine sleeps, something upstream fails. Before this existed, the tab just
   * went permanently grey: the composer disabled, no explanation, no way back
   * short of closing the tab and losing the thread. A dead end with no recovery is
   * a bug even when the underlying failure is legitimate.
   *
   * The transcript is cleared first because resuming re-hydrates the stored history;
   * keeping the old items would render everything twice.
   */
  reconnect: async (tabId) => {
    const tab = getState().tabs.find((entry) => entry.id === tabId)
    if (!tab) return

    const blockIds: string[] = []
    for (const lane of Object.values(tab.lanes)) {
      for (const item of lane.items) {
        if (item.kind === 'text' || item.kind === 'thinking') blockIds.push(item.blockId)
      }
    }
    streamBuffers.release(blockIds)

    setState((state) => ({
      tabs: state.tabs.map((entry) =>
        entry.id === tabId
          ? {
              ...entry,
              status: 'starting' as const,
              lastError: undefined,
              lanes: { [MAIN_LANE]: { id: MAIN_LANE, closed: false, items: [] } },
              laneOrder: [MAIN_LANE],
              activeLaneId: MAIN_LANE,
              seenBlockIds: new Set<string>(),
              echoedTurnIds: new Set<string>(),
            }
          : entry,
      ),
    }))

    // `resume` is undefined when the session never got far enough to be assigned
    // an id, which correctly starts a fresh one instead of failing.
    const response = await api['session:create']({
      tabId,
      cwd: tab.cwd,
      resume: tab.sessionId,
      permissionMode: tab.permissionMode,
    })

    if (!response.ok) {
      getState().applyEvents(tabId, [
        { kind: 'error', message: response.error },
        { kind: 'status', status: 'error' },
      ])
    }
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
