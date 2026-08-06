import type { PermissionMode, SessionStatus } from '@shared/ipc'

/**
 * The renderer's transcript model.
 *
 * Note what is **not** here: the text of assistant messages. A `text` item stores
 * only its `blockId`; the characters live in `streamBuffers` (see
 * `src/lib/streamBuffers.ts`).
 *
 * That split is deliberate. Text arrives dozens of times per second, while
 * structure changes only when a block, tool call, or turn begins or ends. Keeping
 * text out of React state means the per-frame update path touches one subscribed
 * component instead of producing a new store snapshot — and a store snapshot means
 * every `useStore` selector in the app re-evaluates.
 */
export type TranscriptItem =
  | { kind: 'text'; id: string; blockId: string }
  | { kind: 'thinking'; id: string; blockId: string }
  | { kind: 'user'; id: string; text: string; turnId?: string }
  /**
   * A failure, in the place it happened.
   *
   * Errors used to live in a single `lastError` field rendered as a strip above the
   * composer, which lost both the ordering (which message failed?) and the history
   * (a second error overwrote the first). As an item it sits where it occurred, and
   * a failed send can offer to resend exactly the text that didn't go.
   */
  | { kind: 'error'; id: string; message: string; fatal: boolean; retryText?: string }
  | {
      kind: 'tool'
      id: string
      toolUseId: string
      name: string
      input: unknown
      status: 'running' | 'ok' | 'error'
      preview?: string
      /** Set when this tool call spawned a subagent, to link to that lane. */
      spawnedLaneId?: string
    }

/**
 * One transcript view. The main thread is lane `'main'`; each subagent gets its
 * own lane so its output can be read on its own instead of interleaved.
 */
export type Lane = {
  id: string
  /** Subagent type (e.g. `'Explore'`). Absent on the main lane. */
  type?: string
  description?: string
  /** True once the subagent finished. */
  closed: boolean
  items: TranscriptItem[]
}

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export type Tab = {
  id: string
  title: string
  cwd?: string
  /** Assigned by the SDK once the session starts; needed to resume. */
  sessionId?: string
  status: SessionStatus
  model?: string
  permissionMode: PermissionMode
  tools: string[]
  lanes: Record<string, Lane>
  /** Lane render order; `'main'` is always first. */
  laneOrder: string[]
  activeLaneId: string
  /** Cumulative token usage for the session, summed across turns. */
  usage: TokenUsage
  lastError?: string
  /**
   * The unsent message, and anything attached to it.
   *
   * Lives on the tab rather than in the composer's own state because a composer
   * **unmounts whenever the layout tree changes shape** — opening a panel wraps its
   * sibling in a new split, which remounts that subtree. Component state took a
   * half-written message down with it, which is a data-loss bug however small the
   * component. A draft belongs to the conversation, not to the widget currently
   * displaying it.
   */
  draft: string
  draftAttachments: string[]
  createdAt: number
  /** Block ids already materialized as items, so a delta doesn't re-create one. */
  seenBlockIds: Set<string>
  /**
   * Turn ids the renderer has already echoed optimistically. Main's echo of the
   * same turn is dropped, so the message renders once — at 0ms rather than after
   * the IPC round trip.
   */
  echoedTurnIds: Set<string>
}

/** The slice of a tab persisted to localStorage so sessions survive a restart. */
export type PersistedTab = {
  id: string
  title: string
  cwd?: string
  sessionId?: string
  createdAt: number
}
