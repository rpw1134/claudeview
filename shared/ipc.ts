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

/**
 * What a session is doing, as the UI understands it.
 *
 * These are **turn** states, not session-lifecycle states, and the distinction is
 * load-bearing. There used to be a `'ready'` here, emitted from `system/init` to
 * mean "the CLI is up". Because init lands immediately after the first user
 * message — the CLI is silent until then — `'ready'` overwrote the `'thinking'`
 * that `send()` had just set, in the *same* 16ms batch. React therefore never
 * rendered `'thinking'` at all, and the UI sat visibly dead from the moment you
 * pressed Enter until the model's first token: measured at 1173ms on a first
 * message, and indefinitely on turns that were slower to start.
 *
 * The fix isn't ordering, it's that session lifecycle and turn activity are
 * different axes and must not share one field. `system/init` now reports identity
 * only, and this union describes the turn.
 */
export type SessionStatus =
  /** Subprocess coming up; no session yet. */
  | 'starting'
  /** Attached, nothing in flight. */
  | 'idle'
  /** A turn is underway but the model hasn't produced anything renderable yet. */
  | 'thinking'
  /** Producing visible text. */
  | 'streaming'
  /** Running a tool. */
  | 'tool'
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
  /**
   * Token-level text from the model. The hot path; keep this shape minimal.
   *
   * `historical` marks text replayed from a resumed session's transcript rather
   * than arriving live. The renderer reveals those instantly instead of running
   * them through the typewriter — nobody wants to watch an hour of prior
   * conversation type itself back in.
   */
  | { kind: 'text-delta'; blockId: string; text: string; agent: AgentRef; historical?: true }
  /** Extended-thinking text, streamed separately so the UI can collapse it. */
  | { kind: 'thinking-delta'; blockId: string; text: string; agent: AgentRef; historical?: true }
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
  /**
   * Emitted as soon as the subprocess is up, before the CLI has reported anything.
   *
   * This exists because the CLI is **silent until it receives a first user
   * message** — it does not emit `system/init` on spawn. Waiting for `session-init`
   * to leave the "starting" state therefore leaves a freshly opened or resumed tab
   * stuck on "Starting…" indefinitely. This event says "the process is up and ready
   * for input"; `session-init` later fills in model and tool details.
   */
  | { kind: 'session-attached'; sessionId?: string; cwd?: string }
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

  /**
   * Echo of a user turn, so the transcript owns the full conversation.
   *
   * `turnId` is present when the renderer originated the turn, and is the id it
   * already used for its own optimistic echo. The reducer drops any echo whose
   * `turnId` it has seen, so the message appears at 0ms instead of after an IPC
   * round trip (measured at ~150ms) without ever rendering twice.
   *
   * Echoes still arrive without a `turnId` for turns the renderer didn't start —
   * an `initialPrompt`, or a replayed transcript — and those are kept.
   */
  | { kind: 'user-message'; text: string; agent: AgentRef; turnId?: string }

  /** Turn finished. Carries the usage summary for the status bar. */
  | {
      kind: 'result'
      ok: boolean
      text: string
      durationMs: number
      numTurns: number
      /**
       * Token usage for the turn. Cache reads are separated because they dominate
       * the input count in an agentic loop and are billed differently — lumping
       * them in makes the input figure look alarming and mean nothing.
       */
      usage: {
        inputTokens: number
        outputTokens: number
        cacheReadTokens: number
        cacheCreationTokens: number
      }
    }
  /**
   * Something went wrong. `fatal` distinguishes the two cases the UI must handle
   * differently: a turn that failed but left the session usable (retry the
   * message) from a session that is gone (reconnect). Conflating them is what
   * produced the old dead end — a greyed-out composer with no way back.
   */
  | { kind: 'error'; message: string; fatal?: boolean; turnId?: string }

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
export type StreamEnvelope = {
  tabId: string
  events: StreamEvent[]
  /**
   * Monotonic sequence number, unique across the whole main process.
   *
   * The renderer drops any envelope whose `seq` it has already applied. Without
   * this, a duplicated subscription — two `ipcRenderer.on` listeners on the stream
   * channel, which is easy to end up with across HMR reloads — applies every batch
   * twice, and because text deltas are *appended* to a buffer that renders the
   * transcript twice over.
   *
   * Making application idempotent fixes the symptom at the point where correctness
   * actually matters, independently of how a duplicate got delivered.
   */
  seq: number
}

/**
 * Renderer -> main request/response calls. Keys are the IPC channel names;
 * the tuple is [request, response]. `Api` below is derived from this so the
 * preload bridge and the main-process handlers can never drift apart.
 */
