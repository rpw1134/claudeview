/**
 * The IPC contract between the Electron main process and the renderer.
 *
 * This module is imported by BOTH builds and owned by NEITHER. It must stay
 * dependency-free and type-only at runtime — importing the Agent SDK here would
 * drag Node-only code into the renderer bundle.
 *
 * ## Why the renderer never sees a raw SDKMessage
 *
 * `SDKMessage` is a union of ~35 variants, most of which are internal harness
 * bookkeeping (hook lifecycle, rate-limit telemetry, worker teardown, plugin
 * installs). Forwarding it verbatim would mean:
 *
 *   - every renderer component pattern-matching against harness internals,
 *   - IPC payloads far larger than what we actually render,
 *   - the UI breaking whenever the SDK adds a variant.
 *
 * Instead `MessageNormalizer` (main process) collapses that union into the small,
 * closed `StreamEvent` union below. The renderer's whole job becomes: apply event
 * to state, draw. Adding SDK support means editing one normalizer file, not the UI.
 */

/** Mirrors the SDK's `PermissionMode`. Asserted structurally in the main process. */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'auto'

/** Lifecycle of a single session, as the UI understands it. */
export type SessionStatus =
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'streaming'
  | 'tool'
  | 'idle'
  | 'error'
  | 'closed'

/**
 * Which transcript lane an event belongs to.
 *
 * The main thread is `{ id: 'main' }`. Every subagent gets its own lane keyed by
 * the `parent_tool_use_id` the SDK stamps on its messages, which is what lets the
 * UI render nested subagent transcripts in separate views instead of interleaving
 * them into one unreadable stream.
 */
export type AgentRef = {
  /** `'main'`, or the subagent's `parent_tool_use_id`. */
  id: string
  /** Subagent type name (e.g. `'Explore'`). Absent on the main thread. */
  type?: string
}

export const MAIN_AGENT: AgentRef = { id: 'main' }

/** Options accepted when opening a new tab's session. */
export type CreateSessionRequest = {
  tabId: string
  cwd?: string
  /** Resume an existing session by id. */
  resume?: string
  /** With `resume`, branch to a new session id instead of continuing in place. */
  forkSession?: boolean
  permissionMode?: PermissionMode
  model?: string
  /** First prompt to send once the session is live. */
  initialPrompt?: string
}

/** A resumable session discovered on disk via the SDK's `listSessions()`. */
export type SessionSummary = {
  sessionId: string
  title?: string
  cwd?: string
  updatedAt?: number
  messageCount?: number
}

/**
 * The normalized event stream. One closed union, ordered roughly by how hot the
 * path is — `text-delta` dominates by volume and is deliberately the smallest
 * possible shape.
 */
export type StreamEvent =
  /** Token-level text from the model. The hot path; keep this shape minimal. */
  | { kind: 'text-delta'; blockId: string; text: string; agent: AgentRef }
  /** Extended-thinking text, streamed separately so the UI can collapse it. */
  | { kind: 'thinking-delta'; blockId: string; text: string; agent: AgentRef }
  /** A content block is complete; the renderer can stop its typewriter drain. */
  | { kind: 'block-end'; blockId: string; agent: AgentRef }

  /** Session identity, emitted once from the SDK's `system/init` message. */
  | {
      kind: 'session-init'
      sessionId: string
      model: string
      cwd: string
      permissionMode: PermissionMode
      tools: string[]
      agents: string[]
    }
  | { kind: 'status'; status: SessionStatus; detail?: string }

  /** Tool call lifecycle. `input` is pre-truncated in main to bound payload size. */
  | {
      kind: 'tool-start'
      toolUseId: string
      name: string
      input: unknown
      agent: AgentRef
    }
  | {
      kind: 'tool-end'
      toolUseId: string
      ok: boolean
      preview: string
      agent: AgentRef
    }

  /** A subagent lane opened / closed. Drives the subagent view tabs. */
  | { kind: 'agent-start'; agent: AgentRef; description?: string }
  | { kind: 'agent-end'; agent: AgentRef }

  /** Echo of a user turn, so the transcript owns the full conversation. */
  | { kind: 'user-message'; text: string; agent: AgentRef }

  /** Turn finished. Carries the cost/usage summary for the status bar. */
  | {
      kind: 'result'
      ok: boolean
      text: string
      costUsd: number
      durationMs: number
      numTurns: number
    }
  | { kind: 'error'; message: string }

/**
 * Envelope for every main -> renderer stream push.
 *
 * Events are sent in **batches**, not one per message. A fast model emits text
 * deltas faster than one per millisecond; a separate IPC round trip for each would
 * saturate the structured-clone path and starve the renderer's frame budget — the
 * exact opposite of the smooth output we want. `EventBatcher` in the main process
 * coalesces events on a frame-length timer, so the renderer receives at most one
 * message per frame regardless of how fast the model is producing tokens.
 */
export type StreamEnvelope = { tabId: string; events: StreamEvent[] }

/**
 * Renderer -> main request/response calls. Keys are the IPC channel names;
 * the tuple is [request, response]. `Api` below is derived from this so the
 * preload bridge and the main-process handlers can never drift apart.
 */
export type IpcCalls = {
  'session:create': [CreateSessionRequest, { ok: true } | { ok: false; error: string }]
  'session:send': [{ tabId: string; text: string }, void]
  'session:interrupt': [{ tabId: string }, void]
  'session:set-permission-mode': [{ tabId: string; mode: PermissionMode }, void]
  'session:set-model': [{ tabId: string; model?: string }, void]
  'session:close': [{ tabId: string }, void]
  'sessions:list': [{ cwd?: string; limit?: number }, SessionSummary[]]
  'app:pick-directory': [void, string | null]
  'app:info': [void, { cwd: string; version: string; home: string }]
}

/** Channel for main -> renderer stream pushes. */
export const STREAM_CHANNEL = 'session:event' as const

/** The shape exposed on `window.claudeview` by the preload script. */
export type Api = {
  [K in keyof IpcCalls]: IpcCalls[K][0] extends void
    ? () => Promise<IpcCalls[K][1]>
    : (payload: IpcCalls[K][0]) => Promise<IpcCalls[K][1]>
} & {
  /**
   * Subscribe to the stream. Returns an unsubscribe function — callers MUST
   * invoke it on teardown or the listener leaks for the lifetime of the window.
   */
  onStreamEvent: (handler: (envelope: StreamEnvelope) => void) => () => void
}
