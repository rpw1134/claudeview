// Loaded via ../sdk rather than directly — a static ESM import of the Agent SDK
// deadlocks Electron's main process. See electron/main/sdk.ts for the details.
import {
  getSessionMessages,
  getSubagentMessages,
  query,
  type Options,
  type Query,
  type SDKUserMessage,
  type SessionMessage,
} from '../sdk'
import type { CreateSessionRequest, PermissionMode, StreamEvent } from '../../../shared/ipc'
import { AsyncMessageQueue } from './AsyncMessageQueue'
import { EventBatcher } from './EventBatcher'
import { MessageNormalizer } from './MessageNormalizer'
import { listSubagentLanes } from './subagentTranscripts'

/**
 * Compile-time check that our hand-written `PermissionMode` still matches the
 * SDK's. `shared/ipc.ts` can't import the SDK (it's shared with the renderer), so
 * this is where the two are reconciled. If the SDK adds a mode, this fails to
 * typecheck here rather than silently at runtime in the UI.
 */
type SdkPermissionMode = NonNullable<Options['permissionMode']>
const _permissionModesMatch: PermissionMode extends SdkPermissionMode
  ? SdkPermissionMode extends PermissionMode
    ? true
    : never
  : never = true
void _permissionModesMatch

export type SessionRunnerDeps = {
  /** Push a batch of events toward the renderer. Owned by SessionManager. */
  emit: (events: StreamEvent[]) => void
  /** Called once when the SDK reports the session id, so it can be persisted. */
  onSessionId: (sessionId: string) => void
}

/**
 * Owns exactly one Claude Code session: one `query()` call, one CLI subprocess,
 * one conversation.
 *
 * ## Lifecycle
 *
 * `start()` kicks off a detached consume loop that runs for the life of the
 * session. It exits when (a) the input queue closes, (b) the abort signal fires,
 * or (c) the SDK throws. All three funnel into the same `finalize()` path, so
 * there is exactly one place where cleanup happens.
 *
 * ## Why cleanup is load-bearing
 *
 * Each live session is an OS subprocess. Getting teardown wrong doesn't cost a few
 * kilobytes of JS heap — it strands a `claude` process per closed tab. Every exit
 * path therefore runs the same three steps in the same order: close the input queue
 * (lets the iterator return), abort the controller (interrupts an in-flight turn),
 * then drop the emit callback (so nothing can post to a destroyed WebContents).
 */
export class SessionRunner {
  /** Upper bound on replayed transcript messages when resuming. */
  private static readonly MAX_HISTORY_MESSAGES = 400

  readonly tabId: string

  private readonly queue = new AsyncMessageQueue<SDKUserMessage>()
  private readonly abort = new AbortController()
  private readonly normalizer = new MessageNormalizer()
  private readonly batcher: EventBatcher
  private readonly request: CreateSessionRequest
  private readonly onSessionId: (sessionId: string) => void

  private handle: Query | null = null
  private loop: Promise<void> | null = null
  private disposed = false
  private sessionId: string | null = null

  constructor(request: CreateSessionRequest, deps: SessionRunnerDeps) {
    this.tabId = request.tabId
    this.request = request
    this.onSessionId = deps.onSessionId
    this.batcher = new EventBatcher(deps.emit)
  }

  /** Begin the session. Returns immediately; the consume loop runs detached. */
  start(): void {
    if (this.handle || this.disposed) return

    this.push({ kind: 'status', status: 'starting' })

    try {
      this.handle = query({ prompt: this.queue, options: this.buildOptions() })
    } catch (error) {
      this.push({ kind: 'error', message: describeError(error) })
      this.push({ kind: 'status', status: 'error' })
      return
    }

    if (this.request.initialPrompt) this.send(this.request.initialPrompt)

    this.loop = this.consume()
    void this.attach()
  }