export type IpcCalls = {
  'session:create': [CreateSessionRequest, { ok: true } | { ok: false; error: string }]
  /** `turnId` lets the renderer's optimistic echo be de-duplicated against main's. */
  'session:send': [{ tabId: string; text: string; turnId?: string }, { ok: boolean; error?: string }]
  'session:interrupt': [{ tabId: string }, void]
  'session:set-permission-mode': [{ tabId: string; mode: PermissionMode }, void]
  'session:set-model': [{ tabId: string; model?: string }, void]
  'session:close': [{ tabId: string }, void]
  'sessions:list': [{ cwd?: string; limit?: number }, SessionSummary[]]
  'app:pick-directory': [void, string | null]
  /**
   * Choose files or folders to attach to a message. Returns absolute paths.
   *
   * The renderer never reads the files — it only passes paths to the agent, which
   * has its own filesystem tools and its own permission model. Sending contents
   * across IPC would duplicate that for no benefit and put arbitrary file bytes
   * through the renderer, which renders untrusted markdown.
   */
  'app:pick-attachments': [{ directories?: boolean }, string[]]

  'terminal:create': [{ id: string; cwd?: string; cols?: number; rows?: number }, void]
  'terminal:write': [{ id: string; data: string }, void]
  'terminal:resize': [{ id: string; cols: number; rows: number }, void]
  'terminal:close': [{ id: string }, void]
  /**
   * Retained output plus the seq it covers, for replay when a panel mounts.
   * Live events at or below that seq must be ignored, or they render twice.
   */
  'terminal:snapshot': [{ id: string }, { scrollback: string; seq: number }]
  'app:info': [void, { cwd: string; version: string; home: string }]

  /**
   * Claude Code config management (agents, skills, hooks) for a scope.
   *
   * `projectPath` is `~/.claude` for the global scope or a project directory;
   * main resolves it through one validated helper, so the renderer can never
   * name an arbitrary file — only agents/skills/hooks inside a config dir.
   * File contents cross as raw strings; structure (frontmatter) is parsed on
   * whichever side needs it via `shared/frontmatter.ts`.
   */
  'config:projects:list': [void, ConfigProject[]]
  'config:agents:list': [{ projectPath: string }, string[]]
  'config:agents:get': [{ projectPath: string; name: string }, string | null]
  'config:agents:set': [{ projectPath: string; name: string; content: string }, void]
  'config:agents:create': [
    { projectPath: string; name: string; content: string },
    { ok: boolean; error?: string },
  ]
  'config:agents:delete': [{ projectPath: string; name: string }, void]
  'config:skills:list': [{ projectPath: string }, string[]]
  'config:skills:create': [{ projectPath: string; name: string }, { ok: boolean; error?: string }]
  'config:skills:delete': [{ projectPath: string; name: string }, void]
  'config:skills:files': [{ projectPath: string; name: string }, SkillFiles]
  /** `file` is relative to the skill dir, e.g. `SKILL.md` or `scripts/run.sh`. */
  'config:skills:read': [{ projectPath: string; name: string; file: string }, string | null]
  'config:skills:write': [
    { projectPath: string; name: string; file: string; content: string },
    void,
  ]
  'config:skills:delete-file': [{ projectPath: string; name: string; file: string }, void]
  'config:hooks:get': [{ projectPath: string }, HooksConfig]
  'config:hooks:set': [{ projectPath: string; hooks: HooksConfig }, void]
}

/**
 * A config scope: `~/.claude` itself (global, shown as "Global") or a project
 * directory whose config lives in `<path>/.claude`. Mirrors how the CLI scopes
 * agents, skills, and settings.
 */
export type ConfigProject = { path: string; name: string }

/** A skill directory's contents: markdown companions and `scripts/` entries. */
export type SkillFiles = { files: string[]; scripts: string[] }

/**
 * The `hooks` key of settings.json. Kept deliberately loose — event names map to
 * arrays of matcher groups whose shape the UI edits but never fully owns, so
 * fields this app doesn't know about survive a round-trip.
 */
export type HooksConfig = Record<string, unknown[]>

/** Channel for main -> renderer session stream pushes. */
export const STREAM_CHANNEL = 'session:event' as const

/** Channel for main -> renderer terminal output. */
export const TERMINAL_CHANNEL = 'terminal:event' as const

/**
 * Terminal output and lifecycle. Carries the same monotonic `seq` as session
 * envelopes, for the same reason: duplicate delivery must not double the output.
 */
export type TerminalEnvelope = { seq: number } & (
  | { kind: 'data'; id: string; data: string }
  | { kind: 'exit'; id: string; exitCode: number }
)

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
  /** Same contract as `onStreamEvent`: the returned function MUST be called. */
  onTerminalEvent: (handler: (envelope: TerminalEnvelope) => void) => () => void
  /**
   * Absolute paths for files dropped onto the window.
   *
   * A dropped `File` no longer carries `.path` — Electron removed it in v32 to stop
   * a compromised renderer reading arbitrary disk locations out of a drop. The path
   * now has to be requested explicitly from the preload bridge, which is the whole
   * point: the renderer receives paths only for files the user physically dropped.
   */
  resolveDroppedPaths: (files: File[]) => string[]
}