  /**
   * Bring the tab to a usable state without waiting on the CLI.
   *
   * The CLI emits **nothing at all** — not even `system/init` — until it receives a
   * first user message. Verified on both new and resumed sessions: 14s and 20s of
   * silence respectively with no input sent. So a tab that waits for `session-init`
   * before leaving "Starting…" waits forever.
   *
   * This does the two things the CLI won't do for us: replay the stored transcript
   * on a resume, and declare the session ready for input.
   */
  private async attach(): Promise<void> {
    if (this.request.resume) {
      await this.hydrateHistory(this.request.resume)

      if (!this.disposed) {
        this.push({
          kind: 'session-attached',
          sessionId: this.request.resume,
          cwd: this.request.cwd,
        })
        // Record the id now so a tab closed before its first message is still
        // resumable. A fork gets a *new* id from `session-init`, so don't claim
        // the source id as this tab's own in that case.
        if (!this.request.forkSession) {
          this.sessionId = this.request.resume
          this.onSessionId(this.request.resume)
        }
      }
    } else if (!this.disposed) {
      this.push({ kind: 'session-attached', cwd: this.request.cwd })
    }

    // If an initial prompt was queued, a turn is already underway — leave the
    // status alone rather than overwriting "thinking" with "idle".
    if (!this.disposed && !this.request.initialPrompt) {
      this.push({ kind: 'status', status: 'idle' })
    }
  }

  /** Load and replay a resumed session's stored transcript. */
  private async hydrateHistory(sessionId: string): Promise<void> {
    try {
      const stored = await getSessionMessages(sessionId, { dir: this.request.cwd })
      if (this.disposed) return

      if (stored.length > 0) {
        const events = this.normalizer.normalizeHistory(this.tail(stored))
        if (events.length > 0) this.batcher.add(events)
      }
    } catch (error) {
      // A missing or unreadable transcript must not block the session — the user
      // can still continue the conversation, just without visible scrollback.
      this.push({
        kind: 'error',
        message: `Could not load previous messages: ${describeError(error)}`,
      })
    }

    await this.hydrateSubagents(sessionId)
  }

  /**
   * Replay each subagent's transcript into its own lane.
   *
   * Separate from the main replay because subagent conversations live in separate
   * transcript files — `getSessionMessages()` returns the main thread only. Without
   * this, resuming a session that had used subagents showed their Task rows in the
   * main transcript with an "Open" button leading to an empty lane: the work was
   * visibly referenced and not visibly there.
   *
   * Failures here are swallowed rather than surfaced. The main conversation has
   * already replayed by this point, and a missing subagent transcript is a gap in
   * supporting detail — not something worth putting an error row in front of.
   */
  private async hydrateSubagents(sessionId: string): Promise<void> {
    let lanes
    try {
      lanes = await listSubagentLanes(sessionId, this.request.cwd)
    } catch {
      return
    }
    if (this.disposed || lanes.length === 0) return

    for (const lane of lanes) {
      if (this.disposed) return

      // Prefer the spawning tool call's id: it's what the live path uses, so the
      // Task row in the main transcript links straight to this lane. The agent id
      // is the fallback when no sidecar meta was written.
      const agent = { id: lane.toolUseId ?? lane.agentId, type: lane.agentType }

      try {
        const stored = await getSubagentMessages(sessionId, lane.agentId, {
          dir: this.request.cwd,
        })
        if (this.disposed || stored.length === 0) continue

        const events = [
          ...this.normalizer.announceLane(agent, lane.description),
          ...this.normalizer.normalizeHistory(this.tail(stored), agent),
          // A replayed subagent has by definition finished, so its lane opens
          // closed — otherwise every resumed lane shows a live "running" pulse.
          ...this.normalizer.closeLane(agent),
        ]
        if (events.length > 0) this.batcher.add(events)
      } catch {
        // Skip this lane; the others still replay.
      }
    }
  }

  /**
   * Cap a replay to its most recent messages.
   *
   * Long sessions run to thousands of messages, and rebuilding all of them costs
   * IPC payload and renderer nodes for scrollback nobody reads. The tail is the
   * part that provides context for what comes next.
   */
  private tail(messages: SessionMessage[]): SessionMessage[] {
    return messages.length > SessionRunner.MAX_HISTORY_MESSAGES
      ? messages.slice(-SessionRunner.MAX_HISTORY_MESSAGES)
      : messages
  }

  private buildOptions(): Options {
    const options: Options = {
      // Long-lived subprocess + token-level deltas: the two settings this whole
      // app is built around.
      includePartialMessages: true,
      // Without this, subagents emit only tool_use/tool_result — enough for a
      // progress counter but not enough to render their transcripts.
      forwardSubagentText: true,
      /*
       * `display: 'summarized'` is required to see any reasoning at all.
       *
       * Current models default to `'omitted'`, which still streams thinking blocks
       * but with the text field empty — so a UI that renders them shows nothing and
       * looks broken. Thinking happens and is billed identically either way; this
       * only controls whether a readable summary comes back.
       */
      thinking: { type: 'adaptive', display: 'summarized' },
      permissionMode: this.request.permissionMode ?? 'auto',
      cwd: this.request.cwd,
      abortController: this.abort,
      // Load the user's real CLAUDE.md, settings, and skills so this behaves like
      // the terminal they're replacing rather than a stripped-down sandbox.
      settingSources: ['user', 'project', 'local'],
    }

    if (this.request.model) options.model = this.request.model
    if (this.request.resume) {
      options.resume = this.request.resume
      if (this.request.forkSession) options.forkSession = true
    }
    return options
  }

  /**
   * Drain the SDK's message stream until it ends. This is the only reader of
   * `this.handle`; nothing else may iterate it.
   */
  private async consume(): Promise<void> {
    if (!this.handle) return

    try {
      for await (const message of this.handle) {
        if (this.disposed) break

        const events = this.normalizer.normalize(message)
        if (events.length > 0) this.batcher.add(events)

        // Capture the session id the moment it appears so a crashed or closed tab
        // is still resumable.
        if (message.type === 'system' && message.subtype === 'init' && !this.sessionId) {
          this.sessionId = message.session_id
          this.onSessionId(message.session_id)
        }
      }
    } catch (error) {
      // An abort is how we intentionally stop; it isn't a failure worth surfacing.
      if (!this.abort.signal.aborted && !this.disposed) {
        this.push({ kind: 'error', message: describeError(error) })
        this.push({ kind: 'status', status: 'error' })
      }
    } finally {
      this.finalize()
    }
  }

  /** Terminal bookkeeping for the stream, whether it ended cleanly or not. */
  private finalize(): void {
    if (!this.disposed) this.push({ kind: 'status', status: 'closed' })
    this.batcher.flush()
    this.queue.close()
  }

  /** Queue a user turn. Safe to call while the model is mid-response. */
  send(text: string): void {
    if (this.disposed || this.queue.isClosed) return

    this.batcher.add([
      { kind: 'user-message', text, agent: { id: 'main' } },
      { kind: 'status', status: 'thinking' },
    ])

    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      // The SDK fills session_id in for streaming input; it is required by the
      // type but ignored on this path.
      session_id: this.sessionId ?? '',
    } as SDKUserMessage)
  }

  /** Stop the current turn but keep the session alive for the next message. */
  async interrupt(): Promise<void> {
    if (this.disposed || !this.handle) return
    try {
      await this.handle.interrupt()
      this.push({ kind: 'status', status: 'idle' })
    } catch (error) {
      this.push({ kind: 'error', message: describeError(error) })
    }
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    if (this.disposed || !this.handle) return
    try {
      await this.handle.setPermissionMode(mode)
    } catch (error) {
      this.push({ kind: 'error', message: describeError(error) })
    }
  }

  async setModel(model?: string): Promise<void> {
    if (this.disposed || !this.handle) return
    try {
      await this.handle.setModel(model)
    } catch (error) {
      this.push({ kind: 'error', message: describeError(error) })
    }
  }

  /**
   * Permanently tear down the session and its subprocess. Idempotent.
   *
   * Order matters. Closing the queue first lets the SDK's iterator return on its
   * own, which is the graceful shutdown. Aborting after that interrupts anything
   * still in flight. Disposing the batcher last guarantees no event can be emitted
   * toward a WebContents that may already be gone.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    this.queue.close()
    if (!this.abort.signal.aborted) this.abort.abort()
    this.batcher.dispose()

    // Await the loop so `dispose()` resolving means the subprocess is really gone,
    // but never hang app shutdown on a stuck child.
    if (this.loop) {
      await Promise.race([
        this.loop.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    }
    this.handle = null
    this.loop = null
  }

  private push(event: StreamEvent): void {
    this.batcher.add([event])
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}
